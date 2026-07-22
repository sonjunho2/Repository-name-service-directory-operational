'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTestServer,runRoute}=require('./helpers/load-test-server');

const harness=loadTestServer();
const activeUser={id:7,username:'member',nickname:'회원',role:'user',status:'active',is_vendor:false,vendor_id:null};
const adminUser={...activeUser,id:1,username:'admin',role:'admin'};
const userSql=sql=>sql.includes('FROM users WHERE id=$1');
const session=user=>({user:user?{id:user.id,username:user.username,role:user.role}:undefined,save(callback){callback?.();}});
const response=rows=>({rows});

function route(method,path){return harness.findRoute(method,path);}
function assertPublicVendorSql(sql){
  assert.match(sql,/v\.status\s*=\s*'active'/);
  assert.match(sql,/COALESCE\s*\(\s*v\.ad_type\s*,\s*'none'\s*\)\s*<>\s*'none'/);
  assert.match(sql,/v\.expire_at\s+IS\s+NOT\s+NULL/i);
  assert.match(sql,/v\.expire_at\s*>=\s*CURRENT_DATE/i);
}
function activeThen(responder,user=activeUser){return (sql,params)=>{
  if(userSql(sql)){assert.match(sql,/FROM users WHERE id=\$1/);assert.deepEqual(params,[user.id]);return response([user]);}
  return responder(sql,params);
};}
async function invoke(method,path,{user,params,responder}={}){
  harness.reset(responder);
  return runRoute(route(method,path),{session:session(user),params});
}
async function expectLoginRequired(method,path,sessionValue={save(callback){callback?.();}}){
  harness.reset();
  const {res}=await runRoute(route(method,path),{session:sessionValue});
  assert.equal(res.statusCode,401);
  assert.deepEqual(res.body,{ok:false,error:'login_required'});
  assert.equal(harness.calls.query.length,0);
}

test.after(()=>harness.cleanup());

test('대상 API 라우트가 각각 로그인 미들웨어와 실제 핸들러로 한 번 등록된다',()=>{
  for(const [method,path] of [['GET','/api/favorites'],['POST','/api/favorite/:id/toggle'],['GET','/api/notifications'],['POST','/api/notifications/:id/read'],['POST','/api/notifications/read-all']]){
    const found=harness.findRoutes(method,path);
    assert.equal(found.length,1,`${method} ${path}`);
    assert.equal(found[0].handlers.length,2,`${method} ${path} handler count`);
  }
});

test('테스트 로드는 DB·listen·PgSession·런타임을 시작하지 않는다',()=>{
  assert.equal(harness.calls.listen,0);assert.equal(harness.calls.connect,0);assert.equal(harness.calls.pgSession,0);
  assert.equal(harness.calls.sessionOptions.length,1);assert.equal('store' in harness.calls.sessionOptions[0],false);
  assert.deepEqual(harness.lifecycle.getRuntimeState(),{serverStarted:false,backgroundJobCount:0,processHandlersRegistered:false});
});

test('세션 없음과 session.user 없음은 모든 API에서 DB 없이 401을 반환한다',async()=>{
  const targets=[['GET','/api/favorites'],['POST','/api/favorite/:id/toggle'],['GET','/api/notifications'],['POST','/api/notifications/:id/read'],['POST','/api/notifications/read-all']];
  for(const [method,path] of targets){await expectLoginRequired(method,path);await expectLoginRequired(method,path,session());}
});

test('누락된 user.id는 DB 없이 401을 반환한다',async()=>{
  await expectLoginRequired('GET','/api/favorites',{user:{username:'member'},save(callback){callback?.();}});
});

for(const status of ['blocked','suspended','inactive']){
  test(`${status} 사용자는 재검증 후 401을 반환한다`,async()=>{
    harness.reset((sql,params)=>{if(userSql(sql)){assert.deepEqual(params,[7]);return response([{...activeUser,status}]);}throw new Error(`unexpected query: ${sql}`);});
    const {res}=await runRoute(route('GET','/api/favorites'),{session:session(activeUser)});
    assert.equal(res.statusCode,401);assert.deepEqual(res.body,{ok:false,error:'login_required'});assert.equal(harness.calls.query.length,1);
  });
}

test('DB에서 삭제된 사용자는 재검증 후 401을 반환한다',async()=>{
  harness.reset((sql,params)=>{if(userSql(sql)){assert.deepEqual(params,[7]);return response([]);}throw new Error(`unexpected query: ${sql}`);});
  const {res}=await runRoute(route('GET','/api/notifications'),{session:session(activeUser)});
  assert.equal(res.statusCode,401);assert.deepEqual(res.body,{ok:false,error:'login_required'});
});

test('GET favorites는 현재 사용자 공개 업체 ID만 최신순으로 반환한다',async()=>{
  const ids=[{vendor_id:9},{vendor_id:3}];
  const {res}=await invoke('GET','/api/favorites',{user:activeUser,responder:activeThen((sql,params)=>{
    assert.match(sql,/FROM favorites f JOIN vendors v/);assertPublicVendorSql(sql);assert.match(sql,/f\.user_id=\$1/);assert.match(sql,/ORDER BY f\.id DESC/);assert.deepEqual(params,[7]);return response(ids);
  })});
  assert.deepEqual(res.body,{ok:true,ids:[9,3]});assert.equal(harness.calls.query.length,2);
});

test('GET favorites는 빈 목록을 반환한다',async()=>{
  const {res}=await invoke('GET','/api/favorites',{user:activeUser,responder:activeThen((sql,params)=>{assertPublicVendorSql(sql);assert.deepEqual(params,[7]);return response([]);})});
  assert.deepEqual(res.body,{ok:true,ids:[]});
});

test('favorite toggle의 0과 숫자가 아닌 ID는 400이며 음수는 현재 계약상 업체 조회 후 404다',async()=>{
  for(const id of ['0','abc']){
    const {res}=await invoke('POST','/api/favorite/:id/toggle',{user:activeUser,params:{id},responder:activeThen(sql=>{throw new Error(`unexpected query: ${sql}`);})});
    assert.equal(res.statusCode,400);assert.deepEqual(res.body,{ok:false,error:'bad_vendor_id'});assert.equal(harness.calls.query.length,1);
  }
  const {res}=await invoke('POST','/api/favorite/:id/toggle',{user:activeUser,params:{id:'-1'},responder:activeThen((sql,params)=>{assert.match(sql,/FROM vendors v/);assertPublicVendorSql(sql);assert.deepEqual(params,[-1]);return response([]);})});
  assert.equal(res.statusCode,404);assert.deepEqual(res.body,{ok:false,error:'vendor_not_found'});
});

test('favorite toggle은 존재하지 않는 업체를 404 처리한다',async()=>{
  const {res}=await invoke('POST','/api/favorite/:id/toggle',{user:activeUser,params:{id:'88'},responder:activeThen((sql,params)=>{assert.match(sql,/FROM vendors v/);assertPublicVendorSql(sql);assert.deepEqual(params,[88]);return response([]);})});
  assert.equal(res.statusCode,404);assert.deepEqual(res.body,{ok:false,error:'vendor_not_found'});
});

test('이미 즐겨찾기한 업체는 현재 사용자 조건으로 삭제하고 전체 ID를 반환한다',async()=>{
  let step=0;
  const {res}=await invoke('POST','/api/favorite/:id/toggle',{user:activeUser,params:{id:'12'},responder:activeThen((sql,params)=>{
    step+=1;
    if(step===1){assert.match(sql,/FROM vendors v/);assertPublicVendorSql(sql);assert.deepEqual(params,[12]);return response([{id:12}]);}
    if(step===2){assert.match(sql,/SELECT id FROM favorites WHERE user_id=\$1 AND vendor_id=\$2/);assert.deepEqual(params,[7,12]);return response([{id:55}]);}
    if(step===3){assert.match(sql,/DELETE FROM favorites WHERE user_id=\$1 AND vendor_id=\$2/);assert.deepEqual(params,[7,12]);return response([]);}
    assert.match(sql,/f\.user_id=\$1/);assertPublicVendorSql(sql);assert.deepEqual(params,[7]);return response([{vendor_id:3}]);
  })});
  assert.deepEqual(res.body,{ok:true,favorited:false,ids:[3]});assert.equal(step,4);
});

test('새 즐겨찾기는 현재 사용자와 업체 ID로 등록하고 전체 ID를 반환한다',async()=>{
  let step=0;
  const {res}=await invoke('POST','/api/favorite/:id/toggle',{user:activeUser,params:{id:'12'},responder:activeThen((sql,params)=>{
    step+=1;
    if(step===1){assert.match(sql,/SELECT id FROM vendors v/);assertPublicVendorSql(sql);assert.deepEqual(params,[12]);return response([{id:12}]);}
    if(step===2){assert.match(sql,/SELECT id FROM favorites WHERE user_id=\$1 AND vendor_id=\$2/);assert.deepEqual(params,[7,12]);return response([]);}
    if(step===3){assert.match(sql,/INSERT INTO favorites\(user_id,vendor_id\)/);assert.match(sql,/ON CONFLICT\(user_id,vendor_id\) DO NOTHING/);assert.deepEqual(params,[7,12]);return response([]);}
    assert.match(sql,/f\.user_id=\$1/);assertPublicVendorSql(sql);assert.deepEqual(params,[7]);return response([{vendor_id:12}]);
  })});
  assert.deepEqual(res.body,{ok:true,favorited:true,ids:[12]});assert.equal(step,4);
});

test('GET notifications는 일반 사용자의 최신 30개와 unread 수를 반환한다',async()=>{
  const items=[{id:5,is_read:false}],queries=[];
  const {res}=await invoke('GET','/api/notifications',{user:activeUser,responder:activeThen((sql,params)=>{
    queries.push(sql);assert.match(sql,/role_target='user' AND user_id=\$1/);assert.deepEqual(params,[7]);
    if(sql.includes('COUNT(*)'))return response([{cnt:2}]);assert.match(sql,/ORDER BY id DESC LIMIT 30/);return response(items);
  })});
  assert.equal(res.body.ok,true);assert.equal(res.body.unread,2);assert.deepEqual(res.body.items,items);assert.equal(typeof res.body.now,'string');assert.equal(queries.length,2);
});

test('GET notifications는 빈 목록과 0 unread를 반환한다',async()=>{
  const {res}=await invoke('GET','/api/notifications',{user:activeUser,responder:activeThen(sql=>sql.includes('COUNT(*)')?response([{cnt:0}]):response([]))});
  assert.equal(res.body.ok,true);assert.deepEqual(res.body.items,[]);assert.equal(res.body.unread,0);
});

test('관리자 알림 조회는 role_target=admin만 사용하고 user_id를 전달하지 않는다',async()=>{
  const {res}=await invoke('GET','/api/notifications',{user:adminUser,responder:activeThen((sql,params)=>{assert.match(sql,/role_target='admin'/);assert.doesNotMatch(sql,/user_id=/);assert.deepEqual(params,[]);return sql.includes('COUNT(*)')?response([{cnt:0}]):response([]);},adminUser)});
  assert.equal(res.body.ok,true);
});

test('notification read는 일반 사용자의 id와 대상 조건으로 UPDATE한다',async()=>{
  const {res}=await invoke('POST','/api/notifications/:id/read',{user:activeUser,params:{id:'44'},responder:activeThen((sql,params)=>{assert.match(sql,/UPDATE notifications SET is_read=true WHERE id=\$2 AND role_target='user' AND user_id=\$1/);assert.deepEqual(params,[7,44]);return response([]);})});
  assert.deepEqual(res.body,{ok:true});
});

test('notification read는 존재하지 않는 유효 숫자 ID도 사용자 조건을 유지하고 현재 계약상 성공한다',async()=>{
  for(const id of ['999','0']){
    const {res}=await invoke('POST','/api/notifications/:id/read',{user:activeUser,params:{id},responder:activeThen((sql,params)=>{assert.match(sql,/user_id=\$1/);assert.equal(params[0],7);assert.equal(params[1],parseInt(id||0,10));return response([]);})});
    assert.deepEqual(res.body,{ok:true});
  }
});

test('notification read의 비숫자 ID는 NaN UPDATE 후 PostgreSQL 변환 오류를 500으로 처리한다',async()=>{
  const {res}=await invoke('POST','/api/notifications/:id/read',{user:activeUser,params:{id:'abc'},responder:activeThen((sql,params)=>{
    assert.match(sql,/UPDATE notifications/);assert.match(sql,/user_id=\$1/);assert.deepEqual(params.slice(0,1),[7]);assert.equal(Number.isNaN(params[1]),true);
    const error=new Error('invalid input syntax for type integer');error.code='22P02';throw error;
  })});
  assert.equal(res.statusCode,500);assert.deepEqual(res.body,{ok:false,error:'읽음 처리 실패'});
});

test('관리자 notification read는 role_target=admin과 ID $1만 사용한다',async()=>{
  const {res}=await invoke('POST','/api/notifications/:id/read',{user:adminUser,params:{id:'44'},responder:activeThen((sql,params)=>{
    assert.match(sql,/UPDATE notifications SET is_read=true WHERE id=\$1 AND role_target='admin'/);assert.doesNotMatch(sql,/user_id=/);assert.deepEqual(params,[44]);return response([]);
  },adminUser)});
  assert.deepEqual(res.body,{ok:true});
});

test('notification read-all은 현재 사용자 대상만 갱신하며 현재 SQL에는 unread 조건이 없다',async()=>{
  const {res}=await invoke('POST','/api/notifications/read-all',{user:activeUser,responder:activeThen((sql,params)=>{assert.match(sql,/UPDATE notifications SET is_read=true WHERE role_target='user' AND user_id=\$1/);assert.doesNotMatch(sql,/is_read=false/);assert.deepEqual(params,[7]);return response([]);})});
  assert.deepEqual(res.body,{ok:true});
});

test('관리자 notification read-all은 role_target=admin만 조건으로 사용한다',async()=>{
  const {res}=await invoke('POST','/api/notifications/read-all',{user:adminUser,responder:activeThen((sql,params)=>{
    assert.match(sql,/UPDATE notifications SET is_read=true WHERE role_target='admin'/);assert.doesNotMatch(sql,/user_id=/);assert.doesNotMatch(sql,/is_read=false/);assert.deepEqual(params,[]);return response([]);
  },adminUser)});
  assert.deepEqual(res.body,{ok:true});
});
