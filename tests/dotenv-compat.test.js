'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const dotenv=require('dotenv');
const packageJsonPath=path.resolve(__dirname,'../package.json');
const initDbPath=path.resolve(__dirname,'../scripts/init-db.js');

function withTempDir(callback){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase8-dotenv-'));
  try{return callback(directory);}finally{fs.rmSync(directory,{recursive:true,force:true});}
}

function runInitDb(envFile,externalEnv={}){
  return withTempDir(directory=>{
    fs.writeFileSync(path.join(directory,'.env'),envFile,'utf8');
    const childEnv={...process.env};
    for(const key of ['DATABASE_URL','ADMIN_ID','ADMIN_PASSWORD','DOTENV_KEY'])delete childEnv[key];
    Object.assign(childEnv,externalEnv);
    const script=`
      const Module=require('node:module');
      const originalLoad=Module._load;
      const records={pool:null,hash:null,admin:null,ended:false};
      class Pool{
        constructor(options){records.pool=options.connectionString;}
        async query(sql,params=[]){
          if(sql.includes('INSERT INTO users'))records.admin=params;
          if(sql.includes('SELECT count(*)::int c FROM vendors')||sql.includes('SELECT count(*)::int c FROM banners'))return {rows:[{c:1}]};
          return {rows:[]};
        }
        async end(){records.ended=true;process.stdout.write(JSON.stringify(records));}
      }
      const bcrypt={async hash(password,rounds){records.hash={password,rounds};return 'phase8-test-hash';}};
      Module._load=function(request,parent,isMain){
        if(request==='pg')return {Pool};
        if(request==='bcryptjs')return bcrypt;
        return originalLoad.call(this,request,parent,isMain);
      };
      console.log=()=>{};
      require(${JSON.stringify(initDbPath)});
    `;
    return spawnSync(process.execPath,['-e',script],{
      cwd:directory,
      encoding:'utf8',
      timeout:5000,
      env:childEnv
    });
  });
}

test('dotenv 17 exposes the required CommonJS API',()=>{
  assert.equal(typeof dotenv.config,'function');
  assert.equal(typeof dotenv.parse,'function');
  assert.equal(typeof dotenv.populate,'function');
});

test('parse preserves the dotenv text contract',()=>{
  const parsed=dotenv.parse(Buffer.from('PLAIN=value\nTRIMMED = spaced value \nEMPTY=\nCOMMENTED=kept # removed\nQUOTED="kept # hash"\nMULTILINE="first\\nsecond"\nKOREAN=한글 값\n'));
  assert.deepEqual(parsed,{PLAIN:'value',TRIMMED:'spaced value',EMPTY:'',COMMENTED:'kept',QUOTED:'kept # hash',MULTILINE:'first\nsecond',KOREAN:'한글 값'});
});

test('an explicit path loads into an isolated processEnv object',()=>withTempDir(directory=>{
  const key='PHASE8_DOTENV_ISOLATED';
  const envPath=path.join(directory,'.env');
  fs.writeFileSync(envPath,`${key}=격리 값\n`,'utf8');
  const target={};
  const result=dotenv.config({path:envPath,processEnv:target,quiet:true});
  assert.equal(result.error,undefined);
  assert.deepEqual(result.parsed,{[key]:'격리 값'});
  assert.equal(target[key],'격리 값');
  assert.equal(Object.hasOwn(process.env,key),false);
}));

test('existing environment values take precedence by default',()=>withTempDir(directory=>{
  const envPath=path.join(directory,'.env');
  fs.writeFileSync(envPath,'PHASE8_DOTENV_PRECEDENCE=file-value\n','utf8');
  const target={PHASE8_DOTENV_PRECEDENCE:'external-value'};
  const result=dotenv.config({path:envPath,processEnv:target,quiet:true});
  assert.equal(result.parsed.PHASE8_DOTENV_PRECEDENCE,'file-value');
  assert.equal(target.PHASE8_DOTENV_PRECEDENCE,'external-value');
}));

test('file values replace existing values only with explicit override',()=>withTempDir(directory=>{
  const envPath=path.join(directory,'.env');
  fs.writeFileSync(envPath,'PHASE8_DOTENV_OVERRIDE=file-value\n','utf8');
  const normal={PHASE8_DOTENV_OVERRIDE:'external-value'};
  const overridden={PHASE8_DOTENV_OVERRIDE:'external-value'};
  dotenv.config({path:envPath,processEnv:normal,quiet:true});
  dotenv.config({path:envPath,processEnv:overridden,quiet:true,override:true});
  assert.equal(normal.PHASE8_DOTENV_OVERRIDE,'external-value');
  assert.equal(overridden.PHASE8_DOTENV_OVERRIDE,'file-value');
}));

test('quiet config uses the cwd .env without advisory output',()=>withTempDir(directory=>{
  fs.writeFileSync(path.join(directory,'.env'),'PHASE8_QUIET_TEST=quiet-value\n','utf8');
  const script=`const {createRequire}=require('node:module');const requireFromRepo=createRequire(${JSON.stringify(packageJsonPath)});requireFromRepo('dotenv').config({quiet:true});process.stdout.write(process.env.PHASE8_QUIET_TEST||'');`;
  const childEnv={...process.env};
  delete childEnv.PHASE8_QUIET_TEST;
  const result=spawnSync(process.execPath,['-e',script],{cwd:directory,encoding:'utf8',env:childEnv});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'quiet-value');
  assert.equal(result.stderr,'');
}));

test('quiet config returns ENOENT without output for a missing file',()=>withTempDir(directory=>{
  const missing=path.join(directory,'missing.env');
  const script=`const {createRequire}=require('node:module');const requireFromRepo=createRequire(${JSON.stringify(packageJsonPath)});const result=requireFromRepo('dotenv').config({path:${JSON.stringify(missing)},processEnv:{},quiet:true});process.stdout.write(JSON.stringify({code:result.error?.code,parsed:result.parsed}));`;
  const result=spawnSync(process.execPath,['-e',script],{cwd:directory,encoding:'utf8',env:{...process.env}});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'{"code":"ENOENT","parsed":{}}');
  assert.equal(result.stderr,'');
}));

test('init-db loads cwd .env before creating Pool and hashing the admin password',()=>{
  const result=runInitDb('DATABASE_URL=postgres://dotenv-test.invalid/example\nADMIN_ID=phase8-dotenv-admin\nADMIN_PASSWORD=phase8-dotenv-password\n');
  assert.equal(result.status,0,result.stderr);
  const records=JSON.parse(result.stdout);
  assert.equal(records.pool,'postgres://dotenv-test.invalid/example');
  assert.deepEqual(records.hash,{password:'phase8-dotenv-password',rounds:10});
  assert.deepEqual(records.admin,['phase8-dotenv-admin','phase8-test-hash']);
  assert.equal(records.ended,true);
});

test('init-db preserves externally injected environment values over cwd .env',()=>{
  const result=runInitDb('DATABASE_URL=postgres://file.invalid/example\nADMIN_ID=file-admin\nADMIN_PASSWORD=file-password\n',{
    DATABASE_URL:'postgres://external.invalid/example',
    ADMIN_ID:'external-admin',
    ADMIN_PASSWORD:'external-password'
  });
  assert.equal(result.status,0,result.stderr);
  const records=JSON.parse(result.stdout);
  assert.equal(records.pool,'postgres://external.invalid/example');
  assert.deepEqual(records.hash,{password:'external-password',rounds:10});
  assert.deepEqual(records.admin,['external-admin','phase8-test-hash']);
  assert.equal(records.ended,true);
});
