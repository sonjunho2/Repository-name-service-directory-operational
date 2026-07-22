'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTestServer,runRoute}=require('./helpers/load-test-server');

const harness=loadTestServer();
const routePath='/boards/:slug/:id/comments';
const commentRoute=harness.findRoute('POST',routePath);
const member={id:7,username:'member',nickname:'회원',role:'user',status:'active',is_vendor:false,vendor_id:null};
const admin={id:1,username:'admin',nickname:'관리자',role:'admin',status:'active',is_vendor:false,vendor_id:null};
const freePost={id:11,title:'일반 게시글',user_id:7,status:'visible',slug:'free',layout_type:'list',comment_enabled:true,is_active:true};
const inquiryPost={id:21,title:'광고 진행 문의',user_id:7,status:'visible',slug:'ad-inquiry',layout_type:'private',comment_enabled:true,is_active:true};

const rows=value=>({rows:value});
const session=user=>({user:user?{id:user.id,username:user.username,role:user.role}:undefined,save(callback){callback?.();}});
const isRefreshUserSql=sql=>sql.includes('SELECT id,username,nickname,role,status,is_vendor,vendor_id FROM users WHERE id=$1');
const isCoreUserSql=sql=>sql.includes('SELECT id,username,nickname,role,status FROM users WHERE id=$1');
const isPostSql=sql=>sql.includes('FROM board_posts p JOIN board_categories b');
const isCommentInsert=sql=>sql.includes('INSERT INTO board_comments');
const isNotificationInsert=sql=>sql.includes('INSERT INTO notifications');
const callsMatching=predicate=>harness.calls.query.filter(call=>predicate(call.sql));

function commentResponder({user=member,post=freePost,expectedPostId=post?.id,expectedSlug=post?.slug,commentId=501,commentError,notificationHandler}={}){
  return (sql,params)=>{
    if(isRefreshUserSql(sql)){assert.deepEqual(params,[user.id]);return rows([user]);}
    if(isCoreUserSql(sql)){assert.deepEqual(params,[user.id]);return rows([user]);}
    if(isPostSql(sql)){
      assert.match(sql,/p\.id=\$1 AND b\.slug=\$2/);
      assert.deepEqual(params,[expectedPostId,expectedSlug]);
      return rows(post?[post]:[]);
    }
    if(isCommentInsert(sql)){
      assert.match(sql,/status,created_at,updated_at/);assert.match(sql,/'visible',now\(\),now\(\)/);assert.match(sql,/RETURNING id/);
      if(commentError)throw commentError;
      return rows([{id:commentId}]);
    }
    if(isNotificationInsert(sql)){
      if(!notificationHandler)throw new Error(`unexpected query: ${sql}`);
      return notificationHandler(sql,params);
    }
    throw new Error(`unexpected query: ${sql}`);
  };
}

async function invoke({user,slug='free',id='11',content='댓글',accept='application/json',responder}={}){
  harness.reset(responder);
  return runRoute(commentRoute,{session:session(user),params:{slug,id},body:{content},headers:{accept}});
}

test.after(()=>harness.cleanup());

test('댓글 라우트는 login과 실제 핸들러로 정확히 한 번 등록되고 런타임을 시작하지 않는다',()=>{
  assert.equal(harness.findRoutes('POST',routePath).length,1);
  assert.equal(commentRoute.handlers.length,2);
  assert.equal(harness.calls.listen,0);assert.equal(harness.calls.connect,0);assert.equal(harness.calls.pgSession,0);
  assert.deepEqual(harness.lifecycle.getRuntimeState(),{serverStarted:false,backgroundJobCount:0,processHandlersRegistered:false});
});

test('비로그인 HTML 댓글 요청은 DB 없이 로그인으로 이동한다',async()=>{
  const {res}=await invoke({accept:'text/html'});
  assert.equal(res.statusCode,302);assert.equal(res.body,'/login');assert.equal(harness.calls.query.length,0);
});

test('비로그인 JSON 댓글 요청은 DB 없이 login_required를 반환한다',async()=>{
  const {res}=await invoke();
  assert.equal(res.statusCode,401);assert.deepEqual(res.body,{ok:false,error:'login_required'});assert.equal(harness.calls.query.length,0);
});

for(const status of ['blocked','inactive']){
  test(`${status} 사용자는 login 재조회에서 차단되고 댓글·알림 SQL을 실행하지 않는다`,async()=>{
    const blocked={...member,status};
    for(const accept of ['text/html','application/json']){
      harness.reset((sql,params)=>{assert.equal(isRefreshUserSql(sql),true);assert.deepEqual(params,[7]);return rows([blocked]);});
      const {res}=await runRoute(commentRoute,{session:session(member),params:{slug:'free',id:'11'},body:{content:'댓글'},headers:{accept}});
      if(accept==='text/html'){assert.equal(res.statusCode,302);assert.equal(res.body,'/login');}
      else{assert.equal(res.statusCode,401);assert.deepEqual(res.body,{ok:false,error:'login_required'});}
      assert.equal(callsMatching(isPostSql).length,0);assert.equal(callsMatching(isCommentInsert).length,0);assert.equal(callsMatching(isNotificationInsert).length,0);
    }
  });
}

test('reviews와 reports는 comments_disabled 403을 그대로 전달한다',async()=>{
  for(const slug of ['reviews','reports']){
    const {res}=await invoke({user:member,slug,id:'11',responder:commentResponder({expectedPostId:11,expectedSlug:slug})});
    assert.equal(res.statusCode,403);assert.equal(res.body,'comments_disabled');assert.equal(callsMatching(isPostSql).length,0);assert.equal(callsMatching(isCommentInsert).length,0);
  }
});

test('공백 댓글은 invalid_comment_content 400을 그대로 전달한다',async()=>{
  const {res}=await invoke({user:member,content:' \t\n ',responder:commentResponder()});
  assert.equal(res.statusCode,400);assert.equal(res.body,'invalid_comment_content');assert.equal(callsMatching(isCommentInsert).length,0);
});

test('존재하지 않는 게시글은 board_post_not_found 404를 그대로 전달한다',async()=>{
  const {res}=await invoke({user:member,responder:commentResponder({post:null,expectedPostId:11,expectedSlug:'free'})});
  assert.equal(res.statusCode,404);assert.equal(res.body,'board_post_not_found');assert.equal(callsMatching(isCommentInsert).length,0);
});

test('다른 회원의 비공개 광고문의는 private_post_forbidden 403이며 알림도 없다',async()=>{
  const post={...inquiryPost,user_id:99};
  const {res}=await invoke({user:member,slug:'ad-inquiry',id:'21',responder:commentResponder({post,expectedPostId:21,expectedSlug:'ad-inquiry'})});
  assert.equal(res.statusCode,403);assert.equal(res.body,'private_post_forbidden');assert.equal(callsMatching(isCommentInsert).length,0);assert.equal(callsMatching(isNotificationInsert).length,0);
});

test('일반 게시판 댓글은 입력을 정규화해 한 번 저장하고 게시글 주소로 이동한다',async()=>{
  const responder=commentResponder({expectedPostId:11,expectedSlug:'free'});
  const wrapped=(sql,params)=>{if(isCommentInsert(sql))assert.deepEqual(params,[11,7,'저장할 댓글']);return responder(sql,params);};
  const {res}=await invoke({user:member,slug:'FREE',id:'11',content:'  저장할 댓글  ',responder:wrapped});
  assert.equal(res.statusCode,302);assert.equal(res.body,'/boards/free/11');assert.equal(callsMatching(isCommentInsert).length,1);assert.equal(callsMatching(isNotificationInsert).length,0);
});

test('광고문의 작성자 댓글은 관리자 알림을 한 번 만들고 문의 주소로 이동한다',async()=>{
  const responder=commentResponder({post:inquiryPost,expectedPostId:21,expectedSlug:'ad-inquiry',notificationHandler:(sql,params)=>{
    assert.match(sql,/INSERT INTO notifications\(user_id,role_target,type,title,message,link_url\)/);
    assert.deepEqual(params,[null,'admin','ad_inquiry_reply','광고문의에 추가 댓글이 등록되었습니다','회원님이 광고문의에 댓글을 남겼습니다.','/boards/ad-inquiry/21']);return rows([]);
  }});
  const wrapped=(sql,params)=>{if(isCommentInsert(sql))assert.deepEqual(params,[21,7,'추가 문의']);return responder(sql,params);};
  const {res}=await invoke({user:member,slug:'ad-inquiry',id:'21',content:' 추가 문의 ',responder:wrapped});
  assert.equal(res.statusCode,302);assert.equal(res.body,'/boards/ad-inquiry/21');assert.equal(callsMatching(isCommentInsert).length,1);assert.equal(callsMatching(isNotificationInsert).length,1);
});

test('광고문의 관리자 답변은 작성자 사용자 알림을 한 번 만든다',async()=>{
  const responder=commentResponder({user:admin,post:inquiryPost,expectedPostId:21,expectedSlug:'ad-inquiry',notificationHandler:(sql,params)=>{
    assert.deepEqual(params,[7,'user','ad_inquiry_answered','광고문의에 답변이 등록되었습니다','광고 진행 문의에 관리자 답변이 등록되었습니다.','/boards/ad-inquiry/21']);return rows([]);
  }});
  const wrapped=(sql,params)=>{if(isCommentInsert(sql))assert.deepEqual(params,[21,1,'관리자 답변']);return responder(sql,params);};
  const {res}=await invoke({user:admin,slug:'ad-inquiry',id:'21',content:' 관리자 답변 ',responder:wrapped});
  assert.equal(res.statusCode,302);assert.equal(res.body,'/boards/ad-inquiry/21');assert.equal(callsMatching(isNotificationInsert).length,1);
});

test('관리자가 본인 광고문의에 답변하면 댓글만 저장하고 알림은 만들지 않는다',async()=>{
  const post={...inquiryPost,user_id:1};
  const responder=commentResponder({user:admin,post,expectedPostId:21,expectedSlug:'ad-inquiry'});
  const wrapped=(sql,params)=>{if(isCommentInsert(sql))assert.deepEqual(params,[21,1,'본인 답변']);return responder(sql,params);};
  const {res}=await invoke({user:admin,slug:'ad-inquiry',id:'21',content:' 본인 답변 ',responder:wrapped});
  assert.equal(res.statusCode,302);assert.equal(res.body,'/boards/ad-inquiry/21');assert.equal(callsMatching(isCommentInsert).length,1);assert.equal(callsMatching(isNotificationInsert).length,0);
});

test('광고문의 알림 저장 실패는 이미 저장된 댓글 성공을 되돌리지 않는다',async()=>{
  const notificationError=new Error('notification insert failed');
  const responder=commentResponder({user:admin,post:inquiryPost,expectedPostId:21,expectedSlug:'ad-inquiry',notificationHandler:()=>{throw notificationError;}});
  const originalError=console.error;console.error=()=>{};
  try{
    const {res}=await invoke({user:admin,slug:'ad-inquiry',id:'21',content:'답변',responder});
    assert.equal(res.statusCode,302);assert.equal(res.body,'/boards/ad-inquiry/21');assert.equal(callsMatching(isCommentInsert).length,1);assert.equal(callsMatching(isNotificationInsert).length,1);
  }finally{console.error=originalError;}
});

test('댓글 INSERT DB 오류는 comment_create_failed 500이며 알림과 리다이렉트가 없다',async()=>{
  const responder=commentResponder({commentError:new Error('comment insert failed')});
  const {res}=await invoke({user:member,responder});
  assert.equal(res.statusCode,500);assert.equal(res.body,'comment_create_failed');assert.equal(callsMatching(isCommentInsert).length,1);assert.equal(callsMatching(isNotificationInsert).length,0);
});
