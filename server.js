require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), multer=require('multer');
const {Pool}=require('pg'); const PgSession=require('connect-pg-simple')(session);
const app=express(); const upload=multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024}, fileFilter:(req,file,cb)=>{/image\/(jpeg|png|gif|jpg)/.test(file.mimetype)?cb(null,true):cb(new Error('이미지는 JPG, PNG, GIF만 가능합니다.'))}});
const pool=new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_URL?.includes('supabase')?{rejectUnauthorized:false}:undefined});
const q=(s,p=[])=>pool.query(s,p); const img=f=>f?`data:${f.mimetype};base64,${f.buffer.toString('base64')}`:null;
async function ensureSchema(){await q('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kakao_url text'); await q(`CREATE TABLE IF NOT EXISTS inquiries(id SERIAL PRIMARY KEY,type text,company_name text,name text,phone text,kakao text,email text,category text,region text,content text,main_image_data text,banner_image_data text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS banner_status text DEFAULT 'new'"); await q(`CREATE TABLE IF NOT EXISTS flags(id SERIAL PRIMARY KEY,type text,target_id int,reason text,content text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS admin_memo text"); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS processed_at timestamp"); await q(`CREATE TABLE IF NOT EXISTS app_settings(key text PRIMARY KEY, value text DEFAULT '')`); await q("INSERT INTO app_settings(key,value) VALUES('categories','카페\n뷰티\n맛집\n교육\n기타') ON CONFLICT (key) DO NOTHING"); await q("INSERT INTO app_settings(key,value) VALUES('regions','서울\n부산\n대구\n인천\n광주\n대전\n제주') ON CONFLICT (key) DO NOTHING"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_id int"); await q(`CREATE TABLE IF NOT EXISTS vendor_update_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,name text,category text,region text,phone text,kakao_url text,business_hours text,tags text,description text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_banner_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,title text,subtitle text,link_url text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_ad_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,plan text,period text,content text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS ad_until date"); await q(`CREATE TABLE IF NOT EXISTS favorites(id SERIAL PRIMARY KEY,user_id int,vendor_id int,created_at timestamp DEFAULT now(),UNIQUE(user_id,vendor_id))`);}
app.set('view engine','ejs'); app.use(express.urlencoded({extended:true,limit:'10mb'})); app.use(express.json({limit:'10mb'})); app.use('/public',express.static('public'));
app.use(session({store:new PgSession({pool,createTableIfMissing:true}), secret:process.env.SESSION_SECRET||'dev-secret', resave:false, saveUninitialized:false, cookie:{maxAge:1000*60*60*12}}));
app.use((req,res,next)=>{res.locals.me=req.session.user||null; next();});
function admin(req,res,next){ if(req.session.user?.role==='admin') return next(); res.redirect('/admin/login'); }
function login(req,res,next){ if(req.session.user) return next(); res.redirect('/login'); }


async function expireAds(){
  await q("UPDATE vendors SET is_premium=false WHERE ad_until IS NOT NULL AND ad_until < CURRENT_DATE");
}

async function getSettings(){const r=await q('SELECT key,value FROM app_settings'); const raw=Object.fromEntries(r.rows.map(x=>[x.key,x.value||''])); const split=v=>(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); return {raw,categories:split(raw.categories),regions:split(raw.regions)};}
async function homeData(req){ await expireAds(); const search=req.query.search||'', region=req.query.region||'', category=req.query.category||'', sort=req.query.sort||'default'; let where=['status=$1'], p=['active']; if(search){p.push(`%${search}%`); where.push(`(name ILIKE $${p.length} OR tags ILIKE $${p.length} OR description ILIKE $${p.length})`)} if(region){p.push(region); where.push(`region=$${p.length}`)} if(category){p.push(category); where.push(`category=$${p.length}`)} const orderMap={views:'views DESC,is_premium DESC,is_recommended DESC,created_at DESC',rating:'avg_rating DESC NULLS LAST,review_count DESC,is_premium DESC,is_recommended DESC,created_at DESC',reviews:'review_count DESC,avg_rating DESC NULLS LAST,is_premium DESC,is_recommended DESC,created_at DESC',latest:'created_at DESC,is_premium DESC,is_recommended DESC',default:'is_premium DESC,is_recommended DESC,created_at DESC'}; const order=orderMap[sort]||orderMap.default; const vendors=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count , (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE ${where.join(' AND ')} ORDER BY ${order}`,p); const banners=await q(`SELECT * FROM banners WHERE is_active=true ORDER BY sort_order, id DESC`); const reviews=await q(`SELECT r.*,v.name vendor_name,u.nickname FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status='visible' ORDER BY r.id DESC LIMIT 8`); const notices=await q(`SELECT * FROM notices ORDER BY is_pinned DESC,id DESC LIMIT 5`); const settings=await getSettings(); return {vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,notices:notices.rows,query:req.query,settings}; }
app.get('/',async(req,res)=>res.render('index',await homeData(req)));
app.get('/advertise',async(req,res)=>res.render('inquiry',{type:'ad',title:'광고문의',done:false,error:null,settings:await getSettings()}));
app.get('/apply',async(req,res)=>res.render('inquiry',{type:'apply',title:'입점신청',done:false,error:null,settings:await getSettings()}));
app.post('/inquiry',upload.fields([{name:'main_image',maxCount:1},{name:'banner_image',maxCount:1}]),async(req,res)=>{try{const f=req.files||{}; await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,banner_image_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[req.body.type,req.body.company_name,req.body.name,req.body.phone,req.body.kakao,req.body.email,req.body.category,req.body.region,req.body.content,img(f.main_image?.[0]),img(f.banner_image?.[0])]); res.render('inquiry',{type:req.body.type,title:req.body.type==='apply'?'입점신청':'광고문의',done:true,error:null,settings:await getSettings()});}catch(e){res.render('inquiry',{type:req.body.type||'ad',title:req.body.type==='apply'?'입점신청':'광고문의',done:false,error:e.message||'신청 저장 실패',settings:await getSettings()});}});

app.post('/favorite/:id',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){await q('INSERT INTO favorites(user_id,vendor_id) VALUES($1,$2) ON CONFLICT(user_id,vendor_id) DO NOTHING',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});
app.post('/favorite/:id/delete',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){await q('DELETE FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});

async function vendorData(req,id){req.session.viewedVendors=req.session.viewedVendors||{}; if(!req.session.viewedVendors[id]){await q('UPDATE vendors SET views=views+1 WHERE id=$1',[id]); req.session.viewedVendors[id]=Date.now();} const v=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE v.id=$1`,[id]); if(v.rows[0]&&req.session.user){const fav=await q('SELECT 1 FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]); v.rows[0].is_favorited=!!fav.rows[0];} const reviews=await q('SELECT r.*,u.nickname FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.vendor_id=$1 AND r.status=$2 ORDER BY r.id DESC',[id,'visible']); return {vendor:v.rows[0],reviews:reviews.rows};}
app.get('/api/vendor/:id',async(req,res)=>{const data=await vendorData(req,req.params.id); if(!data.vendor)return res.status(404).json({error:'not found'}); res.json(data);});
app.post('/api/review',async(req,res)=>{if(!req.session.user)return res.status(401).json({error:'login_required'}); const rating=Math.max(1,Math.min(5,parseInt(req.body.rating||5,10))); await q('INSERT INTO reviews(vendor_id,user_id,title,content,rating) VALUES($1,$2,$3,$4,$5)',[req.body.vendor_id,req.session.user.id,req.body.title,req.body.content,rating]); res.json({ok:true});});
app.post('/api/flag',async(req,res)=>{const type=(req.body.type||'').trim(); const target=parseInt(req.body.target_id||0,10); const reason=(req.body.reason||'기타').slice(0,50); const content=(req.body.content||'').slice(0,1000); if(!['vendor','review'].includes(type)||!target)return res.status(400).json({error:'bad_request'}); await q('INSERT INTO flags(type,target_id,reason,content) VALUES($1,$2,$3,$4)',[type,target,reason,content]); res.json({ok:true});});
app.get('/vendor/:id',async(req,res)=>{const data=await vendorData(req,req.params.id); if(!data.vendor)return res.status(404).send('Not found'); res.render('vendor',data);});
app.get('/login',(req,res)=>res.render('login',{mode:'login',error:null})); app.post('/login',async(req,res)=>{const u=await q('SELECT * FROM users WHERE username=$1',[req.body.username]); if(!u.rows[0]||u.rows[0].status!=='active'||!await bcrypt.compare(req.body.password,u.rows[0].password_hash)) return res.render('login',{mode:'login',error:'아이디 또는 비밀번호가 올바르지 않습니다.'}); req.session.user={id:u.rows[0].id,username:u.rows[0].username,nickname:u.rows[0].nickname,role:u.rows[0].role,is_vendor:u.rows[0].is_vendor,vendor_id:u.rows[0].vendor_id}; res.redirect(u.rows[0].role==='admin'?'/admin':u.rows[0].is_vendor?'/vendor-dashboard':'/');});
app.get('/join',(req,res)=>res.render('login',{mode:'join',error:null})); app.post('/join',async(req,res)=>{try{const h=await bcrypt.hash(req.body.password,10); await q('INSERT INTO users(username,password_hash,nickname) VALUES($1,$2,$3)',[req.body.username,h,req.body.nickname||req.body.username]); res.redirect('/login')}catch(e){res.render('login',{mode:'join',error:'이미 사용 중인 아이디입니다.'})}});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.post('/review',login,async(req,res)=>{await q('INSERT INTO reviews(vendor_id,user_id,title,content,rating) VALUES($1,$2,$3,$4,$5)',[req.body.vendor_id,req.session.user.id,req.body.title,req.body.content,req.body.rating||5]); res.redirect('/vendor/'+req.body.vendor_id);});
app.get('/admin/login',(req,res)=>res.render('admin-login',{error:null})); app.post('/admin/login',async(req,res)=>{const u=await q('SELECT * FROM users WHERE username=$1 AND role=$2',[req.body.username,'admin']); if(!u.rows[0]||!await bcrypt.compare(req.body.password,u.rows[0].password_hash)) return res.render('admin-login',{error:'관리자 로그인 실패'}); req.session.user={id:u.rows[0].id,username:u.rows[0].username,nickname:u.rows[0].nickname,role:'admin',is_vendor:u.rows[0].is_vendor,vendor_id:u.rows[0].vendor_id}; res.redirect('/admin');});

// 통합 관리자 화면 사용: 개별 신청/신고 페이지는 관리자 메인 탭으로 이동
app.get('/admin/inquiries',admin,(req,res)=>res.redirect('/admin#inquiries'));
app.get('/admin/reports',admin,(req,res)=>res.redirect('/admin#reports'));

app.post('/admin/reports/:id/done',admin,async(req,res)=>{await q('UPDATE flags SET status=$1, admin_memo=$2, processed_at=now() WHERE id=$3',['done',(req.body.admin_memo||'').slice(0,500),req.params.id]); res.redirect('/admin#reports');});
app.post('/admin/inquiries/:id/reject',admin,async(req,res)=>{await q('UPDATE inquiries SET status=$1 WHERE id=$2',['rejected',req.params.id]); res.redirect('/admin#inquiries');});
app.get('/admin/inquiry-image/:id/:kind',admin,async(req,res)=>{const col=req.params.kind==='banner'?'banner_image_data':'main_image_data'; const r=await q(`SELECT ${col} image_data FROM inquiries WHERE id=$1`,[req.params.id]); const data=r.rows[0]?.image_data; if(!data)return res.status(404).send('이미지가 없습니다.'); const m=data.match(/^data:(.+);base64,(.+)$/); if(!m)return res.status(400).send('이미지 형식 오류'); res.setHeader('Content-Type',m[1]); res.send(Buffer.from(m[2],'base64'));});
app.post('/admin/inquiries/:id/approve',admin,async(req,res)=>{const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x)return res.redirect('/admin#inquiries'); if(x.type!=='apply')return res.redirect('/admin#inquiries'); await q('INSERT INTO vendors(name,category,region,phone,kakao_url,description,image_data,is_recommended,is_premium,status) VALUES($1,$2,$3,$4,$5,$6,$7,false,false,$8)',[x.company_name,x.category||'기타',x.region||'기타',x.phone,x.kakao,x.content,x.main_image_data,'active']); await q('UPDATE inquiries SET status=$1 WHERE id=$2',['approved',x.id]); res.redirect('/admin#inquiries');});
app.post('/admin/inquiries/:id/banner',admin,async(req,res)=>{const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x||!x.banner_image_data||x.banner_status==='approved')return res.redirect('/admin#inquiries'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.company_name||'입점신청 배너','입점신청으로 등록된 배너','#','premium',0,true,x.banner_image_data]); await q('UPDATE inquiries SET banner_status=$1 WHERE id=$2',['approved',x.id]); res.redirect('/admin#inquiries');});
app.get('/admin',admin,async(req,res)=>{await expireAds();
  const dashStats={};
  const norm=x=>(x||'미지정').toString().trim()||'미지정';
const [users,vendors,banners,reviews,events,notices,inquiries,flags,vendorRequests,bannerRequests,adRequests,settings]=await Promise.all([q('SELECT id,username,nickname,role,status,created_at FROM users ORDER BY id DESC'),q('SELECT * FROM vendors ORDER BY id DESC'),q('SELECT * FROM banners ORDER BY sort_order,id DESC'),q('SELECT r.*,v.name vendor_name FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC'),q('SELECT * FROM events ORDER BY id DESC'),q('SELECT * FROM notices ORDER BY id DESC'),q('SELECT * FROM inquiries ORDER BY id DESC'),q(`SELECT f.*, v.name vendor_name, rv.title review_title FROM flags f LEFT JOIN vendors v ON f.type='vendor' AND v.id=f.target_id LEFT JOIN reviews rv ON f.type='review' AND rv.id=f.target_id ORDER BY f.id DESC`),q(`SELECT r.*,u.username,u.nickname,v.name current_vendor_name FROM vendor_update_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC`),q(`SELECT r.*,u.username,u.nickname,v.name vendor_name FROM vendor_banner_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC`),q(`SELECT r.*,u.username,u.nickname,v.name vendor_name FROM vendor_ad_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC`),getSettings()]); 
  const vendorRows=vendors.rows||[];
  const reviewRows=reviews.rows||[];
  const flagRows=flags.rows||[];
  const favoriteStats=await q('SELECT vendor_id,COUNT(*)::int cnt FROM favorites GROUP BY vendor_id');
  const favMap=Object.fromEntries(favoriteStats.rows.map(x=>[x.vendor_id,Number(x.cnt||0)]));
  const reviewMap={};
  reviewRows.forEach(r=>{
    const id=r.vendor_id;
    if(!id)return;
    reviewMap[id]=reviewMap[id]||{count:0,sum:0};
    reviewMap[id].count++;
    reviewMap[id].sum+=Number(r.rating||0);
  });
  const flagMap={};
  flagRows.forEach(f=>{
    if(f.type==='vendor'&&f.target_id){
      flagMap[f.target_id]=(flagMap[f.target_id]||0)+1;
    }
  });
  const groupCount=(arr,key)=>Object.entries(arr.reduce((m,x)=>{
    const k=norm(x[key]);
    m[k]=(m[k]||0)+1;
    return m;
  },{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const enrichedVendors=vendorRows.map(v=>{
    const rv=reviewMap[v.id]||{count:0,sum:0};
    const avg=rv.count?Number((rv.sum/rv.count).toFixed(1)):0;
    const fav=Number(favMap[v.id]||0);
    const score=Number(v.views||0)+(fav*20)+(rv.count*10)+(avg*5)+(v.is_premium?30:0)+(v.is_recommended?15:0);
    return {...v,review_count_calc:rv.count,avg_rating_calc:avg,favorite_count_calc:fav,report_count_calc:Number(flagMap[v.id]||0),popularity_score:score};
  });
  const dashboardStats={
    regions:groupCount(vendorRows,'region'),
    categories:groupCount(vendorRows,'category'),
    status:Object.entries(vendorRows.reduce((m,v)=>{const k=v.status||'active';m[k]=(m[k]||0)+1;return m;},{})),
    popular:enrichedVendors.slice().sort((a,b)=>b.popularity_score-a.popularity_score).slice(0,10),
    reviewTop:enrichedVendors.slice().sort((a,b)=>b.review_count_calc-a.review_count_calc||b.avg_rating_calc-a.avg_rating_calc).slice(0,10),
    reportTop:enrichedVendors.slice().sort((a,b)=>b.report_count_calc-a.report_count_calc).slice(0,10)
  };
  res.render('admin',{users:users.rows,vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,events:events.rows,notices:notices.rows,inquiries:inquiries.rows,flags:flags.rows,vendorRequests:vendorRequests.rows,bannerRequests:bannerRequests.rows,adRequests:adRequests.rows,settings,dashboardStats});
});

app.get('/mypage',login,async(req,res)=>{if(req.session.user.is_vendor)return res.redirect('/vendor-dashboard'); const reviews=await q('SELECT r.*,v.name vendor_name FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id WHERE r.user_id=$1 ORDER BY r.id DESC',[req.session.user.id]); const favorites=await q('SELECT f.*,v.name vendor_name,v.region,v.category FROM favorites f LEFT JOIN vendors v ON v.id=f.vendor_id WHERE f.user_id=$1 ORDER BY f.id DESC',[req.session.user.id]); res.render('mypage',{reviews:reviews.rows,favorites:favorites.rows});});

app.get('/vendor-apply',login,async(req,res)=>{const settings=await getSettings(); res.render('vendor-apply',{settings,error:null,done:false});});

app.post('/vendor-apply',login,upload.single('image'),async(req,res)=>{try{const im=img(req.file); await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',['apply',req.body.company_name,req.session.user.nickname,req.body.phone,req.body.kakao_url,req.body.email,req.body.category,req.body.region,req.body.content,im,'new']); res.render('vendor-apply',{settings:await getSettings(),error:null,done:true});}catch(e){res.render('vendor-apply',{settings:await getSettings(),error:e.message||'신청 실패',done:false});}});

app.get('/vendor-dashboard',login,async(req,res)=>{if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply'); const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]); const requests=await q('SELECT * FROM vendor_update_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]); const bannerRequests=await q('SELECT * FROM vendor_banner_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]); const adRequests=await q('SELECT * FROM vendor_ad_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]); const stats=await q(`SELECT (SELECT COUNT(*)::int FROM reviews WHERE vendor_id=$1) review_count, (SELECT ROUND(AVG(rating)::numeric,1) FROM reviews WHERE vendor_id=$1) avg_rating, (SELECT COUNT(*)::int FROM favorites WHERE vendor_id=$1) favorite_count, (SELECT COUNT(*)::int FROM flags WHERE type='vendor' AND target_id=$1) report_count`,[req.session.user.vendor_id]); res.render('vendor-dashboard',{vendor:v.rows[0],requests:requests.rows,bannerRequests:bannerRequests.rows,adRequests:adRequests.rows,stats:stats.rows[0],settings:await getSettings(),error:null,done:false});});

app.post('/vendor-dashboard/update-request',login,upload.single('image'),async(req,res)=>{if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply'); const im=img(req.file); await q('INSERT INTO vendor_update_requests(user_id,vendor_id,name,category,region,phone,kakao_url,business_hours,tags,description,image_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[req.session.user.id,req.session.user.vendor_id,req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,req.body.business_hours,req.body.tags,req.body.description,im]); res.redirect('/vendor-dashboard');});


app.post('/vendor-dashboard/banner-request',login,upload.single('image'),async(req,res)=>{if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply'); const im=img(req.file); await q('INSERT INTO vendor_banner_requests(user_id,vendor_id,title,subtitle,link_url,image_data) VALUES($1,$2,$3,$4,$5,$6)',[req.session.user.id,req.session.user.vendor_id,req.body.title,req.body.subtitle,req.body.link_url,im]); res.redirect('/vendor-dashboard');});

app.post('/vendor-dashboard/ad-request',login,async(req,res)=>{if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply'); await q('INSERT INTO vendor_ad_requests(user_id,vendor_id,plan,period,content) VALUES($1,$2,$3,$4,$5)',[req.session.user.id,req.session.user.vendor_id,req.body.plan,req.body.period,req.body.content]); res.redirect('/vendor-dashboard');});

app.post('/admin/banner-requests/:id/approve',admin,async(req,res)=>{const r=await q('SELECT * FROM vendor_banner_requests WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x)return res.redirect('/admin#bannerRequests'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data]); await q('UPDATE vendor_banner_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]); res.redirect('/admin#bannerRequests');});

app.post('/admin/banner-requests/:id/reject',admin,async(req,res)=>{await q('UPDATE vendor_banner_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); res.redirect('/admin#bannerRequests');});

app.post('/admin/ad-requests/:id/approve',admin,async(req,res)=>{
  const r=await q('SELECT * FROM vendor_ad_requests WHERE id=$1',[req.params.id]);
  const x=r.rows[0];

  if(!x){
    return res.redirect('/admin#adRequests');
  }

  const days=parseInt(x.period||30,10)||30;

  await q(
    "UPDATE vendors SET is_premium=true, ad_until=(CURRENT_DATE + ($1 || ' days')::interval)::date WHERE id=$2",
    [days,x.vendor_id]
  );

  await q(
    'UPDATE vendor_ad_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',
    ['approved',(req.body.admin_memo||'').slice(0,500),x.id]
  );

  res.redirect('/admin#adRequests');
});

app.post('/admin/ad-requests/:id/reject',admin,async(req,res)=>{await q('UPDATE vendor_ad_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); res.redirect('/admin#adRequests');});

app.post('/admin/vendor-requests/:id/approve',admin,async(req,res)=>{const r=await q('SELECT * FROM vendor_update_requests WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x)return res.redirect('/admin#vendorRequests'); const vals=[x.name,x.category,x.region,x.phone,x.kakao_url,x.tags,x.description,x.business_hours,x.vendor_id]; if(x.image_data){await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,image_data=$10 WHERE id=$9',[...vals,x.image_data]);}else{await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8 WHERE id=$9',vals);} await q('UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]); res.redirect('/admin#vendorRequests');});

app.post('/admin/vendor-requests/:id/reject',admin,async(req,res)=>{await q('UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); res.redirect('/admin#vendorRequests');});

app.post('/admin/link-user-vendor',admin,async(req,res)=>{const userId=parseInt(req.body.user_id||0,10); const vendorId=parseInt(req.body.vendor_id||0,10); if(userId&&vendorId){await q('UPDATE users SET is_vendor=true,vendor_id=$1 WHERE id=$2',[vendorId,userId]);} res.redirect('/admin#users');});



app.get('/admin/backup.json',admin,async(req,res)=>{
  const tables=['users','vendors','banners','reviews','notices','inquiries','flags','vendor_update_requests','vendor_banner_requests','vendor_ad_requests','favorites','app_settings'];
  const data={created_at:new Date().toISOString(),tables:{}};
  for(const t of tables){try{const r=await q(`SELECT * FROM ${t} ORDER BY 1`); data.tables[t]=r.rows;}catch(e){data.tables[t]=[];}}
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename=\"backup.json\"');
  res.send(JSON.stringify(data,null,2));
});
app.post('/admin/restore-json',admin,async(req,res)=>{
  const password=(req.body.password||'').trim();
  const raw=req.body.backup_json||'';
  const adminUser=await q('SELECT * FROM users WHERE id=$1 AND role=$2',[req.session.user.id,'admin']);
  if(!adminUser.rows[0] || !await bcrypt.compare(password,adminUser.rows[0].password_hash))return res.redirect('/admin#settings');
  let data; try{data=JSON.parse(raw);}catch(e){return res.redirect('/admin#settings');}
  if(!data.tables)return res.redirect('/admin#settings');
  const wipe=['vendor_ad_requests','vendor_banner_requests','vendor_update_requests','favorites','flags','reviews','banners','inquiries','notices','vendors'];
  for(const t of wipe){try{await q(`DELETE FROM ${t}`);}catch(e){}}
  if(data.tables.vendors){for(const x of data.tables.vendors){await q('INSERT INTO vendors(id,name,category,region,phone,kakao_url,tags,description,business_hours,is_recommended,is_premium,status,image_data,views,created_at,ad_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING',[x.id,x.name,x.category,x.region,x.phone,x.kakao_url,x.tags,x.description,x.business_hours,x.is_recommended,x.is_premium,x.status,x.image_data,x.views,x.created_at,x.ad_until]);}}
  if(data.tables.banners){for(const x of data.tables.banners){await q('INSERT INTO banners(id,title,subtitle,link_url,position,sort_order,is_active,image_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',[x.id,x.title,x.subtitle,x.link_url,x.position,x.sort_order,x.is_active,x.image_data,x.created_at]);}}
  if(data.tables.notices){for(const x of data.tables.notices){await q('INSERT INTO notices(id,title,content,is_pinned,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',[x.id,x.title,x.content,x.is_pinned,x.created_at]);}}
  res.redirect('/admin#settings');
});

app.post('/admin/settings/reset-data',admin,async(req,res)=>{
  const password=(req.body.password||'').trim();
  const confirmText=(req.body.confirm_text||'').trim();
  const adminUser=await q('SELECT * FROM users WHERE id=$1 AND role=$2',[req.session.user.id,'admin']);

  if(!adminUser.rows[0] || !await bcrypt.compare(password,adminUser.rows[0].password_hash)){
    return res.redirect('/admin#settings');
  }

  if(confirmText!=='초기화'){
    return res.redirect('/admin#settings');
  }

  await q('DELETE FROM vendor_ad_requests');
  await q('DELETE FROM vendor_banner_requests');
  await q('DELETE FROM vendor_update_requests');

  await q('DELETE FROM flags');
  await q('DELETE FROM reviews');
  await q('DELETE FROM banners');
  await q('DELETE FROM inquiries');
  await q('DELETE FROM notices');

  await q('DELETE FROM vendors');

  await q('DELETE FROM users WHERE role<>$1',['admin']);

  res.redirect('/admin#settings');
});

app.post('/admin/settings/options',admin,async(req,res)=>{const categories=(req.body.categories||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join('\n'); const regions=(req.body.regions||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join('\n'); await q("INSERT INTO app_settings(key,value) VALUES('categories',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",[categories]); await q("INSERT INTO app_settings(key,value) VALUES('regions',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",[regions]); res.redirect('/admin#settings');});
app.post('/admin/settings/admin-account',admin,async(req,res)=>{const username=(req.body.username||'').trim(); const nickname=(req.body.nickname||'관리자').trim(); const password=(req.body.password||'').trim(); if(!username)return res.redirect('/admin#settings'); if(password){const h=await bcrypt.hash(password,10); await q('UPDATE users SET username=$1,nickname=$2,password_hash=$3 WHERE id=$4 AND role=$5',[username,nickname,h,req.session.user.id,'admin']);}else{await q('UPDATE users SET username=$1,nickname=$2 WHERE id=$3 AND role=$4',[username,nickname,req.session.user.id,'admin']);} req.session.user.username=username; req.session.user.nickname=nickname; res.redirect('/admin#settings');});
app.post('/admin/vendor',admin,upload.single('image'),async(req,res)=>{let im=img(req.file); if(req.body.id){let p=[req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,req.body.tags,req.body.description,req.body.business_hours,!!req.body.is_recommended,!!req.body.is_premium,req.body.status||'active',req.body.id]; await q(`UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11 ${im?', image_data=$13':''} WHERE id=$12`, im?[...p,im]:p)} else await q('INSERT INTO vendors(name,category,region,phone,kakao_url,tags,description,business_hours,is_recommended,is_premium,image_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,req.body.tags,req.body.description,req.body.business_hours,!!req.body.is_recommended,!!req.body.is_premium,im]); res.redirect('/admin#vendors');});
app.post('/admin/banner',admin,upload.single('image'),async(req,res)=>{const im=img(req.file); if(req.body.id){let p=[req.body.title,req.body.subtitle,req.body.link_url,req.body.position||'premium',req.body.sort_order||0,!!req.body.is_active,req.body.id]; await q(`UPDATE banners SET title=$1,subtitle=$2,link_url=$3,position=$4,sort_order=$5,is_active=$6 ${im?', image_data=$8':''} WHERE id=$7`, im?[...p,im]:p)} else await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.body.title,req.body.subtitle,req.body.link_url,req.body.position||'premium',req.body.sort_order||0,!!req.body.is_active,im]); res.redirect('/admin#banners');});
app.post('/admin/user',admin,async(req,res)=>{const h=req.body.password?await bcrypt.hash(req.body.password,10):null; if(req.body.id){ if(h) await q('UPDATE users SET nickname=$1,role=$2,status=$3,password_hash=$4 WHERE id=$5',[req.body.nickname,req.body.role,req.body.status,h,req.body.id]); else await q('UPDATE users SET nickname=$1,role=$2,status=$3 WHERE id=$4',[req.body.nickname,req.body.role,req.body.status,req.body.id]); } res.redirect('/admin#users');});
app.post('/admin/notice',admin,async(req,res)=>{await q('INSERT INTO notices(title,content,is_pinned) VALUES($1,$2,$3)',[req.body.title,req.body.content,!!req.body.is_pinned]); res.redirect('/admin#notices');});
app.post('/admin/delete/:table/:id',admin,async(req,res)=>{const allowed={vendors:'vendors',banners:'banners',users:'users',reviews:'reviews',notices:'notices',events:'events',inquiries:'inquiries'}; if(allowed[req.params.table]) await q(`DELETE FROM ${allowed[req.params.table]} WHERE id=$1`,[req.params.id]); res.redirect('/admin');});
const port=process.env.PORT||3000; ensureSchema().then(()=>app.listen(port,()=>console.log('server on '+port))).catch(e=>{console.error(e);process.exit(1)});
