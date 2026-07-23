'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');

const LEGACY_PASSWORD='phase8-legacy-password';
const LEGACY_SALT='$2a$04$abcdefghijklmnopqrstuu';
const LEGACY_HASH='$2a$04$abcdefghijklmnopqrstuuj5sv3VI9Ozo87p3H12hTbFrekd.v4YK';

test('bcryptjs 3 exposes the required CommonJS API',()=>{
  for(const name of ['hash','compare','hashSync','compareSync','getRounds','truncates'])assert.equal(typeof bcrypt[name],'function',name);
});

test('bcryptjs 3 accepts the correct password for a bcryptjs 2.4.3 hash',async()=>{
  assert.equal(bcrypt.compareSync(LEGACY_PASSWORD,LEGACY_HASH),true);
  assert.equal(await bcrypt.compare(LEGACY_PASSWORD,LEGACY_HASH),true);
});

test('bcryptjs 3 rejects an incorrect password for a bcryptjs 2.4.3 hash',async()=>{
  const wrong=`${LEGACY_PASSWORD}-wrong`;
  assert.equal(bcrypt.compareSync(wrong,LEGACY_HASH),false);
  assert.equal(await bcrypt.compare(wrong,LEGACY_HASH),false);
});

test('bcryptjs 3 reproduces the bcryptjs 2.4.3 deterministic fixture',()=>{
  assert.equal(bcrypt.hashSync(LEGACY_PASSWORD,LEGACY_SALT),LEGACY_HASH);
});

test('new asynchronous hashes accept only the correct password',async()=>{
  const password='phase8-new-password';
  const hash=await bcrypt.hash(password,4);
  assert.equal(await bcrypt.compare(password,hash),true);
  assert.equal(await bcrypt.compare(`${password}-wrong`,hash),false);
});

test('new hashes retain the supported bcrypt format and rounds',async()=>{
  const hash=await bcrypt.hash('phase8-format-password',4);
  assert.equal(typeof hash,'string');assert.equal(hash.length,60);
  assert.match(hash,/^\$2[aby]\$04\$/);
  assert.equal(bcrypt.getRounds(hash),4);
});

test('UTF-8 passwords below 72 bytes hash and compare exactly',async()=>{
  const password='한글-비밀번호-!@#';
  assert.ok(Buffer.byteLength(password,'utf8')<72);
  const hash=await bcrypt.hash(password,4);
  assert.equal(await bcrypt.compare(password,hash),true);
  assert.equal(await bcrypt.compare(`${password}다름`,hash),false);
});

test('truncates detects the bcrypt 72-byte boundary',()=>{
  assert.equal(bcrypt.truncates('a'.repeat(72)),false);
  assert.equal(bcrypt.truncates('a'.repeat(73)),true);
  assert.equal(bcrypt.truncates('한'.repeat(24)),false);
  assert.equal(bcrypt.truncates('한'.repeat(25)),true);
});
