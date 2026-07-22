'use strict';

process.env.NODE_ENV='test';

const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const processModule=require('node:process');
const Module=require('node:module');

const serverPath=path.resolve(__dirname,'../server.js');
function loadLifecycle(){
  const counts={listen:0,query:0,connect:0,pgSession:0};
  const app={use(){return app;},get(){return app;},post(){return app;},set(){return app;},listen(){counts.listen+=1;throw new Error('real listen attempted');}};
  const express=()=>app;
  express.static=express.urlencoded=express.json=()=>function middleware(req,res,next){next?.();};
  const session=()=>function sessionMiddleware(req,res,next){next?.();};
  const multer=()=>({single:()=>function middleware(){},fields:()=>function middleware(){},none:()=>function middleware(){}});
  multer.memoryStorage=()=>({});
  class Pool{query(){counts.query+=1;throw new Error('real query attempted');}connect(){counts.connect+=1;throw new Error('real connect attempted');}end(){return Promise.resolve();}}
  const replacements={dotenv:{config(){}},express,'express-session':session,bcryptjs:{},multer,pg:{Pool},'connect-pg-simple':()=>class PgSession{constructor(){counts.pgSession+=1;}}};
  const originalLoad=Module._load;
  Module._load=function(request,parent,isMain){return Object.hasOwn(replacements,request)?replacements[request]:originalLoad.call(this,request,parent,isMain);};
  try{return {lifecycle:require(serverPath),counts};}finally{Module._load=originalLoad;}
}
const {lifecycle,counts}=loadLifecycle();

test('server.js require가 부작용 없이 완료되고 필수 API를 export한다',()=>{
  assert.ok(lifecycle.app);
  assert.equal(typeof lifecycle.startServer,'function');
  assert.deepEqual(counts,{listen:0,query:0,connect:0,pgSession:0});
  assert.deepEqual(lifecycle.getRuntimeState(),{serverStarted:false,backgroundJobCount:0,processHandlersRegistered:false});
});

test('require만 한 격리 프로세스가 서버, DB, 타이머, 핸들러 없이 종료한다',()=>{
  const script=`
    process.env.NODE_ENV='test';
    const Module=require('node:module'),originalLoad=Module._load;
    const app={use(){return app},get(){return app},post(){return app},set(){return app},listen(){throw new Error('listen called')}};
    const express=()=>app;express.static=express.urlencoded=express.json=()=>function(){};
    const session=()=>function(){};
    const multer=()=>({single:()=>function(){},fields:()=>function(){},none:()=>function(){}});multer.memoryStorage=()=>({});
    class Pool{query(){throw new Error('query called')}connect(){throw new Error('connect called')}end(){return Promise.resolve()}}
    const replacements={dotenv:{config(){}},express,'express-session':session,bcryptjs:{},multer,pg:{Pool},'connect-pg-simple':()=>class PgSession{constructor(){throw new Error('PgSession created')}}};
    Module._load=function(request,parent,isMain){return Object.hasOwn(replacements,request)?replacements[request]:originalLoad.call(this,request,parent,isMain)};
    const before={sigterm:process.listenerCount('SIGTERM'),sigint:process.listenerCount('SIGINT'),rejection:process.listenerCount('unhandledRejection'),exception:process.listenerCount('uncaughtException')};
    const lifecycle=require(${JSON.stringify(serverPath)});
    const after={sigterm:process.listenerCount('SIGTERM'),sigint:process.listenerCount('SIGINT'),rejection:process.listenerCount('unhandledRejection'),exception:process.listenerCount('uncaughtException')};
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('process listeners changed');
    if(JSON.stringify(lifecycle.getRuntimeState())!==JSON.stringify({serverStarted:false,backgroundJobCount:0,processHandlersRegistered:false}))throw new Error('runtime started');
  `;
  const result=spawnSync(processModule.execPath,['-e',script],{encoding:'utf8',timeout:3000,env:{...process.env,NODE_ENV:'test',DATABASE_URL:'postgres://invalid.invalid/no_connection'}});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
});

test('백그라운드 작업은 5분과 10분 타이머를 한 번만 만들고 unref한다',()=>{
  const intervals=[],cleared=[];
  const setIntervalFn=(callback,interval)=>{
    const handle={callback,interval,unrefCalls:0,unref(){this.unrefCalls+=1;}};
    intervals.push(handle);
    return handle;
  };
  const clearIntervalFn=handle=>cleared.push(handle);
  lifecycle.startBackgroundJobs({setIntervalFn,clearIntervalFn});
  lifecycle.startBackgroundJobs({setIntervalFn,clearIntervalFn});
  assert.deepEqual(intervals.map(item=>item.interval),[1000*60*5,1000*60*10]);
  assert.deepEqual(intervals.map(item=>item.unrefCalls),[1,1]);
  assert.equal(lifecycle.getRuntimeState().backgroundJobCount,2);
  lifecycle.stopBackgroundJobs();
  assert.equal(cleared.length,2);
  assert.equal(lifecycle.getRuntimeState().backgroundJobCount,0);
  assert.doesNotThrow(()=>lifecycle.stopBackgroundJobs());
});

test('프로세스 핸들러는 한 번만 등록되고 원래 listener count로 복구된다',()=>{
  const events=['unhandledRejection','uncaughtException','SIGTERM','SIGINT'];
  const before=Object.fromEntries(events.map(event=>[event,process.listenerCount(event)]));
  lifecycle.registerProcessHandlers();
  lifecycle.registerProcessHandlers();
  for(const event of events)assert.equal(process.listenerCount(event),before[event]+1);
  assert.equal(lifecycle.getRuntimeState().processHandlersRegistered,true);
  lifecycle.unregisterProcessHandlers();
  lifecycle.unregisterProcessHandlers();
  for(const event of events)assert.equal(process.listenerCount(event),before[event]);
  assert.equal(lifecycle.getRuntimeState().processHandlersRegistered,false);
});

test('startServer는 schema, listen, jobs 순서로 실행하고 중복 listen하지 않는다',async()=>{
  const order=[];
  const fakeServer={close(callback){order.push('close');callback();}};
  const initializeSchema=async()=>order.push('schema');
  const listen=(port,callback)=>{order.push(`listen:${port}`);callback();return fakeServer;};
  const startJobs=()=>order.push('jobs');
  const first=await lifecycle.startServer({port:4321,initializeSchema,listen,startJobs});
  const second=await lifecycle.startServer({port:9999,initializeSchema,listen,startJobs});
  assert.equal(first,fakeServer);
  assert.equal(second,fakeServer);
  assert.deepEqual(order,['schema','listen:4321','jobs']);
  assert.equal(lifecycle.getRuntimeState().serverStarted,true);
  await lifecycle.closeRuntimeResources({endPool:async()=>order.push('pool')});
  assert.deepEqual(order,['schema','listen:4321','jobs','close','pool']);
  assert.equal(lifecycle.getRuntimeState().serverStarted,false);
});
