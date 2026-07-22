'use strict';

const Module=require('node:module');
const path=require('node:path');

async function loadHttpTestServer(){
  const previous={NODE_ENV:process.env.NODE_ENV,SESSION_SECRET:process.env.SESSION_SECRET,DATABASE_URL:process.env.DATABASE_URL};
  const cleanupState={environmentRestored:false,requireCacheCleared:false};
  process.env.NODE_ENV='test';process.env.SESSION_SECRET='phase7-http-test-secret';delete process.env.DATABASE_URL;
  const calls={query:[],connect:0,end:0,pgSession:0,listen:0,initializeSchema:0,startJobs:0};
  let queryResponder=(sql)=>{throw new Error(`unexpected query: ${sql}`);};
  class FakePool{
    constructor(){FakePool.instance=this;}
    query(sql,params=[]){calls.query.push({sql,params});return Promise.resolve().then(()=>queryResponder(sql,params));}
    connect(){calls.connect+=1;throw new Error('pool.connect must not run in HTTP tests');}
    end(){calls.end+=1;return Promise.resolve();}
  }
  const replacements={
    dotenv:{config(){}},pg:{Pool:FakePool},
    'connect-pg-simple':()=>class PgSession{constructor(){calls.pgSession+=1;throw new Error('PgSession must not be created in NODE_ENV=test');}}
  };
  const serverPath=path.resolve(__dirname,'../../server.js'),originalLoad=Module._load;
  delete require.cache[require.resolve(serverPath)];
  Module._load=function(request,parent,isMain){return Object.hasOwn(replacements,request)?replacements[request]:originalLoad.call(this,request,parent,isMain);};
  let lifecycle,moduleLoadRestored=false;
  try{lifecycle=require(serverPath);}finally{Module._load=originalLoad;moduleLoadRestored=Module._load===originalLoad;}
  const server=await lifecycle.startServer({
    port:0,
    initializeSchema:async()=>{calls.initializeSchema+=1;},
    listen:(port,callback)=>{calls.listen+=1;return lifecycle.app.listen(port,'127.0.0.1',callback);},
    startJobs:()=>{calls.startJobs+=1;}
  });
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('HTTP test server has no TCP address');
  const baseUrl=`http://127.0.0.1:${address.port}`;
  function reset(responder){calls.query.length=0;queryResponder=responder||((sql)=>{throw new Error(`unexpected query: ${sql}`);});}
  function createClient(){
    let cookie='',lastSetCookie='';
    return {
      get cookie(){return cookie;},get lastSetCookie(){return lastSetCookie;},setCookie(value){cookie=value||'';},
      async request(url,options={}){
        const headers=new Headers(options.headers||{});
        if(cookie&&!headers.has('cookie'))headers.set('cookie',cookie);
        let response;
        try{response=await fetch(baseUrl+url,{...options,headers,redirect:options.redirect||'manual',signal:options.signal||AbortSignal.timeout(5000)});}
        catch(error){throw new Error(`${String(options.method||'GET').toUpperCase()} ${url} failed: ${error.message}`,{cause:error});}
        lastSetCookie=response.headers.get('set-cookie')||'';
        if(lastSetCookie)cookie=lastSetCookie.split(';',1)[0];
        return response;
      }
    };
  }
  function restoreEnvironment(){for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  async function cleanup(){
    await lifecycle.closeRuntimeResources();
    delete require.cache[require.resolve(serverPath)];
    cleanupState.requireCacheCleared=!require.cache[require.resolve(serverPath)];
    restoreEnvironment();
    cleanupState.environmentRestored=Object.entries(previous).every(([key,value])=>process.env[key]===value);
  }
  return {lifecycle,server,address,baseUrl,pool:FakePool.instance,calls,reset,createClient,cleanup,cleanupState,moduleLoadRestored};
}

module.exports={loadHttpTestServer};
