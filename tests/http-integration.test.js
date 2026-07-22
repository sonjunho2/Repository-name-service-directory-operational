'use strict';

const {describe,test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const {loadHttpTestServer}=require('./helpers/load-http-test-server');

const password='phase7-secret';
const member={id:7,username:'member',password_hash:bcrypt.hashSync(password,4),nickname:'회원',role:'user',status:'active',is_vendor:false,vendor_id:null};
const post={id:11,title:'일반 게시글',user_id:7,status:'visible',slug:'free',layout_type:'list',comment_enabled:true,is_active:true};
const rows=value=>({rows:value});
const publicVendorSql=sql=>{
  assert.match(sql,/v\.status='active'/);assert.match(sql,/COALESCE\(v\.ad_type,'none'\)<>'none'/);
  assert.match(sql,/v\.expire_at IS NOT NULL/);assert.match(sql,/v\.expire_at>=CURRENT_DATE/);
};

describe('실제 Express HTTP 통합', {concurrency:false},()=>{
  let harness;
  before(async()=>{harness=await loadHttpTestServer();});
  after(async()=>{
    await harness.cleanup();
    assert.equal(harness.server.listening,false);assert.equal(harness.lifecycle.getRuntimeState().serverStarted,false);
    assert.equal(harness.lifecycle.getRuntimeState().backgroundJobCount,0);assert.equal(harness.lifecycle.getRuntimeState().processHandlersRegistered,false);
    assert.equal(harness.calls.end,1);assert.equal(harness.moduleLoadRestored,true);assert.equal(harness.cleanupState.requireCacheCleared,true);assert.equal(harness.cleanupState.environmentRestored,true);
  });

  function loginResponder(sql,params){
    if(sql.includes('SELECT * FROM users WHERE username=$1')){assert.deepEqual(params,['member']);return rows([member]);}
    if(sql.includes('UPDATE users SET last_login_at=now() WHERE id=$1')){assert.deepEqual(params,[7]);return rows([]);}
    throw new Error(`unexpected query: ${sql}`);
  }
  async function loginMemberClient(){
    const client=harness.createClient();harness.reset(loginResponder);
    const response=await client.request('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'member',password})});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/');assert.match(client.cookie,/^connect\.sid=/);
    return {client,response};
  }
  function authenticatedResponder({favoriteRows,content,notificationAllowed=false}={}){
    return (sql,params)=>{
      if(sql.includes('SELECT id,username,nickname,role,status,is_vendor,vendor_id FROM users WHERE id=$1')){assert.deepEqual(params,[7]);return rows([member]);}
      if(sql.includes('SELECT id,username,nickname,role,status FROM users WHERE id=$1')){assert.deepEqual(params,[7]);return rows([member]);}
      if(sql.includes('FROM favorites f JOIN vendors v')){assert.deepEqual(params,[7]);publicVendorSql(sql);return rows(favoriteRows||[]);}
      if(sql.includes('FROM board_posts p JOIN board_categories b')){assert.deepEqual(params,[11,'free']);return rows([post]);}
      if(sql.includes('INSERT INTO board_comments')){assert.match(sql,/'visible',now\(\),now\(\)/);assert.deepEqual(params,[11,7,content]);return rows([{id:501}]);}
      if(sql.includes('INSERT INTO notifications')&&notificationAllowed)return rows([]);
      throw new Error(`unexpected query: ${sql}`);
    };
  }

  test('임시 루프백 서버가 실제 포트에서 부작용 없이 시작된다',()=>{
    assert.equal(harness.server.listening,true);assert.equal(harness.address.address,'127.0.0.1');assert.ok(Number.isInteger(harness.address.port)&&harness.address.port>0);
    assert.deepEqual(harness.lifecycle.getRuntimeState(),{serverStarted:true,backgroundJobCount:0,processHandlersRegistered:false});
    assert.equal(harness.calls.initializeSchema,1);assert.equal(harness.calls.listen,1);assert.equal(harness.calls.startJobs,1);
    assert.equal(harness.calls.connect,0);assert.equal(harness.calls.pgSession,0);assert.equal(harness.calls.query.length,0);
  });

  test('healthz는 실제 HTTP JSON과 보안 헤더를 반환한다',async()=>{
    harness.reset((sql,params)=>{assert.equal(sql,'SELECT 1');assert.deepEqual(params,[]);return rows([{one:1}]);});
    const response=await harness.createClient().request('/healthz');const body=await response.json();
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(body.ok,true);assert.equal(body.db,true);assert.equal(typeof body.time,'string');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');assert.equal(response.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
    const permissions=response.headers.get('permissions-policy');for(const value of ['camera=()','microphone=()','geolocation=()'])assert.match(permissions,new RegExp(value.replace(/[()]/g,'\\$&')));
    assert.equal(harness.calls.query.length,1);
  });

  test('비로그인 favorites는 세션 생성과 DB 조회 없이 401이다',async()=>{
    harness.reset();const response=await harness.createClient().request('/api/favorites',{headers:{accept:'application/json'}});const body=await response.json();
    assert.equal(response.status,401);assert.deepEqual(body,{ok:false,error:'login_required'});assert.equal(harness.calls.query.length,0);assert.equal(response.headers.get('set-cookie'),null);
    assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  });

  test('교차 Origin 댓글 POST는 라우트 전에 403으로 차단된다',async()=>{
    harness.reset();const response=await harness.createClient().request('/boards/free/11/comments',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/x-www-form-urlencoded',accept:'text/html'},body:new URLSearchParams({content:'댓글'})});
    assert.equal(response.status,403);assert.equal(await response.text(),'잘못된 요청입니다.');assert.equal(harness.calls.query.length,0);assert.equal(response.headers.get('set-cookie'),null);
  });

  test('실제 bcrypt 로그인은 MemoryStore 세션 쿠키를 발급한다',async()=>{
    const {client,response}=await loginMemberClient();
    assert.match(client.lastSetCookie,/connect\.sid=/);assert.match(client.lastSetCookie,/HttpOnly/i);assert.match(client.lastSetCookie,/SameSite=Lax/i);assert.match(client.lastSetCookie,/Path=\//i);assert.doesNotMatch(client.lastSetCookie,/;\s*Secure/i);
    assert.equal(harness.calls.query.length,2);assert.equal(harness.calls.pgSession,0);assert.equal(harness.calls.connect,0);assert.equal(response.status,302);
  });

  test('로그인 쿠키로 현재 사용자의 favorites를 조회한다',async()=>{
    const {client}=await loginMemberClient();harness.reset(authenticatedResponder({favoriteRows:[{vendor_id:9},{vendor_id:3}]}));
    const response=await client.request('/api/favorites',{headers:{accept:'application/json'}});assert.deepEqual(await response.json(),{ok:true,ids:[9,3]});
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(harness.calls.query.length,2);assert.match(client.cookie,/^connect\.sid=/);
  });

  test('서로 다른 HTTP client는 세션 쿠키를 공유하지 않는다',async()=>{
    const {client:clientA}=await loginMemberClient();const clientB=harness.createClient();assert.match(clientA.cookie,/^connect\.sid=/);assert.equal(clientB.cookie,'');
    harness.reset();const response=await clientB.request('/api/favorites',{headers:{accept:'application/json'}});assert.equal(response.status,401);assert.deepEqual(await response.json(),{ok:false,error:'login_required'});assert.equal(harness.calls.query.length,0);
  });

  test('urlencoded 댓글은 같은 Origin에서 파싱되고 HTML 302로 이동한다',async()=>{
    const {client}=await loginMemberClient();harness.reset(authenticatedResponder({content:'저장할 댓글'}));
    const response=await client.request('/boards/FREE/11/comments',{method:'POST',headers:{origin:harness.baseUrl,'content-type':'application/x-www-form-urlencoded',accept:'text/html'},body:new URLSearchParams({content:'  저장할 댓글  '})});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/boards/free/11');assert.notEqual(response.headers.get('location'),'/boards/free/501');
    assert.equal(harness.calls.query.filter(call=>call.sql.includes('INSERT INTO board_comments')).length,1);assert.equal(harness.calls.query.some(call=>call.sql.includes('INSERT INTO notifications')),false);
  });

  test('JSON 댓글은 실제 JSON 파서와 redirect JSON 변환을 통과한다',async()=>{
    const {client}=await loginMemberClient();harness.reset(authenticatedResponder({content:'JSON 댓글'}));
    const response=await client.request('/boards/free/11/comments',{method:'POST',headers:{origin:harness.baseUrl,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({content:'  JSON 댓글  '})});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,redirect:'/boards/free/11'});assert.equal(response.headers.get('location'),null);
    assert.equal(harness.calls.query.some(call=>call.sql.includes('INSERT INTO notifications')),false);
  });

  test('공백 JSON 댓글은 login 재조회 후 400이며 저장하지 않는다',async()=>{
    const {client}=await loginMemberClient();harness.reset(authenticatedResponder());
    const response=await client.request('/boards/free/11/comments',{method:'POST',headers:{origin:harness.baseUrl,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({content:'   '})});
    assert.equal(response.status,400);assert.equal(await response.text(),'invalid_comment_content');assert.equal(harness.calls.query.length,1);
    assert.equal(harness.calls.query.some(call=>call.sql.includes('INSERT INTO board_comments')||call.sql.includes('INSERT INTO notifications')),false);
  });

  test('로그아웃은 MemoryStore 세션을 폐기해 기존 쿠키 접근을 차단한다',async()=>{
    const {client}=await loginMemberClient();const oldCookie=client.cookie;
    harness.reset((sql)=>{if(sql.includes('FROM banners')||sql.includes('FROM board_categories'))return rows([]);throw new Error(`unexpected query: ${sql}`);});
    const logout=await client.request('/logout');assert.equal(logout.status,302);assert.equal(logout.headers.get('location'),'/');
    harness.reset();client.setCookie(oldCookie);const response=await client.request('/api/favorites',{headers:{accept:'application/json'}});
    assert.equal(response.status,401);assert.deepEqual(await response.json(),{ok:false,error:'login_required'});assert.equal(harness.calls.query.length,0);
  });
});
