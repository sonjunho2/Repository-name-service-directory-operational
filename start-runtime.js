const fs = require('fs');
const path = require('path');
const Module = require('module');

const filename = path.join(__dirname, 'server.js');
let code = fs.readFileSync(filename, 'utf8');

if (!code.includes('const where=["v.status=$1')) {
  const fixedHomeData = `async function homeData(req){
  await expireAds();
  const search=req.query.search||'', region=req.query.region||'', category=req.query.category||'', sort=req.query.sort||'default';
  const where=["v.status=$1 AND v.ad_type <> 'none' AND v.expire_at IS NOT NULL AND v.expire_at >= CURRENT_DATE"];
  const p=['active'];
  if(search){p.push(\`%\${search}%\`); where.push(\`(v.name ILIKE $\${p.length} OR v.tags ILIKE $\${p.length} OR v.description ILIKE $\${p.length})\`)}
  if(region){p.push(region); where.push(\`v.region=$\${p.length}\`)}
  if(category){p.push(category); where.push(\`v.category=$\${p.length}\`)}
  const orderMap={views:'v.views DESC,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',rating:'avg_rating DESC NULLS LAST,review_count DESC,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',reviews:'review_count DESC,avg_rating DESC NULLS LAST,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',latest:'v.created_at DESC,v.is_premium DESC,v.is_recommended DESC',default:'v.is_premium DESC,v.is_recommended DESC,v.created_at DESC'};
  const order=orderMap[sort]||orderMap.default;
  const vendors=await q(\`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE \${where.join(' AND ')} ORDER BY \${order}\`,p);
  const banners=await q(\`SELECT * FROM banners WHERE is_active=true ORDER BY sort_order, id DESC\`);
  const reviews=await q(\`SELECT r.*,v.name vendor_name,u.nickname FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status='visible' ORDER BY r.id DESC LIMIT 8\`);
  const notices=await q(\`SELECT * FROM notices ORDER BY is_pinned DESC,id DESC LIMIT 5\`);
  const settings=await getSettings();
  return {vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,notices:notices.rows,query:req.query,settings};
}`;
  code = code.replace(/async function homeData\(req\)\{[\s\S]*?return \{vendors:vendors\.rows,banners:banners\.rows,reviews:reviews\.rows,notices:notices\.rows,query:req\.query,settings\}; \}/, fixedHomeData);
}

if (!code.includes("/admin/banner-requests/:id/cancel")) {
  const routes = `
app.post('/admin/banner-requests/:id/cancel',admin,async(req,res)=>{
  await q("UPDATE vendor_banner_requests SET status='cancelled',payment_status='cancelled',admin_memo=$1,processed_at=now() WHERE id=$2 AND status='new'",[(req.body.admin_memo||'cancelled by admin').slice(0,500),req.params.id]);
  await logAdmin(req,'banner request cancelled','banner_request',req.params.id,req.body.admin_memo||'');
  res.redirect('/admin#bannerRequests');
});
app.post('/admin/ad-requests/:id/cancel',admin,async(req,res)=>{
  await q("UPDATE vendor_ad_requests SET status='cancelled',payment_status='cancelled',admin_memo=$1,processed_at=now() WHERE id=$2 AND status='new'",[(req.body.admin_memo||'cancelled by admin').slice(0,500),req.params.id]);
  await logAdmin(req,'ad request cancelled','ad_request',req.params.id,req.body.admin_memo||'');
  res.redirect('/admin#adRequests');
});
`;
  code = code.replace("app.get('/admin/backup.json',admin,async(req,res)=>", routes + "app.get('/admin/backup.json',admin,async(req,res)=>");
}

const m = new Module(filename, module.parent);
m.filename = filename;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(code, filename);
