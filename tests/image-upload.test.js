'use strict';

const {describe,test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {
  IMAGE_UPLOAD_MAX_BYTES,ALLOWED_IMAGE_MIME_TYPES,INVALID_IMAGE_MIME_CODE,INVALID_IMAGE_MIME_MESSAGE,
  normalizeImageMimeType,isAllowedImageMimeType,validImageBuffer,imageDataUrl,createImageUpload
}=require('../lib/image-upload');

const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0]);
const gif=Buffer.from('GIF89a!');
const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.from('!')]);
const file=(mimetype,buffer)=>({mimetype,buffer});

describe('image upload module', {concurrency:false},()=>{
  let server,baseUrl;

  before(async()=>{
    const app=express(),upload=createImageUpload();
    app.post('/upload',upload.single('image'),(req,res)=>{
      const dataUrl=imageDataUrl(req.file);
      res.json({ok:true,hasFile:!!req.file,fieldname:req.file?.fieldname||null,originalname:req.file?.originalname||null,mimetype:req.file?.mimetype||null,size:req.file?.size||0,validImage:validImageBuffer(req.file),dataUrlPrefix:dataUrl?dataUrl.slice(0,dataUrl.indexOf(',')+1):null,dataUrlLength:dataUrl?.length||0});
    });
    app.use((error,req,res,next)=>{
      const status=error.code==='LIMIT_FILE_SIZE'?413:error.code===INVALID_IMAGE_MIME_CODE?415:500;
      res.status(status).json({ok:false,error:error.code||'INTERNAL_ERROR',message:error.message});
    });
    server=await new Promise((resolve,reject)=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));instance.once('error',reject);});
    const address=server.address();baseUrl=`http://127.0.0.1:${address.port}`;
  });

  after(async()=>{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    assert.equal(server.listening,false);
  });

  async function upload(buffer,{field='image',filename='sample.png',type='image/png',timeout=5000}={}){
    const form=new FormData();form.append(field,new Blob([buffer],{type}),filename);
    return fetch(`${baseUrl}/upload`,{method:'POST',body:form,signal:AbortSignal.timeout(timeout)});
  }

  test('exports an immutable exact MIME allowlist and the 5MB limit',()=>{
    assert.equal(IMAGE_UPLOAD_MAX_BYTES,5*1024*1024);
    assert.deepEqual(ALLOWED_IMAGE_MIME_TYPES,['image/jpeg','image/jpg','image/png','image/gif','image/webp']);
    assert.equal(Object.isFrozen(ALLOWED_IMAGE_MIME_TYPES),true);
    assert.equal(INVALID_IMAGE_MIME_MESSAGE,'이미지는 JPG, PNG, GIF, WEBP만 가능합니다.');
  });

  test('normalizes MIME values',()=>{
    assert.equal(normalizeImageMimeType(' IMAGE/PNG '),'image/png');assert.equal(normalizeImageMimeType(null),'');assert.equal(normalizeImageMimeType(undefined),'');
  });

  test('allows only exact image MIME values',()=>{
    for(const mime of [...ALLOWED_IMAGE_MIME_TYPES,' IMAGE/PNG '])assert.equal(isAllowedImageMimeType(mime),true,mime);
    for(const mime of ['image/pngx','image/jpeg-extra','text/image/png','image/svg+xml','application/octet-stream','',null,undefined])assert.equal(isAllowedImageMimeType(mime),false,String(mime));
  });

  test('injects Multer at invocation time with memory storage and limits',()=>{
    const storage={},calls={memory:0,factory:0,options:null};
    function fakeMulter(options){calls.factory++;calls.options=options;return {configured:true};}
    fakeMulter.memoryStorage=()=>{calls.memory++;return storage;};
    assert.deepEqual(createImageUpload(fakeMulter),{configured:true});assert.equal(calls.memory,1);assert.equal(calls.factory,1);
    assert.equal(calls.options.storage,storage);assert.equal(calls.options.limits.fileSize,IMAGE_UPLOAD_MAX_BYTES);assert.equal(typeof calls.options.fileFilter,'function');
  });

  test('MIME filter accepts allowed values and rejects invalid values with a regular Error',()=>{
    let options;function fakeMulter(value){options=value;return value;}fakeMulter.memoryStorage=()=>({});createImageUpload(fakeMulter);
    options.fileFilter({},file(' IMAGE/PNG ',png),(error,accepted)=>{assert.equal(error,null);assert.equal(accepted,true);});
    options.fileFilter({},file('image/pngx',png),error=>{assert.ok(error instanceof Error);assert.equal(error.code,INVALID_IMAGE_MIME_CODE);assert.equal(error.message,'이미지는 JPG, PNG, GIF, WEBP만 가능합니다.');});
  });

  test('recognizes valid PNG, JPEG, JPG, GIF, and WEBP signatures',()=>{
    for(const [mime,buffer] of [['image/png',png],['image/jpeg',jpeg],['image/jpg',jpeg],['image/gif',gif],['image/webp',webp]])assert.equal(validImageBuffer(file(mime,buffer)),true,mime);
  });

  test('rejects mismatched, textual, empty, and missing buffers',()=>{
    assert.equal(validImageBuffer(file('image/png',Buffer.from('ordinary text'))),false);assert.equal(validImageBuffer(file('image/jpeg',png)),false);assert.equal(validImageBuffer(file('image/gif',webp)),false);
    assert.equal(validImageBuffer(file('image/png',Buffer.alloc(0))),false);assert.equal(validImageBuffer({mimetype:'image/png'}),false);assert.equal(validImageBuffer(null),false);
  });

  test('creates normalized data URLs whose base64 decodes to the source',()=>{
    const result=imageDataUrl(file(' IMAGE/PNG ',png));assert.match(result,/^data:image\/png;base64,/);assert.deepEqual(Buffer.from(result.split(',')[1],'base64'),png);
    assert.match(imageDataUrl(file('image/jpeg',jpeg)),/^data:image\/jpeg;base64,/);assert.match(imageDataUrl(file('image/jpg',jpeg)),/^data:image\/jpg;base64,/);assert.equal(imageDataUrl(file('image/png',Buffer.from('text'))),null);
  });

  test('real multipart PNG upload succeeds',async()=>{
    const response=await upload(png),body=await response.json();assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.hasFile,true);assert.equal(body.fieldname,'image');assert.equal(body.originalname,'sample.png');assert.equal(body.mimetype,'image/png');assert.equal(body.size,png.length);assert.equal(body.validImage,true);assert.equal(body.dataUrlPrefix,'data:image/png;base64,');assert.ok(body.dataUrlLength>body.dataUrlPrefix.length);
  });

  test('real multipart JPEG upload succeeds',async()=>{
    const response=await upload(jpeg,{filename:'sample.jpg',type:'image/jpeg'}),body=await response.json();assert.equal(response.status,200);assert.equal(body.validImage,true);assert.equal(body.dataUrlPrefix,'data:image/jpeg;base64,');
  });

  test('multipart request without a file succeeds without creating data',async()=>{
    const response=await fetch(`${baseUrl}/upload`,{method:'POST',body:new FormData(),signal:AbortSignal.timeout(5000)}),body=await response.json();assert.equal(response.status,200);assert.equal(body.hasFile,false);assert.equal(body.validImage,false);assert.equal(body.dataUrlPrefix,null);
  });

  test('real multipart rejects text/plain with the stable Korean error',async()=>{
    const response=await upload(Buffer.from('text'),{filename:'sample.txt',type:'text/plain'}),body=await response.json();assert.equal(response.status,415);assert.equal(body.error,INVALID_IMAGE_MIME_CODE);assert.equal(body.message,'이미지는 JPG, PNG, GIF, WEBP만 가능합니다.');
  });

  test('real multipart rejects SVG',async()=>{
    const response=await upload(Buffer.from('<svg/>'),{filename:'sample.svg',type:'image/svg+xml'}),body=await response.json();assert.equal(response.status,415);assert.equal(body.error,INVALID_IMAGE_MIME_CODE);
  });

  test('real multipart rejects MIME prefix lookalikes',async()=>{
    const response=await upload(png,{type:'image/pngx'}),body=await response.json();assert.equal(response.status,415);assert.equal(body.error,INVALID_IMAGE_MIME_CODE);
  });

  test('allowed MIME with invalid contents passes Multer but fails signature validation',async()=>{
    const response=await upload(Buffer.from('plain text'),{type:'image/png'}),body=await response.json();assert.equal(response.status,200);assert.equal(body.hasFile,true);assert.equal(body.validImage,false);assert.equal(body.dataUrlPrefix,null);assert.equal(body.dataUrlLength,0);
  });

  test('an exact 5MB valid PNG is accepted',async()=>{
    const buffer=Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES);png.copy(buffer);const response=await upload(buffer,{timeout:10000}),body=await response.json();assert.equal(response.status,200);assert.equal(body.size,IMAGE_UPLOAD_MAX_BYTES);assert.equal(body.validImage,true);assert.equal(body.dataUrlPrefix,'data:image/png;base64,');
  });

  test('a file one byte over 5MB is rejected',async()=>{
    const buffer=Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES+1);png.copy(buffer);const response=await upload(buffer,{timeout:10000}),body=await response.json();assert.equal(response.status,413);assert.equal(body.error,'LIMIT_FILE_SIZE');
  });

  test('an unexpected multipart field is rejected',async()=>{
    const response=await upload(png,{field:'wrong'}),body=await response.json();assert.equal(response.status,500);assert.equal(body.error,'LIMIT_UNEXPECTED_FILE');
  });
});
