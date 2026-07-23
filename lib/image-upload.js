'use strict';

const IMAGE_UPLOAD_MAX_BYTES=5*1024*1024;
const ALLOWED_IMAGE_MIME_TYPES=Object.freeze(['image/jpeg','image/jpg','image/png','image/gif','image/webp']);
const INVALID_IMAGE_MIME_CODE='INVALID_IMAGE_MIME';
const INVALID_IMAGE_MIME_MESSAGE='이미지는 JPG, PNG, GIF, WEBP만 가능합니다.';

function normalizeImageMimeType(value){return value==null?'':String(value).trim().toLowerCase();}
function isAllowedImageMimeType(value){return ALLOWED_IMAGE_MIME_TYPES.includes(normalizeImageMimeType(value));}
function validImageBuffer(file){
  if(!file||!file.buffer||!file.mimetype)return false;
  const b=file.buffer,mime=normalizeImageMimeType(file.mimetype);
  if(mime==='image/png')return b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
  if(mime==='image/jpeg'||mime==='image/jpg')return b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  if(mime==='image/gif')return b.length>6&&b.slice(0,3).toString()==='GIF';
  if(mime==='image/webp')return b.length>12&&b.slice(0,4).toString()==='RIFF'&&b.slice(8,12).toString()==='WEBP';
  return false;
}
function imageDataUrl(file){return validImageBuffer(file)?`data:${normalizeImageMimeType(file.mimetype)};base64,${file.buffer.toString('base64')}`:null;}
function createImageUpload(multerImpl=require('multer')){
  // Multer 1.x/Busboy emits LIMIT_FILE_SIZE when the byte count reaches the
  // configured value. Its exclusive runtime ceiling must therefore be one
  // byte above the public inclusive 5MB contract.
  const fileSize=multerImpl.MulterError?IMAGE_UPLOAD_MAX_BYTES+1:IMAGE_UPLOAD_MAX_BYTES;
  return multerImpl({storage:multerImpl.memoryStorage(),limits:{fileSize},fileFilter(req,file,cb){
    if(isAllowedImageMimeType(file&&file.mimetype))return cb(null,true);
    const error=new Error(INVALID_IMAGE_MIME_MESSAGE);error.code=INVALID_IMAGE_MIME_CODE;return cb(error);
  }});
}

module.exports={IMAGE_UPLOAD_MAX_BYTES,ALLOWED_IMAGE_MIME_TYPES,INVALID_IMAGE_MIME_CODE,INVALID_IMAGE_MIME_MESSAGE,normalizeImageMimeType,isAllowedImageMimeType,validImageBuffer,imageDataUrl,createImageUpload};
