'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createBoardComment}=require('../lib/board-comments');

const activeUser={id:7,username:'member',nickname:'회원',role:'user',status:'active'};
const visiblePost={id:11,title:'게시글',user_id:7,status:'visible',slug:'free',layout_type:'list',comment_enabled:true,is_active:true};

function fakeQuery(options={}){
  const calls=[];
  const query=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('FROM users'))return {rows:options.user===null?[]:[options.user||activeUser]};
    if(sql.includes('FROM board_posts'))return {rows:options.post===null?[]:[{...visiblePost,...options.post}]};
    if(sql.includes('INSERT INTO board_comments'))return {rows:[{id:options.insertId||101}]};
    throw new Error(`unexpected query: ${sql}`);
  };
  return {query,calls};
}

function args(overrides={},options={}){
  const fake=fakeQuery(options);
  return {fake,input:{query:fake.query,userId:7,slug:'free',postId:11,content:'댓글',...overrides}};
}

async function rejects(overrides,options,code,status){
  const {input}=args(overrides,options);
  await assert.rejects(createBoardComment(input),error=>error.code===code&&error.status===status);
}

test('잘못된 userId 0을 차단한다',()=>rejects({userId:0},{},'inactive_user',403));
test('숫자가 아닌 userId를 차단한다',()=>rejects({userId:'not-a-number'},{},'inactive_user',403));
test('잘못된 postId를 차단한다',()=>rejects({postId:0},{},'invalid_comment_target',400));
test('빈 slug를 차단한다',()=>rejects({slug:'   '},{},'invalid_comment_target',400));
test('reviews slug를 차단한다',()=>rejects({slug:' Reviews '},{},'comments_disabled',403));
test('reports slug를 차단한다',()=>rejects({slug:'REPORTS'},{},'comments_disabled',403));
test('공백 댓글을 차단한다',()=>rejects({content:' \t\n '},{},'invalid_comment_content',400));
test('1001자 댓글을 차단한다',()=>rejects({content:'가'.repeat(1001)},{},'invalid_comment_content',400));

test('1자 댓글을 허용한다',async()=>{
  const {input}=args({content:'가'});
  assert.equal((await createBoardComment(input)).content,'가');
});

test('정확히 1000자 댓글을 허용한다',async()=>{
  const content='가'.repeat(1000),{input}=args({content});
  assert.equal((await createBoardComment(input)).content.length,1000);
});

test('존재하지 않는 사용자를 차단한다',()=>rejects({}, {user:null},'inactive_user',403));
test('비활성 사용자를 차단한다',()=>rejects({}, {user:{...activeUser,status:'blocked'}},'inactive_user',403));
test('존재하지 않는 게시글을 차단한다',()=>rejects({}, {post:null},'board_post_not_found',404));

for(const status of ['hidden','deleted']){
  test(`${status} 게시글을 차단한다`,()=>rejects({}, {post:{status}},'board_post_not_found',404));
}

test('비활성 게시판을 차단한다',()=>rejects({}, {post:{is_active:false}},'board_post_not_found',404));
test('comment_enabled=false 게시판을 차단한다',()=>rejects({}, {post:{comment_enabled:false}},'comments_disabled',403));

for(const slug of ['reviews','reports']){
  test(`DB의 실제 slug가 ${slug}이면 차단한다`,()=>rejects({}, {post:{slug}},'comments_disabled',403));
}

test('private 게시글에 다른 일반회원 접근을 차단한다',()=>rejects({}, {post:{layout_type:'private',user_id:99}},'private_post_forbidden',403));

test('private 게시글 작성자의 댓글을 허용한다',async()=>{
  const {input}=args({}, {post:{layout_type:'private',user_id:7}});
  assert.equal((await createBoardComment(input)).id,101);
});

test('private 게시글 관리자의 댓글을 허용한다',async()=>{
  const {input}=args({userId:1}, {user:{...activeUser,id:1,role:'admin'},post:{layout_type:'private',user_id:99}});
  assert.equal((await createBoardComment(input)).id,101);
});

test('앞뒤 공백을 제거해서 저장한다',async()=>{
  const {input,fake}=args({content:'  저장할 댓글  '});
  const result=await createBoardComment(input);
  const insert=fake.calls.find(call=>call.sql.includes('INSERT INTO board_comments'));
  assert.equal(result.content,'저장할 댓글');
  assert.equal(insert.params[2],'저장할 댓글');
});

test('1000자 초과 내용을 자동 절단하지 않는다',async()=>{
  const {input,fake}=args({content:`  ${'가'.repeat(1001)}  `});
  await assert.rejects(createBoardComment(input),error=>error.code==='invalid_comment_content');
  assert.equal(fake.calls.some(call=>call.sql.includes('INSERT INTO board_comments')),false);
});

test('정상 처리 시 INSERT를 정확히 한 번 실행한다',async()=>{
  const {input,fake}=args();
  await createBoardComment(input);
  assert.equal(fake.calls.filter(call=>call.sql.includes('INSERT INTO board_comments')).length,1);
});

test('INSERT 파라미터에 postId, userId, trim된 content가 들어간다',async()=>{
  const {input,fake}=args({postId:'11',userId:'7',content:'  내용  '});
  await createBoardComment(input);
  const insert=fake.calls.find(call=>call.sql.includes('INSERT INTO board_comments'));
  assert.deepEqual(insert.params,[11,7,'내용']);
});

test('반환값에 id, post, user, content가 포함된다',async()=>{
  const {input}=args({content:'  결과  '},{insertId:321});
  const result=await createBoardComment(input);
  assert.deepEqual(result,{id:321,post:visiblePost,user:activeUser,content:'결과'});
});
