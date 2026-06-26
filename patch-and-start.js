const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const fixedHomeData = `async function homeData(req){
  await expireAds();
  const search=req.query.search||'', region=req.query.region||'', category=req.query.category||'', sort=req.query.sort||'default';
  const where=["v.status=$1 AND v.ad_type <> 'none' AND v.expire_at IS NOT NULL AND v.expire_at >= CURRENT_DATE"];
  const params=['active'];

  if(search){
    params.push(\`%\${search}%\`);
    where.push(\`(v.name ILIKE $\${params.length} OR v.tags ILIKE $\${params.length} OR v.description ILIKE $\${params.length})\`);
  }
  if(region){
    params.push(region);
    where.push(\`v.region=$\${params.length}\`);
  }
  if(category){
    params.push(category);
    where.push(\`v.category=$\${params.length}\`);
  }

  const orderMap={
    views:'v.views DESC,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',
    rating:'avg_rating DESC NULLS LAST,review_count DESC,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',
    reviews:'review_count DESC,avg_rating DESC NULLS LAST,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',
    latest:'v.created_at DESC,v.is_premium DESC,v.is_recommended DESC',
    default:'v.is_premium DESC,v.is_recommended DESC,v.created_at DESC'
  };
  const order=orderMap[sort]||orderMap.default;
  const vendors=await q(\`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE \${where.join(' AND ')} ORDER BY \${order}\`,params);
  const banners=await q(\`SELECT * FROM banners WHERE is_active=true ORDER BY sort_order, id DESC\`);
  const reviews=await q(\`SELECT r.*,v.name vendor_name,u.nickname FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status='visible' ORDER BY r.id DESC LIMIT 8\`);
  const notices=await q(\`SELECT * FROM notices ORDER BY is_pinned DESC,id DESC LIMIT 5\`);
  const settings=await getSettings();
  return {vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,notices:notices.rows,query:req.query,settings};
}`;

if (!source.includes('const where=["v.status=$1')) {
  const pattern = /async function homeData\(req\)\{[\s\S]*?return \{vendors:vendors\.rows,banners:banners\.rows,reviews:reviews\.rows,notices:notices\.rows,query:req\.query,settings\}; \}/;
  if (!pattern.test(source)) {
    throw new Error('homeData function patch target not found');
  }
  source = source.replace(pattern, fixedHomeData);
  fs.writeFileSync(serverPath, source, 'utf8');
  console.log('server.js homeData query patch applied');
} else {
  console.log('server.js homeData query patch already applied');
}

require('./server.js');
