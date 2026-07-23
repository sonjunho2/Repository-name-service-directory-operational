'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const expressSession=require('express-session');
const connectPgSimple=require('connect-pg-simple');

const PGStore=connectPgSimple(expressSession);

function fakePool(responder=()=>({rows:[]})){
  const calls=[];
  return {
    calls,
    endCalls:0,
    async query(sql,params=[]){calls.push({sql,params});return responder(sql,params,calls.length);},
    async end(){this.endCalls+=1;}
  };
}

function callStore(store,method,...args){
  return new Promise((resolve,reject)=>{
    store[method](...args,(error,value)=>error?reject(error):resolve(value));
  });
}

test('CommonJS factory exposes the express-session Store API',async()=>{
  const pool=fakePool();
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  assert.equal(typeof connectPgSimple,'function');
  assert.equal(typeof PGStore,'function');
  assert.equal(store instanceof expressSession.Store,true);
  for(const method of ['get','set','destroy','touch','pruneSessions','close','quotedTable'])assert.equal(typeof store[method],'function');
  await store.close();
});

test('a provided Pool uses the default table without constructor queries',async()=>{
  const pool=fakePool();
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  assert.equal(store.quotedTable(),'"session"');
  assert.deepEqual(pool.calls,[]);
  assert.equal(pool.endCalls,0);
  await store.close();
  assert.equal(pool.endCalls,0);
});

test('createTableIfMissing runs packaged table.sql once before session upserts',async()=>{
  const pool=fakePool((sql,params,index)=>{
    if(index===1)return {rows:[{to_regclass:null}]};
    if(sql.includes('RETURNING sid'))return {rows:[{sid:params[2]}]};
    return {rows:[]};
  });
  const store=new PGStore({pool,createTableIfMissing:true,pruneSessionInterval:false});
  const session={cookie:{expires:new Date('2030-01-02T03:04:05.000Z')}};
  await callStore(store,'set','phase8-session',session);
  await callStore(store,'set','phase8-session-2',session);
  assert.equal(pool.calls.length,4);
  assert.match(pool.calls[0].sql,/SELECT to_regclass/);
  assert.deepEqual(pool.calls[0].params,['"session"']);
  assert.match(pool.calls[1].sql,/CREATE TABLE "session"/);
  assert.match(pool.calls[1].sql,/PRIMARY KEY \("sid"\)/);
  assert.match(pool.calls[1].sql,/CREATE INDEX "IDX_session_expire"/);
  assert.match(pool.calls[2].sql,/INSERT INTO "session"/);
  assert.match(pool.calls[3].sql,/INSERT INTO "session"/);
  await store.close();
});

test('set preserves the session object and fixed Unix expiration in its UPSERT',async()=>{
  const pool=fakePool((sql,params)=>({rows:[{sid:params[2]}]}));
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  const expires=new Date('2031-05-06T07:08:09.000Z');
  const session={cookie:{expires},user:{id:7,role:'user'}};
  await callStore(store,'set','fixed-session',session);
  assert.match(pool.calls[0].sql,/INSERT INTO "session" .*ON CONFLICT \(sid\) DO UPDATE/);
  assert.deepEqual(pool.calls[0].params,[session,Math.ceil(expires.valueOf()/1000),'fixed-session']);
  await store.close();
});

test('get returns an object-valued PostgreSQL JSON session unchanged',async()=>{
  const expected={user:{id:7,role:'user'}};
  const pool=fakePool(()=>({rows:[{sess:expected}]}));
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  assert.deepEqual(await callStore(store,'get','object-session'),expected);
  assert.match(pool.calls[0].sql,/SELECT sess FROM "session" WHERE sid = \$1 AND expire >= to_timestamp\(\$2\)/);
  assert.equal(pool.calls[0].params[0],'object-session');
  await store.close();
});

test('get parses a legacy string-valued JSON session',async()=>{
  const pool=fakePool(()=>({rows:[{sess:'{"user":{"id":8,"role":"admin"}}'}]}));
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  assert.deepEqual(await callStore(store,'get','string-session'),{user:{id:8,role:'admin'}});
  await store.close();
});

test('get destroys only the requested sid when stored JSON is invalid',async()=>{
  const pool=fakePool((sql)=>sql.startsWith('SELECT')?{rows:[{sess:'{invalid-json'}]}:{rows:[]});
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  assert.equal(await callStore(store,'get','invalid-session'),undefined);
  assert.equal(pool.calls.length,2);
  assert.match(pool.calls[1].sql,/DELETE FROM "session" WHERE sid = \$1/);
  assert.deepEqual(pool.calls[1].params,['invalid-session']);
  await store.close();
});

test('touch updates only expiration and disableTouch performs no query',async()=>{
  const expires=new Date('2032-06-07T08:09:10.000Z');
  const session={cookie:{expires},user:{id:9}};
  const pool=fakePool(()=>({rows:[{sid:'touch-session'}]}));
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  await callStore(store,'touch','touch-session',session);
  assert.match(pool.calls[0].sql,/UPDATE "session" SET expire = to_timestamp\(\$1\) WHERE sid = \$2/);
  assert.deepEqual(pool.calls[0].params,[Math.ceil(expires.valueOf()/1000),'touch-session']);
  assert.equal(pool.calls[0].params.includes(session),false);
  const disabledPool=fakePool();
  const disabled=new PGStore({pool:disabledPool,disableTouch:true,pruneSessionInterval:false});
  await callStore(disabled,'touch','disabled-session',session);
  assert.deepEqual(disabledPool.calls,[]);
  await store.close();
  await disabled.close();
});

test('destroy deletes exactly one supplied session id',async()=>{
  const pool=fakePool();
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:false});
  await callStore(store,'destroy','destroy-session');
  assert.match(pool.calls[0].sql,/DELETE FROM "session" WHERE sid = \$1/);
  assert.deepEqual(pool.calls[0].params,['destroy-session']);
  await store.close();
});

test('close clears the unrefed prune timer without ending a provided Pool',async()=>{
  const pool=fakePool(()=>({rows:[]}));
  const store=new PGStore({pool,createTableIfMissing:false,pruneSessionInterval:60,pruneSessionRandomizedInterval:false});
  await callStore(store,'get','timer-session');
  assert.ok(store.pruneTimer);
  assert.equal(store.pruneTimer.hasRef(),false);
  await store.close();
  assert.equal(store.pruneTimer,undefined);
  assert.equal(pool.endCalls,0);
});
