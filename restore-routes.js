module.exports=function registerRestoreRoutes(app,deps){
  const {q,bcrypt,admin,logAdmin}=deps;

  app.get('/admin/restore',admin,(req,res)=>{
    res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>백업 복원</title><style>body{margin:0;background:#080d18;color:#f5f7ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:980px;margin:40px auto;padding:24px}.box{border:1px solid #29324f;border-radius:18px;background:#101525;padding:24px}textarea,input{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid #29324f;background:#070b15;color:#fff;padding:12px}textarea{height:360px;font-family:monospace}label{display:block;margin:16px 0 8px;font-weight:800}.warn{padding:14px;border:1px solid #ff6b6b;border-radius:12px;background:rgba(255,107,107,.1);line-height:1.6}.btns{display:flex;gap:10px;margin-top:18px}button,a{height:42px;border-radius:999px;padding:0 18px;border:0;background:linear-gradient(90deg,#ff3fb4,#10d9ff);color:#fff;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.sub{color:#c8d0e8}</style></head><body><div class="wrap"><div class="box"><h1>백업 JSON 복원</h1><p class="sub">관리자 백업 파일의 내용을 붙여넣어 운영 데이터를 복원합니다.</p><div class="warn"><b>주의</b><br>복원은 현재 운영 데이터를 백업 파일 내용으로 교체합니다. 관리자 계정은 보호되며 삭제되지 않습니다. 반드시 현재 백업을 먼저 다운로드한 뒤 진행하세요.</div><form method="post" action="/admin/restore-json"><label>백업 JSON 내용</label><textarea name="backup_json" required placeholder="backup.json 파일 내용을 전체 복사해서 붙여넣으세요."></textarea><label>관리자 비밀번호</label><input type="password" name="password" required><label>확인 문구</label><input name="confirm_text" placeholder="복원" required><div class="btns"><button type="submit">복원 실행</button><a href="/admin#settings">돌아가기</a></div></form></div></div></body></html>`);
  });

  app.post('/admin/restore-json',admin,async(req,res)=>{
    const password=(req.body.password||'').trim();
    const confirmText=(req.body.confirm_text||'').trim();
    const raw=(req.body.backup_json||req.body.json||'').trim();
    if(confirmText!=='복원'||!raw)return res.redirect('/admin/restore');

    const adminUser=await q('SELECT * FROM users WHERE id=$1 AND role=$2',[req.session.user.id,'admin']);
    if(!adminUser.rows[0]||!await bcrypt.compare(password,adminUser.rows[0].password_hash))return res.redirect('/admin/restore');

    let backup;
    try{backup=JSON.parse(raw);}catch(e){await logAdmin(req,'복원 실패','system','restore','JSON 파싱 실패');return res.redirect('/admin/restore');}
    if(!backup||typeof backup!=='object'||!backup.tables||typeof backup.tables!=='object'){
      await logAdmin(req,'복원 실패','system','restore','백업 형식 오류');
      return res.redirect('/admin/restore');
    }

    const cols={
      users:['id','username','password_hash','nickname','role','status','created_at','is_vendor','vendor_id'],
      vendors:['id','name','category','region','phone','kakao_url','tags','description','business_hours','is_recommended','is_premium','image_data','status','views','created_at','ad_until','membership_type','ad_type','expire_at','banner_active','banner_until','sns_url','line_url','telegram_url','holiday_info','image_updated_at','scheduled_membership_type','scheduled_banner_active','scheduled_change_at','scheduled_change_note'],
      banners:['id','title','subtitle','link_url','image_data','position','sort_order','is_active','created_at','vendor_id'],
      reviews:['id','vendor_id','user_id','title','content','rating','status','created_at'],
      notices:['id','title','content','is_pinned','created_at'],
      inquiries:['id','type','company_name','name','phone','kakao','email','category','region','content','main_image_data','banner_image_data','status','created_at','banner_status','user_id'],
      flags:['id','type','target_id','reason','content','status','created_at','admin_memo','processed_at'],
      vendor_update_requests:['id','user_id','vendor_id','name','category','region','phone','kakao_url','business_hours','tags','description','image_data','status','admin_memo','created_at','processed_at','sns_url','line_url','telegram_url','holiday_info'],
      vendor_banner_requests:['id','user_id','vendor_id','title','subtitle','link_url','image_data','status','admin_memo','created_at','processed_at','krw_price','usdt_amount','payment_status'],
      vendor_ad_requests:['id','user_id','vendor_id','plan','period','content','status','admin_memo','created_at','processed_at','krw_price','usdt_amount','payment_status','product_type'],
      favorites:['id','user_id','vendor_id','created_at'],
      app_settings:['key','value'],
      payment_logs:['id','user_id','vendor_id','product_type','request_type','request_id','krw_price','usdt_amount','status','memo','paid_at','created_at'],
      vendor_view_logs:['id','vendor_id','user_id','created_at']
    };

    async function insertRows(table,rows){
      if(!Array.isArray(rows)||!rows.length)return;
      const allowed=cols[table];
      for(const row of rows){
        if(!row||typeof row!=='object')continue;
        if(table==='users'&&(row.role==='admin'||Number(row.id)===Number(req.session.user.id)))continue;
        const keys=allowed.filter(k=>Object.prototype.hasOwnProperty.call(row,k));
        if(!keys.length)continue;
        const placeholders=keys.map((_,i)=>'$'+(i+1)).join(',');
        const values=keys.map(k=>row[k]);
        const conflict=table==='app_settings'?' ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value':' ON CONFLICT DO NOTHING';
        await q(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${placeholders})${conflict}`,values);
      }
    }

    await q('BEGIN');
    try{
      const clearOrder=['payment_logs','vendor_view_logs','vendor_ad_requests','vendor_banner_requests','vendor_update_requests','flags','reviews','favorites','banners','inquiries','notices','vendors','app_settings'];
      for(const table of clearOrder){await q(`DELETE FROM ${table}`);}
      await q("DELETE FROM users WHERE role <> 'admin'");

      const restoreOrder=['vendors','banners','reviews','notices','inquiries','flags','vendor_update_requests','vendor_banner_requests','vendor_ad_requests','favorites','app_settings','payment_logs','vendor_view_logs','users'];
      for(const table of restoreOrder){await insertRows(table,backup.tables[table]);}

      const seqTables=['users','vendors','banners','reviews','notices','inquiries','flags','vendor_update_requests','vendor_banner_requests','vendor_ad_requests','favorites','payment_logs','vendor_view_logs'];
      for(const table of seqTables){await q(`SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}),0)+1, false)`);}

      await q('COMMIT');
      await logAdmin(req,'복원 완료','system','restore',`백업 생성일: ${backup.created_at||'-'}`);
    }catch(e){
      await q('ROLLBACK');
      console.error('restore error',e);
      await logAdmin(req,'복원 실패','system','restore',e.message||'restore error');
      return res.redirect('/admin/restore');
    }
    res.redirect('/admin#settings');
  });
};
