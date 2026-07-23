'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const ejs=require('ejs');
const express=require('express');

const viewsDirectory=path.resolve(__dirname,'../views');
const expectedCorpusHash='29FBC6573D7FB4F4BF9753DFBE8FCD1AB245788D45BBA9F7282F0E08B8EFD760';
const lockfile=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package-lock.json'),'utf8'));
const installedVersion=lockfile.packages['node_modules/ejs'].version;

function renderCorpus(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase8-ejs-corpus-'));
  try{
    fs.mkdirSync(path.join(directory,'partials'));
    fs.writeFileSync(path.join(directory,'partials','item.ejs'),'항목:<%= label %>|<%= suffix %>','utf8');
    fs.writeFileSync(path.join(directory,'parent.ejs'),'<%- include(\'partials/item\',{label:name,suffix:\'별도\'}) %>','utf8');
    const cases=[
      {name:'escape',output:ejs.render('<%= value %>',{value:'<>&"\'한글'})},
      {name:'raw',output:ejs.render('<%- value %>',{value:'<b>한글</b>'})},
      {name:'control',output:ejs.render('<% if(ok){ %><% items.forEach(x=>{ %>[<%= x %>]<% }) %>|<%= zero %>|<%= no %>|<%= empty %>|<%= nil===null ? \'null\' : \'other\' %><% }else{ %>no<% } %>',{ok:true,items:['가','나'],zero:0,no:false,empty:'',nil:null})},
      {name:'newline-trim',output:ejs.render('A<% if(true){ -%>\nB<% } %>',{})},
      {name:'space-trim',output:ejs.render('A   <%_ if(true){ _%>   B<% } %>',{})},
      {name:'include',output:fs.readFileSync(path.join(directory,'parent.ejs'),'utf8')&&ejs.render(fs.readFileSync(path.join(directory,'parent.ejs'),'utf8'),{name:'포함'}, {filename:path.join(directory,'parent.ejs')})}
    ];
    const json=JSON.stringify(cases);
    return {cases,json,hash:crypto.createHash('sha256').update(json).digest('hex').toUpperCase()};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}

test('EJS compatibility corpus',t=>{
  const corpus=renderCorpus();
  t.diagnostic(`EJS ${installedVersion} corpus ${corpus.hash}`);
  assert.equal(corpus.cases.length,6);
  assert.equal(corpus.hash,expectedCorpusHash);
});

function withTempDir(callback){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase8-ejs-'));
  const result=callback(directory);
  if(result&&typeof result.then==='function')return result.finally(()=>fs.rmSync(directory,{recursive:true,force:true}));
  fs.rmSync(directory,{recursive:true,force:true});
  return result;
}

function renderFile(filename,data){
  return new Promise((resolve,reject)=>ejs.renderFile(filename,data,(error,html)=>error?reject(error):resolve(html)));
}

function commonLocals(){
  return {
    settings:{brand:{name:'호환성 서비스',showLogo:false,showName:true,logo:'',link:'/'},categories:['카페'],regions:['서울'],raw:{}},
    me:null,
    fmtDate:value=>value?'2026-01-02':'-',
    fmtDateTime:value=>value?'2026-01-02 03:04':'-',
    publicAdBanners:[],
    publicBoardCategories:[]
  };
}

const projectCases=[
  ['admin-login.ejs',{error:null},'관리자 로그인'],
  ['login.ejs',{mode:'login',error:null},'로그인'],
  ['inquiry.ejs',{type:'apply',title:'입점신청',done:true,error:null},'입점신청'],
  ['vendor-apply.ejs',{done:true,error:null},'업체 등록 신청'],
  ['vendor.ejs',{vendor:{id:1,name:'호환 업체',region:'서울',category:'카페'},reviews:[]},'호환 업체'],
  ['mypage.ejs',{reviews:[],favorites:[],inquiries:[]},'마이페이지'],
  ['board-list.ejs',{mode:'categories',boards:[],board:null,posts:[],recentByBoard:{},page:1,totalPages:1,qText:'',canWrite:false},'게시판'],
  ['board-write.ejs',{board:{id:1,title:'자유게시판',slug:'free',layout_type:'list',image_enabled:true},error:null,vendors:[],values:{}},'자유게시판'],
  ['board-post.ejs',{board:{id:1,title:'자유게시판',slug:'free',comment_enabled:true},post:{id:1,title:'호환 게시글',content:'본문',created_at:new Date(),views:0},comments:[],canWrite:false},'호환 게시글'],
  ['index.ejs',{query:{},vendors:[],premiumVendors:[],banners:[],notices:[],reviews:[]},'호환성 서비스'],
  ['vendor-dashboard.ejs',{vendor:null,requests:[],bannerRequests:[],adRequests:[],paymentLogs:[],viewStats:[],expiryNotice:null,pricingPreview:{},pendingPayment:null,stats:{},error:null,done:false},'업체관리'],
  ['admin.ejs',{adminSummary:{},adminListStats:{},adminBoards:[],users:[],vendors:[],banners:[],reviews:[],events:[],notices:[],inquiries:[],flags:[],vendorRequests:[],bannerRequests:[],adRequests:[],adminLogs:[],paymentLogs:[],revenueStats:{},dashboardStats:{}},'관리자']
];

test('CommonJS API and version remain available',()=>{
  assert.equal(installedVersion,'6.0.1');
  assert.equal(ejs.VERSION,undefined);
  for(const name of ['compile','render','renderFile','escapeXML','clearCache'])assert.equal(typeof ejs[name],'function');
});

test('escaped output covers HTML metacharacters and Korean text',()=>{
  assert.equal(ejs.render('<%= value %>',{value:'<>&"\'한글'}),'&lt;&gt;&amp;&#34;&#39;한글');
});

test('raw output is not escaped a second time',()=>{
  assert.equal(ejs.render('<%- value %>',{value:'<strong>한글</strong>'}),'<strong>한글</strong>');
});

test('control flow preserves arrays and falsy values',()=>{
  const template='<% if(ok){ %><% items.forEach(x=>{ %>[<%=x%>]<% }) %>|<%=zero%>|<%=no%>|<%=empty%>|<%=nil===null%><% }else{ %>no<% } %>';
  assert.equal(ejs.render(template,{ok:true,items:['가','나'],zero:0,no:false,empty:'',nil:null}),'[가][나]|0|false||true');
});

test('newline and whitespace trim syntax remains byte-exact',()=>{
  assert.equal(ejs.render('A<% if(true){ -%>\nB<% } %>',{}),'AB');
  assert.equal(ejs.render('A   <%_ if(true){ _%>   B<% } %>',{}),'AB');
});

test('compile functions are reusable with separate own-property locals',()=>{
  const compiled=ejs.compile('<%= value %>');
  assert.equal(typeof compiled,'function');
  assert.equal(compiled({value:'첫째'}),'첫째');
  assert.equal(compiled({value:'둘째'}),'둘째');
});

test('relative includes inherit parent locals and accept include locals',async()=>withTempDir(async directory=>{
  fs.mkdirSync(path.join(directory,'partials'));
  fs.writeFileSync(path.join(directory,'partials','item.ejs'),'<%=parent%>|<%=child%>|<%-html%>','utf8');
  const parent=path.join(directory,'parent.ejs');
  fs.writeFileSync(parent,"<%- include('partials/item',{child:'자식',html:'<b>raw</b>'}) %>",'utf8');
  assert.equal(await renderFile(parent,{parent:'부모'}),'부모|자식|<b>raw</b>');
}));

test('renderFile callback returns included output',async()=>withTempDir(async directory=>{
  const child=path.join(directory,'child.ejs');
  const parent=path.join(directory,'parent.ejs');
  fs.writeFileSync(child,'콜백:<%=value%>','utf8');
  fs.writeFileSync(parent,"<%- include('child') %>",'utf8');
  assert.equal(await renderFile(parent,{value:'정상'}),'콜백:정상');
}));

test('Express uses EJS 6 as its real view engine',async()=>withTempDir(async directory=>{
  fs.writeFileSync(path.join(directory,'partial.ejs'),'|<%=detail%>','utf8');
  fs.writeFileSync(path.join(directory,'page.ejs'),"<%=title%><%- include('partial') %>",'utf8');
  const app=express();
  app.set('views',directory);
  app.set('view engine','ejs');
  app.get('/',(request,response)=>response.render('page',{title:'& 제목',detail:'포함'}));
  const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
  try{
    const address=server.address();
    const result=await new Promise((resolve,reject)=>{
      const request=http.get({host:'127.0.0.1',port:address.port,path:'/'},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;});response.on('end',()=>resolve({status:response.statusCode,body}));});
      request.on('error',reject);
    });
    assert.deepEqual(result,{status:200,body:'&amp; 제목|포함'});
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}));

test('ordinary own-property locals render normally',()=>{
  assert.equal(ejs.render('<%= title %>',{title:'own-value'}),'own-value');
});

test('inherited locals are blocked by default',()=>{
  const inherited=Object.create({secret:'prototype-value'});
  inherited.visible='own-value';
  assert.equal(ejs.render('<%=visible%>|<%=typeof secret%>',inherited),'own-value|undefined');
});

test('unsafePrototypeLocals is only an explicit isolated library opt-in',()=>{
  const inherited=Object.create({secret:'prototype-value'});
  inherited.visible='own-value';
  assert.equal(ejs.render('<%=visible%>|<%=secret%>',inherited,{unsafePrototypeLocals:true}),'own-value|prototype-value');
});

test('every project EJS file compiles with its real filename',()=>{
  const files=fs.readdirSync(viewsDirectory,{recursive:true}).filter(name=>name.endsWith('.ejs')).sort();
  assert.equal(files.length,18);
  for(const name of files){
    const filename=path.join(viewsDirectory,name);
    assert.doesNotThrow(()=>ejs.compile(fs.readFileSync(filename,'utf8'),{filename,compileDebug:true}),name);
  }
});

test('all static include targets exist and legacy include syntax is absent',()=>{
  const files=fs.readdirSync(viewsDirectory,{recursive:true}).filter(name=>name.endsWith('.ejs')).sort();
  let totalIncludeCalls=0;
  let staticIncludeCount=0;
  for(const name of files){
    const filename=path.join(viewsDirectory,name);
    const source=fs.readFileSync(filename,'utf8');
    assert.doesNotMatch(source,/<%\s*include\s+[^(']/,name);
    const allCalls=[...source.matchAll(/\binclude\s*\(/g)];
    const staticCalls=[...source.matchAll(/\binclude\s*\(\s*(['"])([^'"]+)\1/g)];
    totalIncludeCalls+=allCalls.length;
    staticIncludeCount+=staticCalls.length;
    const staticCallIndexes=new Set(staticCalls.map(match=>match.index));
    const dynamicCallLocations=allCalls
      .filter(match=>!staticCallIndexes.has(match.index))
      .map(match=>{
        const before=source.slice(0,match.index);
        const line=before.split(/\r?\n/).length;
        const column=match.index-before.lastIndexOf('\n');
        return `${name}:${line}:${column}`;
      });
    assert.equal(
      allCalls.length,
      staticCalls.length,
      `${name}: dynamic or non-literal include detected at ${dynamicCallLocations.join(', ')}`
    );
    for(const match of staticCalls){
      const target=path.resolve(path.dirname(filename),match[2].endsWith('.ejs')?match[2]:`${match[2]}.ejs`);
      assert.equal(target.startsWith(`${viewsDirectory}${path.sep}`),true,`${name}: ${match[2]}`);
      assert.equal(fs.existsSync(target),true,`${name}: ${match[2]}`);
    }
  }
  assert.equal(totalIncludeCalls,15);
  assert.equal(staticIncludeCount,15);
});

test('production templates and server do not enable unsafe EJS options',()=>{
  const serverSource=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  const viewSources=fs.readdirSync(viewsDirectory,{recursive:true}).filter(name=>name.endsWith('.ejs')).map(name=>fs.readFileSync(path.join(viewsDirectory,name),'utf8')).join('\n');
  const source=`${serverSource}\n${viewSources}`;
  assert.doesNotMatch(source,/unsafePrototypeLocals/);
  assert.doesNotMatch(source,/client\s*:\s*true/);
  assert.doesNotMatch(serverSource,/res\.render\s*\([^,]+,\s*req\.(?:query|body|params)\b/);
  assert.doesNotMatch(source,/escapeFunction|outputFunctionName|['"]view options['"]|(?:open|close)?delimiter\s*:/);
});

test('representative real project templates render with explicit own-property fixtures',async t=>{
  for(const [relative,locals,marker] of projectCases){
    await t.test(relative,async()=>{
      const data=Object.assign(commonLocals(),locals);
      assert.equal(Object.keys(data).every(key=>Object.hasOwn(data,key)),true);
      const html=await renderFile(path.join(viewsDirectory,relative),data);
      assert.equal(typeof html,'string');
      assert.ok(html.length>0);
      assert.match(html,new RegExp(marker));
      assert.doesNotMatch(html,/<%[=_-]?/);
    });
  }
  ejs.clearCache();
});
