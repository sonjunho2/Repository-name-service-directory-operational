'use strict';

const Module=require('node:module');
const path=require('node:path');

function loadTestServer(){
  process.env.NODE_ENV='test';
  const routes=[],calls={query:[],connect:0,end:0,listen:0,pgSession:0,sessionOptions:[]};
  let queryResponder=(sql)=>{throw new Error(`unexpected query: ${sql}`);};
  const app={
    use(){return app;},
    get(route,...handlers){if(typeof route==='string'&&handlers.length)routes.push({method:'GET',path:route,handlers});return app;},
    post(route,...handlers){routes.push({method:'POST',path:route,handlers});return app;},
    set(){return app;},
    listen(){calls.listen+=1;throw new Error('app.listen must not run in API route tests');}
  };
  const express=()=>app;
  express.static=express.urlencoded=express.json=()=>function middleware(req,res,next){next?.();};
  const session=options=>{calls.sessionOptions.push(options);return function sessionMiddleware(req,res,next){next?.();};};
  const multer=()=>({single:()=>function middleware(req,res,next){next?.();},fields:()=>function middleware(req,res,next){next?.();},none:()=>function middleware(req,res,next){next?.();}});
  multer.memoryStorage=()=>({});
  class FakePool{
    constructor(){FakePool.instance=this;}
    query(sql,params=[]){calls.query.push({sql,params});return Promise.resolve().then(()=>queryResponder(sql,params));}
    connect(){calls.connect+=1;throw new Error('pool.connect must not run in API route tests');}
    end(){calls.end+=1;return Promise.resolve();}
  }
  const replacements={
    dotenv:{config(){}},express,'express-session':session,
    bcryptjs:{hash:async value=>String(value),compare:async()=>false},multer,pg:{Pool:FakePool},
    'connect-pg-simple':()=>class PgSession{constructor(){calls.pgSession+=1;throw new Error('PgSession must not be created in NODE_ENV=test');}}
  };
  const serverPath=path.resolve(__dirname,'../../server.js'),originalLoad=Module._load;
  delete require.cache[require.resolve(serverPath)];
  Module._load=function(request,parent,isMain){return Object.hasOwn(replacements,request)?replacements[request]:originalLoad.call(this,request,parent,isMain);};
  let lifecycle;
  try{lifecycle=require(serverPath);}finally{Module._load=originalLoad;}
  function findRoutes(method,route){return routes.filter(item=>item.method===method.toUpperCase()&&item.path===route);}
  function findRoute(method,route){const found=findRoutes(method,route);if(found.length!==1)throw new Error(`expected one route: ${method} ${route}, found ${found.length}`);return found[0];}
  function reset(responder){calls.query.length=0;calls.connect=0;queryResponder=responder||((sql)=>{throw new Error(`unexpected query: ${sql}`);});}
  function cleanup(){delete require.cache[require.resolve(serverPath)];}
  return {lifecycle,app,routes,pool:FakePool.instance,calls,findRoute,findRoutes,reset,cleanup};
}

async function runRoute(route,options={}){
  const req={
    params:{...(options.params||{})},query:{...(options.query||{})},body:{...(options.body||{})},headers:{accept:'application/json',...(options.headers||{})},
    session:options.session||{save(callback){callback?.();}},path:options.path||route.path,method:route.method,protocol:'http',ip:'127.0.0.1',
    get(name){return this.headers[String(name).toLowerCase()];}
  };
  const res={statusCode:200,body:undefined,headers:{},headersSent:false,finished:false,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;this.headersSent=true;this.finished=true;return this;},
    send(body){this.body=body;this.headersSent=true;this.finished=true;return this;},
    redirect(...args){this.statusCode=args.length>1?args[0]:302;this.body=args.at(-1);this.headersSent=true;this.finished=true;return this;},
    end(){this.headersSent=true;this.finished=true;return this;},setHeader(name,value){this.headers[String(name).toLowerCase()]=value;}
  };
  let nextError;
  for(const handler of route.handlers){
    if(res.finished)break;
    let nextCalled=false;
    await handler(req,res,error=>{nextCalled=true;if(error)nextError=error;});
    if(nextError)throw nextError;
    if(!nextCalled&&!res.finished)break;
  }
  return {req,res};
}

module.exports={loadTestServer,runRoute};
