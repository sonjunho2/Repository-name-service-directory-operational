'use strict';

function boardCommentError(code,status){
  const error=new Error(code);
  error.code=code;
  error.status=status;
  return error;
}

async function createBoardComment({query,userId,slug,postId,content}){
  const uid=Number(userId),id=Number(postId),safeSlug=String(slug||'').trim().toLowerCase(),safeContent=String(content||'').trim();
  if(!Number.isInteger(uid)||uid<=0)throw boardCommentError('inactive_user',403);
  if(!Number.isInteger(id)||id<=0||!safeSlug)throw boardCommentError('invalid_comment_target',400);
  if(['reviews','reports'].includes(safeSlug))throw boardCommentError('comments_disabled',403);
  if(safeContent.length<1||safeContent.length>1000)throw boardCommentError('invalid_comment_content',400);
  const user=(await query("SELECT id,username,nickname,role,status FROM users WHERE id=$1",[uid])).rows[0];
  if(!user||user.status!=='active')throw boardCommentError('inactive_user',403);
  const post=(await query(`SELECT p.id,p.title,p.user_id,p.status,b.slug,b.layout_type,b.comment_enabled,b.is_active FROM board_posts p JOIN board_categories b ON b.id=p.board_id WHERE p.id=$1 AND b.slug=$2`,[id,safeSlug])).rows[0];
  if(!post||post.status!=='visible'||!post.is_active)throw boardCommentError('board_post_not_found',404);
  if(['reviews','reports'].includes(post.slug)||!post.comment_enabled)throw boardCommentError('comments_disabled',403);
  if(post.layout_type==='private'&&user.role!=='admin'&&Number(user.id)!==Number(post.user_id))throw boardCommentError('private_post_forbidden',403);
  const saved=await query("INSERT INTO board_comments(post_id,user_id,content,status,created_at,updated_at) VALUES($1,$2,$3,'visible',now(),now()) RETURNING id",[id,uid,safeContent]);
  return {id:saved.rows[0].id,post,user,content:safeContent};
}

module.exports={createBoardComment,boardCommentError};
