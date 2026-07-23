'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {loadHttpTestServer}=require('./helpers/load-http-test-server');

const root=path.resolve(__dirname,'..');
const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');

async function withServer(configure,run){
  const app=express();
  configure(app);
  const server=await new Promise((resolve,reject)=>{
    const value=app.listen(0,'127.0.0.1',()=>resolve(value));
    value.once('error',reject);
  });
  const address=server.address();
  try{return await run(`http://127.0.0.1:${address.port}`);}
  finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

test('CommonJS API exposes Express 5.2.1 built-ins',()=>{
  const packageFile=path.join(path.dirname(require.resolve('express')),'package.json');
  const version=JSON.parse(fs.readFileSync(packageFile,'utf8')).version;
  assert.equal(typeof express,'function');
  assert.equal(version,'5.2.1');
  for(const name of ['Router','json','urlencoded','static','raw','text'])assert.equal(typeof express[name],'function',name);
});

test('application GET and POST routes return exact JSON',async()=>withServer(app=>{
  app.use(express.json());
  app.get('/get',(req,res)=>res.json({method:req.method}));
  app.post('/post',(req,res)=>res.json({method:req.method,body:req.body}));
},async base=>{
  assert.deepEqual(await (await fetch(`${base}/get`)).json(),{method:'GET'});
  assert.deepEqual(await (await fetch(`${base}/post`,{method:'POST',headers:{'content-type':'application/json'},body:'{"ok":true}'})).json(),{method:'POST',body:{ok:true}});
}));

test('Router mounts and dispatches on Express 5',async()=>withServer(app=>{
  const router=express.Router();router.get('/route',(req,res)=>res.json({ok:true}));app.use('/mounted',router);
},async base=>{const response=await fetch(`${base}/mounted/route`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});}));

test('project server loads with real Express 5 without runtime side effects',async()=>{
  const harness=await loadHttpTestServer();
  try{
    assert.equal(typeof harness.lifecycle.app,'function');
    assert.equal(typeof harness.lifecycle.startServer,'function');
    assert.equal(harness.calls.connect,0);assert.equal(harness.calls.pgSession,0);assert.equal(harness.calls.listen,1);
  }finally{await harness.cleanup();}
});

test('all project route declarations are static or explicitly inventoried templates',()=>{
  const routePattern=/app\.(get|post|put|patch|delete|options|head|all)\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  const routes=[...serverSource.matchAll(routePattern)].map(match=>({method:match[1],path:match[2].slice(1,-1)}));
  assert.ok(routes.length>100,`route inventory unexpectedly small: ${routes.length}`);
  const dynamic=routes.filter(route=>route.path.includes('${'));
  assert.deepEqual(dynamic,[
    {method:'post',path:'/admin/board-posts/:id/${path}'},
    {method:'post',path:'/admin/board-comments/:id/${path}'}
  ]);
  for(const route of routes.filter(route=>!route.path.includes('${'))){
    assert.doesNotMatch(route.path,/(^|\/)\*(?:\/|$)|:[A-Za-z_$][\w$]*\?|\[[^\]]+\]|\([^)]*\)/,`${route.method} ${route.path}`);
  }
});

test('removed APIs and legacy response signatures are absent',()=>{
  for(const pattern of [/app\.del\s*\(/,/req\.param\s*\(/,/res\.sendfile\s*\(/,/express\.static\.mime/,/res\.(?:redirect|location)\s*\(\s*['"]back['"]/,/res\.(?:send|json|jsonp)\s*\(\s*(?:['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*,\s*\d+/,/res\.redirect\s*\(\s*(?:['"][^'"]*['"]|[A-Za-z_$][\w$]*)\s*,\s*\d+/])assert.doesNotMatch(serverSource,pattern);
});

test('project query use is read-only and scalar-oriented',()=>{
  assert.match(serverSource,/req\.query/);
  assert.doesNotMatch(serverSource,/req\.query\s*=(?!=)|req\.query\.[A-Za-z0-9_$]+\s*=(?!=)/);
});

test('scalar query parser returns own string properties safely',async()=>withServer(app=>{
  app.get('/query',(req,res)=>res.json({query:req.query,own:Object.hasOwn(req.query,'search'),polluted:req.query.polluted}));
},async base=>{
  const response=await fetch(`${base}/query?search=hello&region=${encodeURIComponent('서울')}&page=2&__proto__[polluted]=yes`);
  const body=await response.json();assert.equal(body.query.search,'hello');assert.equal(body.query.region,'서울');assert.equal(body.query.page,'2');assert.equal(body.own,true);assert.equal(body.polluted,undefined);
}));

test('req.query remains readable through the Express getter contract',async()=>withServer(app=>{
  app.get('/query',(req,res)=>res.json({first:req.query.value,second:req.query.value}));
},async base=>assert.deepEqual(await (await fetch(`${base}/query?value=stable`)).json(),{first:'stable',second:'stable'})));

test('extended urlencoded parser preserves nested Korean data and arrays',async()=>withServer(app=>{
  app.use(express.urlencoded({extended:true}));app.post('/form',(req,res)=>res.json(req.body));
},async base=>{
  const body='profile[name]=%ED%99%8D%EA%B8%B8%EB%8F%99&profile[role]=user&tags[]=a&tags[]=b';
  assert.deepEqual(await (await fetch(`${base}/form`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body})).json(),{profile:{name:'홍길동',role:'user'},tags:['a','b']});
}));

test('JSON parser preserves objects arrays and Korean text',async()=>withServer(app=>{
  app.use(express.json());app.post('/json',(req,res)=>res.json(req.body));
},async base=>{
  const value={nested:{name:'서울'},items:[1,2]};assert.deepEqual(await (await fetch(`${base}/json`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)})).json(),value);
}));

test('invalid JSON reaches error middleware without unhandled rejection',async()=>withServer(app=>{
  app.use(express.json());app.post('/json',(req,res)=>res.json(req.body));app.use((err,req,res,next)=>res.status(err.status||500).json({type:err.type||'error'}));
},async base=>{
  const response=await fetch(`${base}/json`,{method:'POST',headers:{'content-type':'application/json'},body:'{"broken"'});assert.ok(response.status>=400&&response.status<500);assert.equal((await response.json()).type,'entity.parse.failed');
}));

test('async Promise rejection automatically reaches error middleware once',async()=>withServer(app=>{
  let errors=0;app.get('/async-error',async()=>{throw new Error('phase8-express5-async');});app.use((err,req,res,next)=>res.status(500).json({errors:++errors,message:err.message}));
},async base=>{const response=await fetch(`${base}/async-error`);assert.equal(response.status,500);assert.deepEqual(await response.json(),{errors:1,message:'phase8-express5-async'});}));

test('project async rejection reaches its final 500 handler and server survives',async()=>{
  const harness=await loadHttpTestServer();harness.reset(()=>{throw new Error('phase8-project-async');});
  const originalError=console.error,errors=[];console.error=(...args)=>errors.push(args);
  try{
    const first=await harness.createClient().request('/');assert.equal(first.status,500);assert.match(await first.text(),/오류/);
    const second=await harness.createClient().request('/healthz');assert.equal(second.status,500);
    assert.ok(errors.some(args=>args.some(value=>String(value).includes('phase8-project-async'))));
  }finally{console.error=originalError;await harness.cleanup();}
});

test('synchronous throw reaches four-argument error middleware',async()=>withServer(app=>{
  let errors=0;app.get('/sync',()=>{throw new Error('sync-marker');});app.use((err,req,res,next)=>res.status(500).json({errors:++errors,message:err.message}));
},async base=>assert.deepEqual(await (await fetch(`${base}/sync`)).json(),{errors:1,message:'sync-marker'})));

test('final 404 follows normal routes and is distinct from error middleware',async()=>withServer(app=>{
  app.get('/exists',(req,res)=>res.send('ok'));app.use((req,res)=>res.status(404).send('missing'));app.use((err,req,res,next)=>res.status(500).send('error'));
},async base=>{assert.equal((await fetch(`${base}/exists`)).status,200);const missing=await fetch(`${base}/missing`);assert.equal(missing.status,404);assert.equal(await missing.text(),'missing');}));

test('route parameters decode independently from query values',async()=>withServer(app=>{
  app.get('/boards/:slug/:id',(req,res)=>res.json({params:req.params,query:req.query}));app.use((req,res)=>res.sendStatus(404));
},async base=>{const body=await (await fetch(`${base}/boards/${encodeURIComponent('서울 게시판')}/42?id=query`)).json();assert.deepEqual(body.params,{slug:'서울 게시판',id:'42'});assert.equal(body.query.id,'query');}));

test('Express 5 rejects legacy path-to-regexp syntax',()=>{
  for(const legacy of ['/*','/user/:id?','/file.:ext?'])assert.throws(()=>express().get(legacy,()=>{}),Error,legacy);
});

test('redirect signatures preserve status and Location',async()=>withServer(app=>{
  app.get('/default',(req,res)=>res.redirect('/target'));app.get('/permanent',(req,res)=>res.redirect(301,'/target'));app.get('/target',(req,res)=>res.send('target'));
},async base=>{const a=await fetch(`${base}/default`,{redirect:'manual'}),b=await fetch(`${base}/permanent`,{redirect:'manual'});assert.equal(a.status,302);assert.equal(a.headers.get('location'),'/target');assert.equal(b.status,301);assert.equal(b.headers.get('location'),'/target');}));

test('status accepts integers in range and forwards invalid values',async()=>withServer(app=>{
  app.get('/empty',(req,res)=>res.status(204).end());app.get('/low',(req,res)=>res.status(99).end());app.get('/float',(req,res)=>res.status(200.5).end());app.use((err,req,res,next)=>res.status(500).json({error:true}));
},async base=>{assert.equal((await fetch(`${base}/empty`)).status,204);for(const route of ['low','float']){const response=await fetch(`${base}/${route}`);assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:true});}}));

test('static JavaScript uses a JavaScript MIME type and blocks traversal',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'express5-static-'));
  fs.writeFileSync(path.join(directory,'app.js'),'globalThis.phase8=true;','utf8');
  try{await withServer(app=>app.use(express.static(directory)),async base=>{const response=await fetch(`${base}/app.js`);assert.equal(response.status,200);assert.match(response.headers.get('content-type')||'',/javascript/);assert.equal(await response.text(),'globalThis.phase8=true;');assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status,404);});}
  finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('static dotfiles and hidden directories are blocked by default',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'express5-dotfiles-'));fs.mkdirSync(path.join(directory,'.hidden'));fs.writeFileSync(path.join(directory,'visible.txt'),'visible');fs.writeFileSync(path.join(directory,'.secret'),'phase8-sensitive-secret');fs.writeFileSync(path.join(directory,'.hidden','value.txt'),'phase8-sensitive-hidden');
  try{await withServer(app=>app.use(express.static(directory)),async base=>{assert.equal((await fetch(`${base}/visible.txt`)).status,200);for(const name of ['.secret','.hidden/value.txt']){const response=await fetch(`${base}/${name}`);assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/phase8-sensitive/);}});}
  finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('real EJS 6 view engine renders escaped HTML',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'express5-ejs-'));fs.writeFileSync(path.join(directory,'page.ejs'),'<p><%= value %></p>');
  try{await withServer(app=>{app.set('views',directory);app.set('view engine','ejs');app.get('/',(req,res)=>res.render('page',{value:'<서울>'}));},async base=>{const response=await fetch(base);assert.equal(response.status,200);assert.equal(await response.text(),'<p>&lt;서울&gt;</p>');});}
  finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('project healthz runs on Express 5 with fake Pool and security headers',async()=>{
  const harness=await loadHttpTestServer();harness.reset(sql=>{assert.match(sql,/SELECT 1/);return {rows:[{}]};});
  try{const response=await harness.createClient().request('/healthz');assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.db,true);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');}
  finally{await harness.cleanup();}
});
