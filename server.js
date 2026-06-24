require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), multer=require('multer');
const {Pool}=require('pg'); const PgSession=require('connect-pg-simple')(session);
const app=express(); const upload=multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024}, fileFilter:(req,file,cb)=>{/image\/(jpeg|png|gif|jpg)/.test(file.mimetype)?cb(null,true):cb(new Error('이미지는 JPG, PNG, GIF만 가능합니다.'))}});
const pool=new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_URL?.includes('supabase')?{rejectUnauthorized:false}:undefined});
const q=(s,p=[])=>pool.query(s,p); const img=f=>f?`data:${f.mimetype};base64,${f.buffer.toString('base64')}`:null;
async function ensureSchema(){await q('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kakao_url text'); await q(`CREATE TABLE IF NOT EXISTS inquiries(id SERIAL PRIMARY KEY,type text,company_name text,name text,phone text,kakao text,email text,category text,region text,content text,main_image_data text,banner_image_data text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS banner_status text DEFAULT 'new'"); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS user_id int"); await q(`CREATE TABLE IF NOT EXISTS flags(id SERIAL PRIMARY KEY,type text,target_id int,reason text,content text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS admin_memo text"); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS processed_at timestamp"); await q(`CREATE TABLE IF NOT EXISTS app_settings(key text PRIMARY KEY, value text DEFAULT '')`); await q("INSERT INTO app_settings(key,value) VALUES('categories','카페\n뷰티\n맛집\n교육\n기타') ON CONFLICT (key) DO NOTHING"); await q("INSERT INTO app_settings(key,value) VALUES('regions','서울\n부산\n대구\n인천\n광주\n대전\n제주') ON CONFLICT (key) DO NOTHING"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_id int"); await q(`CREATE TABLE IF NOT EXISTS vendor_update_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,name text,category text,region text,phone text,kakao_url text,business_hours text,tags text,description text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_banner_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,title text,subtitle text,link_url text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_ad_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,plan text,period text,content text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS ad_until date");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS membership_type text DEFAULT 'general'");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS expire_at date");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS banner_active boolean DEFAULT false");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS banner_until date"); await q(`CREATE TABLE IF NOT EXISTS favorites(id SERIAL PRIMARY KEY,user_id int,vendor_id int,created_at timestamp DEFAULT now(),UNIQUE(user_id,vendor_id))`); await q(`CREATE TABLE IF NOT EXISTS admin_logs(id SERIAL PRIMARY KEY,admin_id int,admin_username text,action text,target_type text,target_id text,memo text,created_at timestamp DEFAULT now())`);
    await q("ALTER TABLE vendor_banner_requests ADD COLUMN IF NOT EXISTS krw_price int");
    await q("ALTER TABLE vendor_banner_requests ADD COLUMN IF NOT EXISTS usdt_amount numeric");
    await q("ALTER TABLE vendor_banner_requests ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS krw_price int");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS usdt_amount numeric");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'recommended'");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_address','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_network','TRC20') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_krw_rate','1400') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('banner_price_krw','100000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('ad_price_krw_30','100000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('ad_price_krw_60','180000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('ad_price_krw_90','250000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('general_register_price_krw','30000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('recommended_register_price_krw','70000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('general_to_recommended_price_krw','40000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('general_to_banner_price_krw','100000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('recommended_to_banner_price_krw','70000') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('default_register_days','30') ON CONFLICT (key) DO NOTHING");
    await q(`CREATE TABLE IF NOT EXISTS payment_logs(id SERIAL PRIMARY KEY,user_id int,vendor_id int,product_type text,request_type text,request_id int,krw_price int,usdt_amount numeric,status text DEFAULT 'paid',memo text,paid_at timestamp DEFAULT now(),created_at timestamp DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS vendor_view_logs(id SERIAL PRIMARY KEY,vendor_id int,user_id int,created_at timestamp DEFAULT now())`);
  }
app.set('view engine','ejs'); app.use(express.urlencoded({extended:true,limit:'10mb'})); app.use(express.json({limit:'10mb'})); app.use('/public',express.static('public'));
app.use(session({store:new PgSession({pool,createTableIfMissing:true}), secret:process.env.SESSION_SECRET||'dev-secret', resave:false, saveUninitialized:false, cookie:{maxAge:1000*60*60*12}}));
app.use((req,res,next)=>{res.locals.me=req.session.user||null; next();});
function admin(req,res,next){ if(req.session.user?.role==='admin') return next(); res.redirect('/admin/login'); }

async function logAdmin(req,action,targetType,targetId,memo=''){
  try{
    await q(
      'INSERT INTO admin_logs(admin_id,admin_username,action,target_type,target_id,memo) VALUES($1,$2,$3,$4,$5,$6)',
      [req.session.user?.id||null,req.session.user?.username||'',action,targetType||'',String(targetId||''),String(memo||'').slice(0,1000)]
    );
  }catch(e){
    console.error('admin log failed',e.message);
  }
}
function login(req,res,next){ if(req.session.user) return next(); res.redirect('/login'); }


async function expireAds(){
  await q("UPDATE vendors SET is_premium=false,banner_active=false WHERE banner_until IS NOT NULL AND banner_until < CURRENT_DATE");
  await q("UPDATE vendors SET status='hidden',is_recommended=false,is_premium=false,banner_active=false WHERE expire_at IS NOT NULL AND expire_at < CURRENT_DATE");
}


function calcUsdt(krw,rate){
  const k=Number(krw||0);
  const r=Number(rate||1400);
  if(!k||!r)return '0.00';
  return (k/r).toFixed(2);
}

async function getSettings(){const r=await q('SELECT key,value FROM app_settings'); const raw=Object.fromEntries(r.rows.map(x=>[x.key,x.value||''])); const split=v=>(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); return {raw,categories:split(raw.categories),regions:split(raw.regions)};}
async function homeData(req){ await expireAds(); const search=req.query.search||'', region=req.query.region||'', category=req.query.category||'', sort=req.query.sort||'default'; let where=['status=$1'], p=['active']; if(search){p.push(`%${search}%`); where.push(`(name ILIKE $${p.length} OR tags ILIKE $${p.length} OR description ILIKE $${p.length})`)} if(region){p.push(region); where.push(`region=$${p.length}`)} if(category){p.push(category); where.push(`category=$${p.length}`)} const orderMap={views:'views DESC,is_premium DESC,is_recommended DESC,created_at DESC',rating:'avg_rating DESC NULLS LAST,review_count DESC,is_premium DESC,is_recommended DESC,created_at DESC',reviews:'review_count DESC,avg_rating DESC NULLS LAST,is_premium DESC,is_recommended DESC,created_at DESC',latest:'created_at DESC,is_premium DESC,is_recommended DESC',default:'is_premium DESC,is_recommended DESC,created_at DESC'}; const order=orderMap[sort]||orderMap.default; const vendors=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count , (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE ${where.join(' AND ')} ORDER BY ${order}`,p); const banners=await q(`SELECT * FROM banners WHERE is_active=true ORDER BY sort_order, id DESC`); const reviews=await q(`SELECT r.*,v.name vendor_name,u.nickname FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status='visible' ORDER BY r.id DESC LIMIT 8`); const notices=await q(`SELECT * FROM notices ORDER BY is_pinned DESC,id DESC LIMIT 5`); const settings=await getSettings(); return {vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,notices:notices.rows,query:req.query,settings}; }
app.get('/',async(req,res)=>res.render('index',await homeData(req)));
app.get('/advertise',async(req,res)=>res.render('inquiry',{type:'ad',title:'광고문의',done:false,error:null,settings:await getSettings()}));
app.get('/apply',async(req,res)=>res.render('inquiry',{type:'apply',title:'입점신청',done:false,error:null,settings:await getSettings()}));
app.post('/inquiry',upload.fields([{name:'main_image',maxCount:1},{name:'banner_image',maxCount:1}]),async(req,res)=>{try{const f=req.files||{}; await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,banner_image_data,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[req.body.type,req.body.company_name,req.body.name,req.body.phone,req.body.kakao,req.body.email,req.body.category,req.body.region,req.body.content,img(f.main_image?.[0]),img(f.banner_image?.[0]),req.session.user?.id||null]); res.render('inquiry',{type:req.body.type,title:req.body.type==='apply'?'입점신청':'광고문의',done:true,error:null,settings:await getSettings()});}catch(e){res.render('inquiry',{type:req.body.type||'ad',title:req.body.type==='apply'?'입점신청':'광고문의',done:false,error:e.message||'신청 저장 실패',settings:await getSettings()});}});

app.post('/favorite/:id',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){await q('INSERT INTO favorites(user_id,vendor_id) VALUES($1,$2) ON CONFLICT(user_id,vendor_id) DO NOTHING',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});
app.post('/favorite/:id/delete',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){await q('DELETE FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});

async function vendorData(req,id){req.session.viewedVendors=req.session.viewedVendors||{}; if(!req.session.viewedVendors[id]){await q('UPDATE vendors SET views=views+1 WHERE id=$1',[id]); await q('INSERT INTO vendor_view_logs(vendor_id,user_id) VALUES($1,$2)',[id,req.session.user?.id||null]); req.session.viewedVendors[id]=Date.now();} const v=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE v.id=$1`,[id]); if(v.rows[0]&&req.session.user){const fav=await q('SELECT 1 FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]); v.rows[0].is_favorited=!!fav.rows[0];} const reviews=await q('SELECT r.*,u.nickname FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.vendor_id=$1 AND r.status=$2 ORDER BY r.id DESC',[id,'visible']); return {vendor:v.rows[0],reviews:reviews.rows};}
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

app.post('/admin/reports/:id/done',admin,async(req,res)=>{await q('UPDATE flags SET status=$1, admin_memo=$2, processed_at=now() WHERE id=$3',['done',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'신고 처리완료','report',req.params.id,req.body.admin_memo||''); res.redirect('/admin#reports');});
app.post('/admin/inquiries/:id/reject',admin,async(req,res)=>{await q('UPDATE inquiries SET status=$1 WHERE id=$2',['rejected',req.params.id]); await logAdmin(req,'입점신청 반려','inquiry',req.params.id,'신청 반려'); res.redirect('/admin#inquiries');});
app.get('/admin/inquiry-image/:id/:kind',admin,async(req,res)=>{const col=req.params.kind==='banner'?'banner_image_data':'main_image_data'; const r=await q(`SELECT ${col} image_data FROM inquiries WHERE id=$1`,[req.params.id]); const data=r.rows[0]?.image_data; if(!data)return res.status(404).send('이미지가 없습니다.'); const m=data.match(/^data:(.+);base64,(.+)$/); if(!m)return res.status(400).send('이미지 형식 오류'); res.setHeader('Content-Type',m[1]); res.send(Buffer.from(m[2],'base64'));});
app.post('/admin/inquiries/:id/approve',admin,async(req,res)=>{
  const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x)return res.redirect('/admin#inquiries');
  if(x.type!=='apply')return res.redirect('/admin#inquiries');

  const settings=await getSettings();
  const days=parseInt(settings.raw.default_register_days||30,10)||30;

  const inserted=await q(
    "INSERT INTO vendors(name,category,region,phone,kakao_url,description,image_data,is_recommended,is_premium,status,membership_type,expire_at,banner_active) VALUES($1,$2,$3,$4,$5,$6,$7,false,false,$8,$9,(CURRENT_DATE + ($10 || ' days')::interval)::date,false) RETURNING id",
    [x.company_name,x.category||'기타',x.region||'기타',x.phone,x.kakao,x.content,x.main_image_data,'active','general',days]
  );

  const vendorId=inserted.rows[0]?.id;

  if(x.user_id&&vendorId){
    await q('UPDATE users SET is_vendor=true,vendor_id=$1 WHERE id=$2 AND role<>$3',[vendorId,x.user_id,'admin']);
  }

  await q('UPDATE inquiries SET status=$1 WHERE id=$2',['approved',x.id]);
  await logAdmin(req,'입점신청 승인','inquiry',x.id,`업체ID ${vendorId} 생성 및 회원 자동연결`);
  res.redirect('/admin#inquiries');
});
app.post('/admin/inquiries/:id/banner',admin,async(req,res)=>{const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x||!x.banner_image_data||x.banner_status==='approved')return res.redirect('/admin#inquiries'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.company_name||'입점신청 배너','입점신청으로 등록된 배너','#','premium',0,true,x.banner_image_data]); await q('UPDATE inquiries SET banner_status=$1 WHERE id=$2',['approved',x.id]); await logAdmin(req,'입점신청 배너등록','inquiry',x.id,x.company_name||''); res.redirect('/admin#inquiries');});
app.get('/admin',admin,async(req,res)=>{await expireAds();
  const dashStats={};
  const norm=x=>(x||'미지정').toString().trim()||'미지정';
const [users,vendors,banners,reviews,events,notices,inquiries,flags,vendorRequests,bannerRequests,adRequests,adminLogs,paymentLogs,settings]=await Promise.all([q('SELECT id,username,nickname,role,status,is_vendor,vendor_id,created_at FROM users ORDER BY id DESC'),q('SELECT * FROM vendors ORDER BY id DESC'),q('SELECT * FROM banners ORDER BY sort_order,id DESC'),q('SELECT r.*,v.name vendor_name FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC'),q('SELECT * FROM events ORDER BY id DESC'),q('SELECT * FROM notices ORDER BY id DESC'),q(`SELECT i.*,u.username applicant_username,u.nickname applicant_nickname FROM inquiries i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.id DESC`),q(`SELECT f.*, v.name vendor_name, rv.title review_title FROM flags f LEFT JOIN vendors v ON f.type='vendor' AND v.id=f.target_id LEFT JOIN reviews rv ON f.type='review' AND rv.id=f.target_id ORDER BY f.id DESC`),q(`SELECT r.*,u.username,u.nickname,v.name current_vendor_name FROM vendor_update_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC`),q(`SELECT r.*,u.username,u.nickname,v.name vendor_name FROM vendor_banner_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC`),q(`SELECT r.*,u.username,u.nickname,v.name vendor_name FROM vendor_ad_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC`),q('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200'),q(`SELECT p.*,v.name vendor_name,u.username FROM payment_logs p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 500`),getSettings()]); 
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
  const paidRows=paymentLogs.rows||[];
  const now=new Date();
  const monthKey=now.toISOString().slice(0,7);
  const todayKey=now.toISOString().slice(0,10);
  const dateKey=x=>x?new Date(x).toISOString().slice(0,10):'';
  const monthOf=x=>x?new Date(x).toISOString().slice(0,7):'';
  const sumKrw=arr=>arr.reduce((s,x)=>s+Number(x.krw_price||0),0);
  const revenueStats={
    today:sumKrw(paidRows.filter(x=>dateKey(x.paid_at)===todayKey)),
    month:sumKrw(paidRows.filter(x=>monthOf(x.paid_at)===monthKey)),
    total:sumKrw(paidRows),
    count:paidRows.length,
    general:paidRows.filter(x=>x.product_type==='general').length,
    recommended:paidRows.filter(x=>x.product_type==='recommended').length,
    banner:paidRows.filter(x=>x.product_type==='banner').length,
    recent:paidRows.slice(0,10)
  };
  res.render('admin',{users:users.rows,vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,events:events.rows,notices:notices.rows,inquiries:inquiries.rows,flags:flags.rows,vendorRequests:vendorRequests.rows,bannerRequests:bannerRequests.rows,adRequests:adRequests.rows,adminLogs:adminLogs.rows,paymentLogs:paidRows,revenueStats,settings,dashboardStats});
});

app.get('/mypage',login,async(req,res)=>{if(req.session.user.is_vendor)return res.redirect('/vendor-dashboard'); const reviews=await q('SELECT r.*,v.name vendor_name FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id WHERE r.user_id=$1 ORDER BY r.id DESC',[req.session.user.id]); const favorites=await q('SELECT f.*,v.name vendor_name,v.region,v.category FROM favorites f LEFT JOIN vendors v ON v.id=f.vendor_id WHERE f.user_id=$1 ORDER BY f.id DESC',[req.session.user.id]); res.render('mypage',{reviews:reviews.rows,favorites:favorites.rows});});

app.get('/vendor-apply',login,async(req,res)=>{const settings=await getSettings(); res.render('vendor-apply',{settings,error:null,done:false});});

app.post('/vendor-apply',login,upload.single('image'),async(req,res)=>{try{const im=img(req.file); await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,status,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',['apply',req.body.company_name,req.session.user.nickname,req.body.phone,req.body.kakao_url,req.body.email,req.body.category,req.body.region,req.body.content,im,'new',req.session.user.id]); res.render('vendor-apply',{settings:await getSettings(),error:null,done:true});}catch(e){res.render('vendor-apply',{settings:await getSettings(),error:e.message||'신청 실패',done:false});}});

app.get('/vendor-dashboard',login,async(req,res)=>{if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply'); const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]); const requests=await q('SELECT * FROM vendor_update_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]); const bannerRequests=await q('SELECT * FROM vendor_banner_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]); const adRequests=await q('SELECT * FROM vendor_ad_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]); const stats=await q(`SELECT (SELECT COUNT(*)::int FROM reviews WHERE vendor_id=$1) review_count, (SELECT ROUND(AVG(rating)::numeric,1) FROM reviews WHERE vendor_id=$1) avg_rating, (SELECT COUNT(*)::int FROM favorites WHERE vendor_id=$1) favorite_count, (SELECT COUNT(*)::int FROM flags WHERE type='vendor' AND target_id=$1) report_count`,[req.session.user.vendor_id]); const paymentLogs=await q('SELECT * FROM payment_logs WHERE vendor_id=$1 ORDER BY id DESC',[req.session.user.vendor_id]);
  const viewStats=await q(`SELECT 
    (SELECT COUNT(*)::int FROM vendor_view_logs WHERE vendor_id=$1 AND created_at>=CURRENT_DATE) today_views,
    (SELECT COUNT(*)::int FROM vendor_view_logs WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-INTERVAL '7 days') week_views,
    (SELECT COUNT(*)::int FROM vendor_view_logs WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-INTERVAL '30 days') month_views`,[req.session.user.vendor_id]);
  const vendor=v.rows[0];
  let expiryNotice=null;
  if(vendor?.expire_at){
    const today=new Date(); today.setHours(0,0,0,0);
    const exp=new Date(vendor.expire_at); exp.setHours(0,0,0,0);
    const daysLeft=Math.ceil((exp-today)/(1000*60*60*24));
    if(daysLeft<=7){
      expiryNotice={daysLeft,expire_at:vendor.expire_at};
    }
  }
  res.render('vendor-dashboard',{vendor,requests:requests.rows,bannerRequests:bannerRequests.rows,adRequests:adRequests.rows,paymentLogs:paymentLogs.rows,viewStats:viewStats.rows[0],expiryNotice,stats:stats.rows[0],settings:await getSettings(),error:null,done:false});});

app.post('/vendor-dashboard/update-request',login,upload.single('image'),async(req,res)=>{if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply'); const im=img(req.file); await q('INSERT INTO vendor_update_requests(user_id,vendor_id,name,category,region,phone,kakao_url,business_hours,tags,description,image_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[req.session.user.id,req.session.user.vendor_id,req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,req.body.business_hours,req.body.tags,req.body.description,im]); res.redirect('/vendor-dashboard');});


app.post('/vendor-dashboard/banner-request',login,upload.single('image'),async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');
  const settings=await getSettings();
  const price=Number(settings.raw.banner_price_krw||0);
  const rate=Number(settings.raw.usdt_krw_rate||1400);
  const usdt=calcUsdt(price,rate);
  const im=img(req.file);
  await q(
    'INSERT INTO vendor_banner_requests(user_id,vendor_id,title,subtitle,link_url,image_data,krw_price,usdt_amount,payment_status,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [req.session.user.id,req.session.user.vendor_id,req.body.title,req.body.subtitle,req.body.link_url,im,price,usdt,'unpaid','new']
  );
  res.redirect('/vendor-dashboard');
});

app.post('/vendor-dashboard/ad-request',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');

  const settings=await getSettings();
  const productType=req.body.product_type||'renewal_recommended';
  const period=String(req.body.period||'30');

  let price=0;
  if(productType==='recommended_upgrade'){
    price=Number(settings.raw.general_to_recommended_price_krw||0);
  }else if(productType==='banner_from_general'){
    price=Number(settings.raw.general_to_banner_price_krw||0);
  }else if(productType==='banner_from_recommended'){
    price=Number(settings.raw.recommended_to_banner_price_krw||0);
  }else if(productType==='renewal_general'){
    price=Number(settings.raw.general_register_price_krw||0);
  }else if(productType==='renewal_recommended'){
    price=Number(settings.raw.recommended_register_price_krw||settings.raw.ad_price_krw_30||0);
  }else if(productType==='renewal_banner'){
    const v=await q('SELECT membership_type FROM vendors WHERE id=$1',[req.session.user.vendor_id]);
    const membership=v.rows[0]?.membership_type||'general';
    price=membership==='recommended'
      ? Number(settings.raw.recommended_to_banner_price_krw||0)
      : Number(settings.raw.general_to_banner_price_krw||0);
  }else{
    price=Number(settings.raw['ad_price_krw_'+period]||settings.raw.recommended_register_price_krw||settings.raw.ad_price_krw_30||0);
  }

  const rate=Number(settings.raw.usdt_krw_rate||1400);
  const usdt=calcUsdt(price,rate);
  const label={
    recommended_upgrade:'일반→추천 업그레이드',
    banner_from_general:'일반→프리미엄배너',
    banner_from_recommended:'추천→프리미엄배너',
    renewal_general:'일반업체 연장',
    renewal_recommended:'추천업체 연장',
    renewal_banner:'프리미엄배너 연장',
    recommended:'추천등록'
  }[productType]||'상품변경';

  await q(
    'INSERT INTO vendor_ad_requests(user_id,vendor_id,plan,period,content,krw_price,usdt_amount,payment_status,status,product_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [req.session.user.id,req.session.user.vendor_id,label,period,req.body.content,price,usdt,'unpaid','new',productType]
  );

  res.redirect('/vendor-dashboard');
});

app.post('/vendor-dashboard/banner-request/:id/paid',login,async(req,res)=>{
  if(!req.session.user.is_vendor)return res.redirect('/login');
  await q('UPDATE vendor_banner_requests SET payment_status=$1 WHERE id=$2 AND user_id=$3',['waiting',req.params.id,req.session.user.id]);
  res.redirect('/vendor-dashboard');
});
app.post('/vendor-dashboard/ad-request/:id/paid',login,async(req,res)=>{
  if(!req.session.user.is_vendor)return res.redirect('/login');
  await q('UPDATE vendor_ad_requests SET payment_status=$1 WHERE id=$2 AND user_id=$3',['waiting',req.params.id,req.session.user.id]);
  res.redirect('/vendor-dashboard');
});

app.post('/admin/banner-requests/:id/approve',admin,async(req,res)=>{const r=await q('SELECT * FROM vendor_banner_requests WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x)return res.redirect('/admin#bannerRequests'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data]); await q('UPDATE vendor_banner_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]); await logAdmin(req,'배너신청 승인','banner_request',x.id,req.body.admin_memo||''); res.redirect('/admin#bannerRequests');});


app.post('/admin/banner-requests/:id/payment-confirm',admin,async(req,res)=>{
  const r=await q('SELECT * FROM vendor_banner_requests WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x)return res.redirect('/admin#bannerRequests');

  const v=await q('SELECT * FROM vendors WHERE id=$1',[x.vendor_id]);
  const vendor=v.rows[0];
  const until=vendor?.expire_at||new Date().toISOString().slice(0,10);

  await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data]);
  await q('UPDATE vendors SET membership_type=$1,is_recommended=true,is_premium=true,banner_active=true,banner_until=$2,status=$3 WHERE id=$4',['recommended',until,'active',x.vendor_id]);
  await q('UPDATE vendor_banner_requests SET payment_status=$1,status=$2,admin_memo=$3,processed_at=now() WHERE id=$4',['paid','approved',(req.body.admin_memo||'입금확인 완료').slice(0,500),x.id]);
  await q('INSERT INTO payment_logs(user_id,vendor_id,product_type,request_type,request_id,krw_price,usdt_amount,status,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[x.user_id,x.vendor_id,'banner','banner_request',x.id,x.krw_price||0,x.usdt_amount||0,'paid',req.body.admin_memo||'프리미엄배너 입금확인']);
  await logAdmin(req,'배너 입금확인/추천승격','banner_request',x.id,`만기일 ${until}`);
  res.redirect('/admin#bannerRequests');
});
app.post('/admin/ad-requests/:id/payment-confirm',admin,async(req,res)=>{
  const r=await q('SELECT * FROM vendor_ad_requests WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x)return res.redirect('/admin#adRequests');

  const vendorRes=await q('SELECT * FROM vendors WHERE id=$1',[x.vendor_id]);
  const vendor=vendorRes.rows[0]||{};
  const days=parseInt(x.period||30,10)||30;
  const productType=x.product_type||'renewal_recommended';

  if(productType==='banner_from_general'||productType==='banner_from_recommended'||productType==='renewal_banner'){
    const until=vendor.expire_at||new Date().toISOString().slice(0,10);
    await q("UPDATE vendors SET membership_type='recommended',is_recommended=true,is_premium=true,banner_active=true,banner_until=$1,status='active' WHERE id=$2",[until,x.vendor_id]);
  }else if(productType==='renewal_general'){
    await q("UPDATE vendors SET membership_type='general',is_recommended=false,is_premium=false,banner_active=false,banner_until=NULL,status='active',expire_at=(CURRENT_DATE + ($1 || ' days')::interval)::date WHERE id=$2",[days,x.vendor_id]);
  }else if(productType==='renewal_recommended'||productType==='recommended_upgrade'||productType==='recommended'){
    await q("UPDATE vendors SET membership_type='recommended',is_recommended=true,is_premium=false,banner_active=false,banner_until=NULL,status='active',expire_at=(CURRENT_DATE + ($1 || ' days')::interval)::date WHERE id=$2",[days,x.vendor_id]);
  }else{
    await q("UPDATE vendors SET membership_type='recommended',is_recommended=true,status='active',expire_at=COALESCE(expire_at,(CURRENT_DATE + ($1 || ' days')::interval)::date) WHERE id=$2",[days,x.vendor_id]);
  }

  await q('UPDATE vendor_ad_requests SET payment_status=$1,status=$2,admin_memo=$3,processed_at=now() WHERE id=$4',['paid','approved',(req.body.admin_memo||'입금확인 완료').slice(0,500),x.id]);

  const paymentProduct=(productType==='banner_from_general'||productType==='banner_from_recommended'||productType==='renewal_banner')?'banner':(productType==='renewal_general'?'general':'recommended');
  await q('INSERT INTO payment_logs(user_id,vendor_id,product_type,request_type,request_id,krw_price,usdt_amount,status,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[x.user_id,x.vendor_id,paymentProduct,'ad_request',x.id,x.krw_price||0,x.usdt_amount||0,'paid',req.body.admin_memo||x.plan||'상품변경 입금확인']);

  await logAdmin(req,'상품변경 입금확인/적용','ad_request',x.id,`${x.plan||productType} 적용`);
  res.redirect('/admin#adRequests');
});
app.post('/admin/banner-requests/:id/reject',admin,async(req,res)=>{await q('UPDATE vendor_banner_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'배너신청 반려','banner_request',req.params.id,req.body.admin_memo||''); res.redirect('/admin#bannerRequests');});

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

app.post('/admin/ad-requests/:id/reject',admin,async(req,res)=>{await q('UPDATE vendor_ad_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'광고연장 반려','ad_request',req.params.id,req.body.admin_memo||''); res.redirect('/admin#adRequests');});

app.post('/admin/vendor-requests/:id/approve',admin,async(req,res)=>{const r=await q('SELECT * FROM vendor_update_requests WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x)return res.redirect('/admin#vendorRequests'); const vals=[x.name,x.category,x.region,x.phone,x.kakao_url,x.tags,x.description,x.business_hours,x.vendor_id]; if(x.image_data){await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,image_data=$10 WHERE id=$9',[...vals,x.image_data]);}else{await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8 WHERE id=$9',vals);} await q('UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]); await logAdmin(req,'업체수정요청 승인','vendor_update_request',x.id,req.body.admin_memo||''); res.redirect('/admin#vendorRequests');});

app.post('/admin/vendor-requests/:id/reject',admin,async(req,res)=>{await q('UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'업체수정요청 반려','vendor_update_request',req.params.id,req.body.admin_memo||''); res.redirect('/admin#vendorRequests');});

app.post('/admin/link-user-vendor',admin,async(req,res)=>{const userId=parseInt(req.body.user_id||0,10); const vendorId=parseInt(req.body.vendor_id||0,10); if(userId&&vendorId){await q('UPDATE users SET is_vendor=true,vendor_id=$1 WHERE id=$2',[vendorId,userId]); await logAdmin(req,'회원 업체연결','user',userId,`vendor_id=${vendorId}`);} await logAdmin(req,'회원 수정','user',req.body.id,req.body.nickname||''); res.redirect('/admin#users');});



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

  await logAdmin(req,'초기화','system','all','관리자 계정과 환경설정을 제외한 운영 데이터 완전 초기화');
  res.redirect('/admin#settings');
});

app.post('/admin/settings/options',admin,async(req,res)=>{const categories=(req.body.categories||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join('\n'); const regions=(req.body.regions||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join('\n');
  const fields={categories,regions,usdt_address:req.body.usdt_address||'',usdt_network:req.body.usdt_network||'TRC20',usdt_krw_rate:req.body.usdt_krw_rate||'1400',banner_price_krw:req.body.banner_price_krw||'100000',ad_price_krw_30:req.body.ad_price_krw_30||'100000',ad_price_krw_60:req.body.ad_price_krw_60||'180000',ad_price_krw_90:req.body.ad_price_krw_90||'250000',general_register_price_krw:req.body.general_register_price_krw||'30000',recommended_register_price_krw:req.body.recommended_register_price_krw||'70000',general_to_recommended_price_krw:req.body.general_to_recommended_price_krw||'40000',general_to_banner_price_krw:req.body.general_to_banner_price_krw||'100000',recommended_to_banner_price_krw:req.body.recommended_to_banner_price_krw||'70000',default_register_days:req.body.default_register_days||'30'};
  for(const [key,value] of Object.entries(fields)){
    await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",[key,String(value)]);
  }
  await logAdmin(req,'환경설정 저장','settings','options','업종/지역/결제설정 수정');
  res.redirect('/admin#settings');
});
app.post('/admin/settings/admin-account',admin,async(req,res)=>{const username=(req.body.username||'').trim(); const nickname=(req.body.nickname||'관리자').trim(); const password=(req.body.password||'').trim(); if(!username)return res.redirect('/admin#settings'); if(password){const h=await bcrypt.hash(password,10); await q('UPDATE users SET username=$1,nickname=$2,password_hash=$3 WHERE id=$4 AND role=$5',[username,nickname,h,req.session.user.id,'admin']);}else{await q('UPDATE users SET username=$1,nickname=$2 WHERE id=$3 AND role=$4',[username,nickname,req.session.user.id,'admin']);} req.session.user.username=username; req.session.user.nickname=nickname; await logAdmin(req,'관리자 계정 수정','settings','admin-account',username); res.redirect('/admin#settings');});
app.post('/admin/vendor',admin,upload.single('image'),async(req,res)=>{
  const im=img(req.file);
  const membership=req.body.membership_type||'general';
  const bannerActive=!!req.body.banner_active;
  const isRecommended=membership==='recommended';
  const isPremium=!!req.body.is_premium||bannerActive;

  if(req.body.id){
    const params=[
      req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,
      req.body.tags,req.body.description,req.body.business_hours,isRecommended,isPremium,
      req.body.status||'active',membership,req.body.expire_at||null,bannerActive,req.body.banner_until||null,req.body.id
    ];
    if(im){
      await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11,membership_type=$12,expire_at=$13,banner_active=$14,banner_until=$15,image_data=$17 WHERE id=$16',[...params,im]);
    }else{
      await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11,membership_type=$12,expire_at=$13,banner_active=$14,banner_until=$15 WHERE id=$16',params);
    }
  }else{
    await q('INSERT INTO vendors(name,category,region,phone,kakao_url,tags,description,business_hours,is_recommended,is_premium,image_data,membership_type,expire_at,banner_active,banner_until,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[
      req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,
      req.body.tags,req.body.description,req.body.business_hours,isRecommended,isPremium,im,
      membership,req.body.expire_at||null,bannerActive,req.body.banner_until||null,req.body.status||'active'
    ]);
  }
  await logAdmin(req,req.body.id?'업체 수정':'업체 등록','vendor',req.body.id||'new',req.body.name||'');
  res.redirect('/admin#vendors');
});
app.post('/admin/banner',admin,upload.single('image'),async(req,res)=>{const im=img(req.file); if(req.body.id){let p=[req.body.title,req.body.subtitle,req.body.link_url,req.body.position||'premium',req.body.sort_order||0,!!req.body.is_active,req.body.id]; await q(`UPDATE banners SET title=$1,subtitle=$2,link_url=$3,position=$4,sort_order=$5,is_active=$6 ${im?', image_data=$8':''} WHERE id=$7`, im?[...p,im]:p)} else await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.body.title,req.body.subtitle,req.body.link_url,req.body.position||'premium',req.body.sort_order||0,!!req.body.is_active,im]); await logAdmin(req,req.body.id?'배너 수정':'배너 등록','banner',req.body.id||'new',req.body.title||''); res.redirect('/admin#banners');});
app.post('/admin/user',admin,async(req,res)=>{const h=req.body.password?await bcrypt.hash(req.body.password,10):null; if(req.body.id){ if(h) await q('UPDATE users SET nickname=$1,role=$2,status=$3,password_hash=$4 WHERE id=$5',[req.body.nickname,req.body.role,req.body.status,h,req.body.id]); else await q('UPDATE users SET nickname=$1,role=$2,status=$3 WHERE id=$4',[req.body.nickname,req.body.role,req.body.status,req.body.id]); } res.redirect('/admin#users');});
app.post('/admin/notice',admin,async(req,res)=>{await q('INSERT INTO notices(title,content,is_pinned) VALUES($1,$2,$3)',[req.body.title,req.body.content,!!req.body.is_pinned]); await logAdmin(req,'공지 등록','notice','new',req.body.title||''); res.redirect('/admin#notices');});
app.post('/admin/delete/:table/:id',admin,async(req,res)=>{const allowed={vendors:'vendors',banners:'banners',users:'users',reviews:'reviews',notices:'notices',events:'events',inquiries:'inquiries'}; if(allowed[req.params.table]){ await q(`DELETE FROM ${allowed[req.params.table]} WHERE id=$1`,[req.params.id]); await logAdmin(req,'삭제',req.params.table,req.params.id,'관리자 삭제'); } res.redirect('/admin');});
const port=process.env.PORT||3000; ensureSchema().then(()=>app.listen(port,()=>console.log('server on '+port))).catch(e=>{console.error(e);process.exit(1)});
