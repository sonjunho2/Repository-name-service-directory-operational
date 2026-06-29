require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), multer=require('multer');
const {Pool}=require('pg'); const PgSession=require('connect-pg-simple')(session);
const app=express(); const upload=multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024}, fileFilter:(req,file,cb)=>{/image\/(jpeg|png|gif|jpg|webp)/.test(file.mimetype)?cb(null,true):cb(new Error('이미지는 JPG, PNG, GIF, WEBP만 가능합니다.'))}});
const pool=new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_URL?.includes('supabase')?{rejectUnauthorized:false}:undefined});
const q=(s,p=[])=>pool.query(s,p); const img=f=>f?`data:${f.mimetype};base64,${f.buffer.toString('base64')}`:null;
async function ensureSchema(){await q('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kakao_url text'); await q(`CREATE TABLE IF NOT EXISTS inquiries(id SERIAL PRIMARY KEY,type text,company_name text,name text,phone text,kakao text,email text,category text,region text,content text,main_image_data text,banner_image_data text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS banner_status text DEFAULT 'new'"); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS user_id int"); await q(`CREATE TABLE IF NOT EXISTS flags(id SERIAL PRIMARY KEY,type text,target_id int,reason text,content text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS admin_memo text"); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS processed_at timestamp"); await q(`CREATE TABLE IF NOT EXISTS app_settings(key text PRIMARY KEY, value text DEFAULT '')`); await q("INSERT INTO app_settings(key,value) VALUES('categories','카페\n뷰티\n맛집\n교육\n기타') ON CONFLICT (key) DO NOTHING"); await q("INSERT INTO app_settings(key,value) VALUES('regions','서울\n부산\n대구\n인천\n광주\n대전\n제주') ON CONFLICT (key) DO NOTHING"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_id int"); await q(`CREATE TABLE IF NOT EXISTS vendor_update_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,name text,category text,region text,phone text,kakao_url text,business_hours text,tags text,description text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_banner_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,title text,subtitle text,link_url text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_ad_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,plan text,period text,content text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS ad_until date");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS membership_type text DEFAULT 'general'");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS ad_type text DEFAULT 'none'");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS expire_at date");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS banner_active boolean DEFAULT false");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS banner_until date");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS sns_url text");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS line_url text");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS telegram_url text");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS holiday_info text");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS image_updated_at timestamp");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS scheduled_membership_type text");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS scheduled_banner_active boolean");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS scheduled_change_at date");
    await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS scheduled_change_note text");
    await q("ALTER TABLE vendor_update_requests ADD COLUMN IF NOT EXISTS sns_url text");
    await q("ALTER TABLE vendor_update_requests ADD COLUMN IF NOT EXISTS line_url text");
    await q("ALTER TABLE vendor_update_requests ADD COLUMN IF NOT EXISTS telegram_url text");
    await q("ALTER TABLE vendor_update_requests ADD COLUMN IF NOT EXISTS holiday_info text"); await q(`CREATE TABLE IF NOT EXISTS favorites(id SERIAL PRIMARY KEY,user_id int,vendor_id int,created_at timestamp DEFAULT now(),UNIQUE(user_id,vendor_id))`); await q(`CREATE TABLE IF NOT EXISTS admin_logs(id SERIAL PRIMARY KEY,admin_id int,admin_username text,action text,target_type text,target_id text,memo text,created_at timestamp DEFAULT now())`);
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
function formatKstDate(value){
  if(!value)return '-';
  try{
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '-';
    return d.toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  }catch(e){return '-';}
}
function formatKstDateTime(value){
  if(!value)return '-';
  try{
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '-';
    return d.toLocaleString('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(' ',' ');
  }catch(e){return '-';}
}
app.use((req,res,next)=>{
  res.locals.me=req.session.user||null;
  res.locals.fmtDate=formatKstDate;
  res.locals.fmtDateTime=formatKstDateTime;
  next();
});
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

async function refreshSessionUser(req){
  if(!req.session.user?.id)return null;
  const r=await q('SELECT id,username,nickname,role,status,is_vendor,vendor_id FROM users WHERE id=$1',[req.session.user.id]);
  const u=r.rows[0];
  if(!u||u.status!=='active')return null;
  req.session.user={id:u.id,username:u.username,nickname:u.nickname,role:u.role,is_vendor:u.is_vendor,vendor_id:u.vendor_id};
  return req.session.user;
}


async function expireAds(){
  await q(`UPDATE vendors
    SET membership_type=COALESCE(scheduled_membership_type,membership_type),
        ad_type=CASE WHEN COALESCE(scheduled_membership_type,membership_type)='recommended' THEN 'recommended' ELSE 'general' END,
        is_recommended=CASE WHEN COALESCE(scheduled_membership_type,membership_type)='recommended' THEN true ELSE false END,
        banner_active=COALESCE(scheduled_banner_active,banner_active,false),
        is_premium=COALESCE(scheduled_banner_active,banner_active,false),
        banner_until=CASE WHEN COALESCE(scheduled_banner_active,banner_active,false)=true THEN expire_at ELSE NULL END,
        scheduled_membership_type=NULL,
        scheduled_banner_active=NULL,
        scheduled_change_at=NULL,
        scheduled_change_note=NULL,
        status='active'
    WHERE scheduled_change_at IS NOT NULL
      AND scheduled_change_at <= CURRENT_DATE
      AND (expire_at IS NULL OR expire_at >= CURRENT_DATE)`);
  await q("UPDATE vendors SET is_premium=false,banner_active=false,banner_until=NULL WHERE banner_until IS NOT NULL AND banner_until < CURRENT_DATE");
  await q("UPDATE vendors SET ad_type='none',membership_type='general',is_recommended=false,is_premium=false,banner_active=false,banner_until=NULL,expire_at=NULL WHERE expire_at IS NOT NULL AND expire_at < CURRENT_DATE");
}


function calcUsdt(krw,rate){
  const k=Number(krw||0);
  const r=Number(rate||1400);
  if(!k||!r)return '0.00';
  return (k/r).toFixed(2);
}
function daysLeftUntil(dateValue){
  if(!dateValue)return 0;
  const today=new Date(); today.setHours(0,0,0,0);
  const end=new Date(dateValue); end.setHours(0,0,0,0);
  return Math.max(0,Math.ceil((end-today)/(1000*60*60*24)));
}
function priceForDays(price30,days){
  return Math.round(Number(price30||0) * (Number(days||30)/30));
}
function proratedUpgradePrice(fromPrice30,toPrice30,remainDays){
  const diff=Math.max(0,Number(toPrice30||0)-Number(fromPrice30||0));
  return Math.round(diff * (Number(remainDays||0)/30));
}
function calcProductPrice(settings,vendor,productType,period,immediateApply=false){
  const days=parseInt(period||30,10)||30;
  const remainDays=daysLeftUntil(vendor?.expire_at);
  const general30=Number(settings.raw.general_register_price_krw||0);
  const recommended30=Number(settings.raw.recommended_register_price_krw||0);
  const generalToBanner30=Number(settings.raw.general_to_banner_price_krw||0);
  const recommendedToBanner30=Number(settings.raw.recommended_to_banner_price_krw||0);
  const isRecommended=(vendor?.ad_type||'none')==='recommended';
  const hasBanner=!!vendor?.banner_active;

  if(productType==='renewal_general') return priceForDays(general30,days);

  if(productType==='renewal_recommended'){
    const renewal=priceForDays(recommended30,days);
    const upgradeNow=((vendor?.ad_type||'none')!=='recommended' && immediateApply) ? proratedUpgradePrice(general30,recommended30,remainDays) : 0;
    return renewal + upgradeNow;
  }

  if(productType==='renewal_banner'){
    const baseBanner=isRecommended ? recommendedToBanner30 : generalToBanner30;
    const renewal=priceForDays(baseBanner,days);
    const addNow=hasBanner ? 0 : priceForDays(baseBanner,remainDays || days);
    return renewal + addNow;
  }

  return priceForDays(recommended30,days);
}
function addDaysSqlFromExpire(){
  return "expire_at=CASE WHEN expire_at IS NOT NULL AND expire_at>CURRENT_DATE THEN (expire_at + ($1 || ' days')::interval)::date ELSE (CURRENT_DATE + ($1 || ' days')::interval)::date END";
}

async function getSettings(){const r=await q('SELECT key,value FROM app_settings'); const raw=Object.fromEntries(r.rows.map(x=>[x.key,x.value||''])); const split=v=>(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); return {raw,categories:split(raw.categories),regions:split(raw.regions)};}
async function homeData(req){
  await expireAds();
  const search=req.query.search||'', region=req.query.region||'', category=req.query.category||'', sort=req.query.sort||'default';
  const where=["v.status=$1 AND v.ad_type <> 'none' AND v.expire_at IS NOT NULL AND v.expire_at >= CURRENT_DATE"];
  const params=['active'];

  if(search){
    params.push(`%${search}%`);
    where.push(`(v.name ILIKE $${params.length} OR v.tags ILIKE $${params.length} OR v.description ILIKE $${params.length})`);
  }
  if(region){
    params.push(region);
    where.push(`v.region=$${params.length}`);
  }
  if(category){
    params.push(category);
    where.push(`v.category=$${params.length}`);
  }

  const orderMap={
    views:'v.views DESC,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',
    rating:'avg_rating DESC NULLS LAST,review_count DESC,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',
    reviews:'review_count DESC,avg_rating DESC NULLS LAST,v.is_premium DESC,v.is_recommended DESC,v.created_at DESC',
    latest:'v.created_at DESC,v.is_premium DESC,v.is_recommended DESC',
    default:'v.is_premium DESC,v.is_recommended DESC,v.created_at DESC'
  };
  const order=orderMap[sort]||orderMap.default;
  const vendors=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE ${where.join(' AND ')} ORDER BY ${order}`,params);
  const banners=await q(`SELECT * FROM banners WHERE is_active=true ORDER BY sort_order, id DESC`);
  const reviews=await q(`SELECT r.*,v.name vendor_name,u.nickname FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status='visible' ORDER BY r.id DESC LIMIT 8`);
  const notices=await q(`SELECT * FROM notices ORDER BY is_pinned DESC,id DESC LIMIT 5`);
  const settings=await getSettings();
  return {vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,notices:notices.rows,query:req.query,settings};
}
app.get('/',async(req,res)=>res.render('index',await homeData(req)));
app.get('/advertise',async(req,res)=>res.render('inquiry',{type:'ad',title:'광고문의',done:false,error:null,settings:await getSettings()}));
app.get('/apply',async(req,res)=>res.render('inquiry',{type:'apply',title:'입점신청',done:false,error:null,settings:await getSettings()}));
app.post('/inquiry',upload.fields([{name:'main_image',maxCount:1},{name:'banner_image',maxCount:1}]),async(req,res)=>{try{const type=['apply','ad'].includes(req.body.type)?req.body.type:'ad'; const company=(req.body.company_name||'').trim().slice(0,100); const phone=(req.body.phone||'').trim().slice(0,50); const content=(req.body.content||'').trim().slice(0,2000); if(!company||!phone||content.length<5)return res.render('inquiry',{type,title:type==='apply'?'입점신청':'광고문의',done:false,error:'업체명, 연락처, 신청 내용을 정확히 입력해주세요.',settings:await getSettings()}); const f=req.files||{}; await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,banner_image_data,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[type,company,(req.body.name||'').trim().slice(0,50),phone,(req.body.kakao||'').trim().slice(0,200),(req.body.email||'').trim().slice(0,120),(req.body.category||'').trim().slice(0,50),(req.body.region||'').trim().slice(0,50),content,img(f.main_image?.[0]),img(f.banner_image?.[0]),req.session.user?.id||null]); res.render('inquiry',{type,title:type==='apply'?'입점신청':'광고문의',done:true,error:null,settings:await getSettings()});}catch(e){res.render('inquiry',{type:req.body.type||'ad',title:req.body.type==='apply'?'입점신청':'광고문의',done:false,error:e.message||'신청 저장 실패',settings:await getSettings()});}});

app.post('/favorite/:id',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){const v=await q('SELECT id FROM vendors WHERE id=$1 AND status=$2',[id,'active']); if(v.rows[0])await q('INSERT INTO favorites(user_id,vendor_id) VALUES($1,$2) ON CONFLICT(user_id,vendor_id) DO NOTHING',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});
app.post('/favorite/:id/delete',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){await q('DELETE FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});

async function vendorData(req,id){const vendorId=parseInt(id||0,10); if(!vendorId)return {vendor:null,reviews:[]}; const v=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE v.id=$1`,[vendorId]); if(!v.rows[0])return {vendor:null,reviews:[]}; req.session.viewedVendors=req.session.viewedVendors||{}; if(!req.session.viewedVendors[vendorId]){await q('UPDATE vendors SET views=views+1 WHERE id=$1',[vendorId]); await q('INSERT INTO vendor_view_logs(vendor_id,user_id) VALUES($1,$2)',[vendorId,req.session.user?.id||null]); req.session.viewedVendors[vendorId]=Date.now(); v.rows[0].views=Number(v.rows[0].views||0)+1;} if(req.session.user){const fav=await q('SELECT 1 FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,vendorId]); v.rows[0].is_favorited=!!fav.rows[0];} const reviews=await q('SELECT r.*,u.nickname FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.vendor_id=$1 AND r.status=$2 ORDER BY r.id DESC',[vendorId,'visible']); return {vendor:v.rows[0],reviews:reviews.rows};}
app.get('/api/vendor/:id',async(req,res)=>{const data=await vendorData(req,req.params.id); if(!data.vendor)return res.status(404).json({error:'not found'}); res.json(data);});
app.post('/api/review',async(req,res)=>{if(!req.session.user)return res.status(401).json({error:'login_required'}); const vendorId=parseInt(req.body.vendor_id||0,10); const title=(req.body.title||'').trim().slice(0,100); const content=(req.body.content||'').trim().slice(0,1000); if(!vendorId||!title||content.length<5)return res.status(400).json({error:'bad_review'}); const vendor=await q('SELECT id FROM vendors WHERE id=$1 AND status=$2',[vendorId,'active']); if(!vendor.rows[0])return res.status(404).json({error:'vendor_not_found'}); const dup=await q("SELECT id FROM reviews WHERE vendor_id=$1 AND user_id=$2 AND created_at>=CURRENT_DATE-INTERVAL '1 day' LIMIT 1",[vendorId,req.session.user.id]); if(dup.rows[0])return res.status(429).json({error:'review_duplicate'}); const rating=Math.max(1,Math.min(5,parseInt(req.body.rating||5,10))); await q('INSERT INTO reviews(vendor_id,user_id,title,content,rating) VALUES($1,$2,$3,$4,$5)',[vendorId,req.session.user.id,title,content,rating]); res.json({ok:true});});
app.post('/api/flag',async(req,res)=>{const type=(req.body.type||'').trim(); const target=parseInt(req.body.target_id||0,10); const reason=(req.body.reason||'기타').trim().slice(0,50); const content=(req.body.content||'').trim().slice(0,1000); if(!['vendor','review'].includes(type)||!target||!reason)return res.status(400).json({error:'bad_request'}); const exists=type==='vendor'?await q('SELECT id FROM vendors WHERE id=$1',[target]):await q('SELECT id FROM reviews WHERE id=$1',[target]); if(!exists.rows[0])return res.status(404).json({error:'target_not_found'}); await q('INSERT INTO flags(type,target_id,reason,content) VALUES($1,$2,$3,$4)',[type,target,reason,content]); res.json({ok:true});});
app.get('/vendor/:id',async(req,res)=>{const data=await vendorData(req,req.params.id); if(!data.vendor)return res.status(404).send('Not found'); res.render('vendor',data);});
app.get('/login',(req,res)=>res.render('login',{mode:'login',error:null})); app.post('/login',async(req,res)=>{const username=(req.body.username||'').trim(); const u=await q('SELECT * FROM users WHERE username=$1',[username]); if(!u.rows[0]||u.rows[0].status!=='active'||!await bcrypt.compare(req.body.password||'',u.rows[0].password_hash)) return res.render('login',{mode:'login',error:'아이디 또는 비밀번호가 올바르지 않습니다.'}); req.session.user={id:u.rows[0].id,username:u.rows[0].username,nickname:u.rows[0].nickname,role:u.rows[0].role,is_vendor:u.rows[0].is_vendor,vendor_id:u.rows[0].vendor_id}; res.redirect(u.rows[0].role==='admin'?'/admin':u.rows[0].is_vendor?'/vendor-dashboard':'/');});
app.get('/join',(req,res)=>res.render('login',{mode:'join',error:null})); app.post('/join',async(req,res)=>{try{const username=(req.body.username||'').trim(); const password=req.body.password||''; const nickname=(req.body.nickname||username).trim().slice(0,50); if(!/^[a-zA-Z0-9_]{4,30}$/.test(username))return res.render('login',{mode:'join',error:'아이디는 영문/숫자/밑줄 4~30자로 입력해주세요.'}); if(password.length<6)return res.render('login',{mode:'join',error:'비밀번호는 6자 이상 입력해주세요.'}); const h=await bcrypt.hash(password,10); await q('INSERT INTO users(username,password_hash,nickname) VALUES($1,$2,$3)',[username,h,nickname||username]); res.redirect('/login')}catch(e){res.render('login',{mode:'join',error:'이미 사용 중인 아이디입니다.'})}});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.post('/review',login,async(req,res)=>{const vendorId=parseInt(req.body.vendor_id||0,10); const title=(req.body.title||'').trim().slice(0,100); const content=(req.body.content||'').trim().slice(0,1000); if(!vendorId||!title||content.length<5)return res.redirect('/vendor/'+(vendorId||'')); const vendor=await q('SELECT id FROM vendors WHERE id=$1 AND status=$2',[vendorId,'active']); if(!vendor.rows[0])return res.redirect('/'); const dup=await q("SELECT id FROM reviews WHERE vendor_id=$1 AND user_id=$2 AND created_at>=CURRENT_DATE-INTERVAL '1 day' LIMIT 1",[vendorId,req.session.user.id]); if(!dup.rows[0])await q('INSERT INTO reviews(vendor_id,user_id,title,content,rating) VALUES($1,$2,$3,$4,$5)',[vendorId,req.session.user.id,title,content,req.body.rating||5]); res.redirect('/vendor/'+vendorId);});
app.get('/admin/login',(req,res)=>res.render('admin-login',{error:null})); app.post('/admin/login',async(req,res)=>{const u=await q('SELECT * FROM users WHERE username=$1 AND role=$2',[req.body.username,'admin']); if(!u.rows[0]||!await bcrypt.compare(req.body.password,u.rows[0].password_hash)) return res.render('admin-login',{error:'관리자 로그인 실패'}); req.session.user={id:u.rows[0].id,username:u.rows[0].username,nickname:u.rows[0].nickname,role:'admin',is_vendor:u.rows[0].is_vendor,vendor_id:u.rows[0].vendor_id}; res.redirect('/admin');});

// 통합 관리자 화면 사용: 개별 신청/신고 페이지는 관리자 메인 탭으로 이동
app.get('/admin/inquiries',admin,(req,res)=>res.redirect('/admin#inquiries'));
app.get('/admin/reports',admin,(req,res)=>res.redirect('/admin#reports'));

app.post('/admin/reports/:id/done',admin,async(req,res)=>{await q("UPDATE flags SET status=$1, admin_memo=$2, processed_at=now() WHERE id=$3 AND status='new'",['done',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'신고 처리완료','report',req.params.id,req.body.admin_memo||''); res.redirect('/admin#reports');});
app.post('/admin/inquiries/:id/reject',admin,async(req,res)=>{await q("UPDATE inquiries SET status=$1 WHERE id=$2 AND status='new'",['rejected',req.params.id]); await logAdmin(req,'입점신청 반려','inquiry',req.params.id,'신청 반려'); res.redirect('/admin#inquiries');});
app.get('/admin/inquiry-image/:id/:kind',admin,async(req,res)=>{const col=req.params.kind==='banner'?'banner_image_data':'main_image_data'; const r=await q(`SELECT ${col} image_data FROM inquiries WHERE id=$1`,[req.params.id]); const data=r.rows[0]?.image_data; if(!data)return res.status(404).send('이미지가 없습니다.'); const m=data.match(/^data:(.+);base64,(.+)$/); if(!m)return res.status(400).send('이미지 형식 오류'); res.setHeader('Content-Type',m[1]); res.send(Buffer.from(m[2],'base64'));});
app.post('/admin/inquiries/:id/approve',admin,async(req,res)=>{
  const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x)return res.redirect('/admin#inquiries');
  if(x.type!=='apply'||x.status!=='new')return res.redirect('/admin#inquiries');

  const inserted=await q(
    "INSERT INTO vendors(name,category,region,phone,kakao_url,description,image_data,is_recommended,is_premium,status,membership_type,ad_type,expire_at,banner_active) VALUES($1,$2,$3,$4,$5,$6,$7,false,false,$8,$9,$10,NULL,false) RETURNING id",
    [x.company_name,x.category||'기타',x.region||'기타',x.phone,x.kakao,x.content,x.main_image_data,'active','general','none']
  );

  const vendorId=inserted.rows[0]?.id;

  if(x.user_id&&vendorId){
    await q('UPDATE users SET is_vendor=true,vendor_id=$1 WHERE id=$2 AND role<>$3',[vendorId,x.user_id,'admin']);
  }

  await q('UPDATE inquiries SET status=$1 WHERE id=$2',['approved',x.id]);
  await logAdmin(req,'입점신청 승인/업체회원전환','inquiry',x.id,`업체ID ${vendorId} 생성, 광고상태 없음`);
  res.redirect('/admin#inquiries');
});
app.post('/admin/inquiries/:id/banner',admin,async(req,res)=>{const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x||!x.banner_image_data||x.banner_status==='approved')return res.redirect('/admin#inquiries'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.company_name||'입점신청 배너','입점신청으로 등록된 배너','#','premium',0,true,x.banner_image_data]); await q("UPDATE inquiries SET banner_status=$1 WHERE id=$2 AND COALESCE(banner_status,'new')<>'approved'",['approved',x.id]); await logAdmin(req,'입점신청 배너등록','inquiry',x.id,x.company_name||''); res.redirect('/admin#inquiries');});
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
  const expiryStats={
    expired:vendorRows.filter(v=>v.expire_at&&new Date(v.expire_at)<new Date(new Date().toISOString().slice(0,10))).length,
    expiring7:vendorRows.filter(v=>{
      if(!v.expire_at)return false;
      const today=new Date(); today.setHours(0,0,0,0);
      const exp=new Date(v.expire_at); exp.setHours(0,0,0,0);
      const d=Math.ceil((exp-today)/(1000*60*60*24));
      return d>=0&&d<=7;
    }).length,
    activePaid:vendorRows.filter(v=>v.status==='active'&&(!v.expire_at||new Date(v.expire_at)>=new Date(new Date().toISOString().slice(0,10)))).length
  };
  const dashboardStats={
    regions:groupCount(vendorRows,'region'),
    categories:groupCount(vendorRows,'category'),
    status:Object.entries(vendorRows.reduce((m,v)=>{const k=v.status||'active';m[k]=(m[k]||0)+1;return m;},{})),
    popular:enrichedVendors.slice().sort((a,b)=>b.popularity_score-a.popularity_score).slice(0,10),
    reviewTop:enrichedVendors.slice().sort((a,b)=>b.review_count_calc-a.review_count_calc||b.avg_rating_calc-a.avg_rating_calc).slice(0,10),
    reportTop:enrichedVendors.slice().sort((a,b)=>b.report_count_calc-a.report_count_calc).slice(0,10),
    expiry:expiryStats
  };
  const paidRows=paymentLogs.rows||[];
  const now=new Date();
  const monthKey=now.toISOString().slice(0,7);
  const todayKey=now.toISOString().slice(0,10);
  const dateKey=x=>x?new Date(x).toISOString().slice(0,10):'';
  const monthOf=x=>x?new Date(x).toISOString().slice(0,7):'';
  const sumKrw=arr=>arr.reduce((s,x)=>s+Number(x.krw_price||0),0);
  const paymentStatusStats={waiting:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='waiting').length,unpaid:[...bannerRequests.rows,...adRequests.rows].filter(x=>!x.payment_status||x.payment_status==='unpaid').length,paid:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='paid').length,rejected:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='rejected').length,cancelled:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='cancelled').length};
  const revenueStats={
    today:sumKrw(paidRows.filter(x=>dateKey(x.paid_at)===todayKey)),
    month:sumKrw(paidRows.filter(x=>monthOf(x.paid_at)===monthKey)),
    total:sumKrw(paidRows),
    count:paidRows.length,
    general:paidRows.filter(x=>x.product_type==='general').length,
    recommended:paidRows.filter(x=>x.product_type==='recommended').length,
    banner:paidRows.filter(x=>x.product_type==='banner').length,
    recent:paidRows.slice(0,10),
    statuses:paymentStatusStats
  };
  res.render('admin',{users:users.rows,vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,events:events.rows,notices:notices.rows,inquiries:inquiries.rows,flags:flags.rows,vendorRequests:vendorRequests.rows,bannerRequests:bannerRequests.rows,adRequests:adRequests.rows,adminLogs:adminLogs.rows,paymentLogs:paidRows,revenueStats,settings,dashboardStats});
});

app.get('/mypage',login,async(req,res)=>{await refreshSessionUser(req); if(req.session.user.is_vendor)return res.redirect('/vendor-dashboard?panel=upgrade'); const reviews=await q('SELECT r.*,v.name vendor_name FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id WHERE r.user_id=$1 ORDER BY r.id DESC',[req.session.user.id]); const favorites=await q('SELECT f.*,v.name vendor_name,v.region,v.category FROM favorites f LEFT JOIN vendors v ON v.id=f.vendor_id WHERE f.user_id=$1 ORDER BY f.id DESC',[req.session.user.id]); res.render('mypage',{reviews:reviews.rows,favorites:favorites.rows});});

app.get('/vendor-apply',login,async(req,res)=>{await refreshSessionUser(req); if(req.session.user.is_vendor&&req.session.user.vendor_id)return res.redirect('/vendor-dashboard'); const settings=await getSettings(); const pending=await q("SELECT id FROM inquiries WHERE user_id=$1 AND type='apply' AND status='new' LIMIT 1",[req.session.user.id]); res.render('vendor-apply',{settings,error:null,done:!!pending.rows[0]});});

app.post('/vendor-apply',login,upload.single('image'),async(req,res)=>{try{await refreshSessionUser(req); if(req.session.user.is_vendor&&req.session.user.vendor_id)return res.redirect('/vendor-dashboard'); const exists=await q("SELECT id FROM inquiries WHERE user_id=$1 AND type='apply' AND status='new' LIMIT 1",[req.session.user.id]); if(exists.rows[0])return res.render('vendor-apply',{settings:await getSettings(),error:null,done:true}); const im=img(req.file); await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,status,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',['apply',req.body.company_name,req.session.user.nickname,req.body.phone,req.body.kakao_url,req.body.email,req.body.category,req.body.region,req.body.content,im,'new',req.session.user.id]); res.render('vendor-apply',{settings:await getSettings(),error:null,done:true});}catch(e){res.render('vendor-apply',{settings:await getSettings(),error:e.message||'신청 실패',done:false});}});

app.get('/vendor-dashboard',login,async(req,res)=>{
  try{
    await ensureSchema();
    await expireAds();
    await refreshSessionUser(req);

    if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');

    const settings=await getSettings();
    const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]);
    const vendor=v.rows[0];

    if(!vendor){
      return res.render('vendor-dashboard',{
        vendor:null,
        requests:[],
        bannerRequests:[],
        adRequests:[],
        paymentLogs:[],
        viewStats:{today_views:0,week_views:0,month_views:0},
        expiryNotice:null,
        pricingPreview:{renewal_general:0,renewal_recommended:0,renewal_banner:0,recommended_upgrade:0,banner_from_general:0,banner_from_recommended:0,remainDays:0},
        pendingPayment:null,
        stats:{review_count:0,avg_rating:'-',favorite_count:0,report_count:0},
        settings,
        error:null,
        done:false
      });
    }

    const safeRows=async(sql,params=[])=>{
      try{const r=await q(sql,params); return r.rows||[];}catch(e){console.error('vendor-dashboard safeRows error',e.message); return [];}
    };
    const safeOne=async(sql,params=[],fallback={})=>{
      try{const r=await q(sql,params); return r.rows[0]||fallback;}catch(e){console.error('vendor-dashboard safeOne error',e.message); return fallback;}
    };

    const requests=await safeRows('SELECT * FROM vendor_update_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]);
    const bannerRequests=await safeRows('SELECT * FROM vendor_banner_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]);
    const adRequests=await safeRows('SELECT * FROM vendor_ad_requests WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]);
    const paymentLogs=await safeRows('SELECT * FROM payment_logs WHERE vendor_id=$1 ORDER BY id DESC',[req.session.user.vendor_id]);

    const stats=await safeOne(`SELECT
      (SELECT COUNT(*)::int FROM reviews WHERE vendor_id=$1) review_count,
      (SELECT ROUND(AVG(rating)::numeric,1) FROM reviews WHERE vendor_id=$1) avg_rating,
      (SELECT COUNT(*)::int FROM favorites WHERE vendor_id=$1) favorite_count,
      (SELECT COUNT(*)::int FROM flags WHERE type='vendor' AND target_id=$1) report_count`,[req.session.user.vendor_id],{review_count:0,avg_rating:'-',favorite_count:0,report_count:0});

    const viewStats=await safeOne(`SELECT
      (SELECT COUNT(*)::int FROM vendor_view_logs WHERE vendor_id=$1 AND created_at>=CURRENT_DATE) today_views,
      (SELECT COUNT(*)::int FROM vendor_view_logs WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-INTERVAL '7 days') week_views,
      (SELECT COUNT(*)::int FROM vendor_view_logs WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-INTERVAL '30 days') month_views`,[req.session.user.vendor_id],{today_views:0,week_views:0,month_views:0});

    let expiryNotice=null;
    if(vendor?.expire_at){
      const today=new Date(); today.setHours(0,0,0,0);
      const exp=new Date(vendor.expire_at); exp.setHours(0,0,0,0);
      const daysLeft=Math.ceil((exp-today)/(1000*60*60*24));
      if(daysLeft<=7)expiryNotice={daysLeft,expire_at:vendor.expire_at};
    }

    const pricingPreview={
      renewal_general:calcProductPrice(settings,vendor,'renewal_general','30',false),
      renewal_recommended:calcProductPrice(settings,vendor,'renewal_recommended','30',false),
      renewal_banner:calcProductPrice(settings,vendor,'renewal_banner','30',false),
      recommended_upgrade:0,
      banner_from_general:0,
      banner_from_recommended:0,
      remainDays:daysLeftUntil(vendor?.expire_at)
    };

    let pendingPayment=null;
    if(req.query.pay&&req.query.id){
      if(req.query.pay==='ad'){
        const pr=await safeRows('SELECT * FROM vendor_ad_requests WHERE id=$1 AND user_id=$2',[req.query.id,req.session.user.id]);
        if(pr[0])pendingPayment={kind:'ad',row:pr[0]};
      }else if(req.query.pay==='banner'){
        const pr=await safeRows('SELECT * FROM vendor_banner_requests WHERE id=$1 AND user_id=$2',[req.query.id,req.session.user.id]);
        if(pr[0])pendingPayment={kind:'banner',row:pr[0]};
      }
    }

    res.render('vendor-dashboard',{vendor,requests,bannerRequests,adRequests,paymentLogs,viewStats,expiryNotice,pricingPreview,pendingPayment,stats,settings,error:null,done:false});
  }catch(e){
    console.error('vendor-dashboard fatal error',e);
    res.status(500).send('업체관리 페이지 오류가 발생했습니다. 서버 로그를 확인해주세요.');
  }
});

app.post('/vendor-dashboard/update-request',login,upload.single('image'),async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');
  const im=img(req.file);
  await q(
    'INSERT INTO vendor_update_requests(user_id,vendor_id,name,category,region,phone,kakao_url,business_hours,tags,description,image_data,sns_url,line_url,telegram_url,holiday_info) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
    [req.session.user.id,req.session.user.vendor_id,req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,req.body.business_hours,req.body.tags,req.body.description,im,req.body.sns_url,req.body.line_url,req.body.telegram_url,req.body.holiday_info]
  );
  res.redirect('/vendor-dashboard');
});

app.post('/vendor-dashboard/banner-request',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');

  const settings=await getSettings();
  const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]);
  const vendor=v.rows[0]||{};
  if(!vendor.image_data)return res.redirect('/vendor-dashboard?panel=banner');
  const pending=await q("SELECT id FROM vendor_banner_requests WHERE user_id=$1 AND vendor_id=$2 AND status='new' LIMIT 1",[req.session.user.id,req.session.user.vendor_id]);
  if(pending.rows[0])return res.redirect('/vendor-dashboard?panel=banner&pay=banner&id='+pending.rows[0].id);

  const price=(vendor.ad_type==='recommended')
    ? Number(settings.raw.recommended_to_banner_price_krw||settings.raw.banner_price_krw||0)
    : Number(settings.raw.general_to_banner_price_krw||0);

  const rate=Number(settings.raw.usdt_krw_rate||1400);
  const usdt=calcUsdt(price,rate);

  const inserted=await q(
    'INSERT INTO vendor_banner_requests(user_id,vendor_id,title,subtitle,link_url,image_data,krw_price,usdt_amount,payment_status,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [
      req.session.user.id,
      req.session.user.vendor_id,
      vendor.name||'프리미엄배너',
      vendor.description||vendor.category||'',
      vendor.kakao_url||'',
      vendor.image_data||'',
      price,
      usdt,
      'unpaid',
      'new'
    ]
  );

  res.redirect('/vendor-dashboard?panel=banner&pay=banner&id='+inserted.rows[0].id);
});

app.post('/vendor-dashboard/ad-request',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');

  const settings=await getSettings();
  const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]);
  const vendor=v.rows[0]||{};

  const productType=req.body.product_type||'renewal_general';
  const pending=await q("SELECT id,product_type FROM vendor_ad_requests WHERE user_id=$1 AND vendor_id=$2 AND status='new' AND product_type=$3 LIMIT 1",[req.session.user.id,req.session.user.vendor_id,productType]);
  if(pending.rows[0])return res.redirect('/vendor-dashboard?panel='+(productType==='renewal_banner'?'banner':'plan')+'&pay=ad&id='+pending.rows[0].id);
  const period=req.body.period||'30';
  const immediateApply=!!req.body.immediate_apply;

  const price=calcProductPrice(settings,vendor,productType,period,immediateApply);
  const rate=Number(settings.raw.usdt_krw_rate||1400);
  const usdt=calcUsdt(price,rate);

  const productLabel=productType==='renewal_banner'
    ? '프리미엄배너 신청/연장'
    : productType==='renewal_recommended'
      ? '추천광고 신청/변경/연장'
      : '일반광고 신청/변경/연장';

  const content=[
    req.body.content||'',
    immediateApply?'[바로 적용 요청]':''
  ].filter(Boolean).join('\n');

  const inserted=await q(
    'INSERT INTO vendor_ad_requests(user_id,vendor_id,plan,period,content,status,payment_status,product_type,krw_price,usdt_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [req.session.user.id,req.session.user.vendor_id,productLabel,period,content,'new','unpaid',productType,price,usdt]
  );

  const panel=productType==='renewal_banner'?'banner':'plan';
  res.redirect('/vendor-dashboard?panel='+panel+'&pay=ad&id='+inserted.rows[0].id);
});

app.post('/vendor-dashboard/ad-request/:id/paid',login,async(req,res)=>{
  if(!req.session.user.is_vendor)return res.redirect('/login');
  await q("UPDATE vendor_ad_requests SET payment_status=$1 WHERE id=$2 AND user_id=$3 AND status='new' AND payment_status='unpaid'",['waiting',req.params.id,req.session.user.id]);
  res.redirect('/vendor-dashboard');
});

app.post('/admin/banner-requests/:id/approve',admin,async(req,res)=>{const r=await q('SELECT * FROM vendor_banner_requests WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x)return res.redirect('/admin#bannerRequests'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data]); await q('UPDATE vendor_banner_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]); await logAdmin(req,'배너신청 승인','banner_request',x.id,req.body.admin_memo||''); res.redirect('/admin#bannerRequests');});




app.post('/vendor-dashboard/banner-request/:id/paid',login,async(req,res)=>{
  if(!req.session.user.is_vendor)return res.redirect('/login');
  await q("UPDATE vendor_banner_requests SET payment_status=$1 WHERE id=$2 AND user_id=$3 AND status='new' AND payment_status='unpaid'",['waiting',req.params.id,req.session.user.id]);
  res.redirect('/vendor-dashboard?panel=banner');
});

app.post('/vendor-dashboard/banner-request/:id/cancel',login,async(req,res)=>{
  if(!req.session.user.is_vendor)return res.redirect('/login');
  await q("UPDATE vendor_banner_requests SET status='cancelled',payment_status='cancelled',admin_memo=COALESCE(admin_memo,'업체가 취소'),processed_at=now() WHERE id=$1 AND user_id=$2 AND status='new'",[req.params.id,req.session.user.id]);
  res.redirect('/vendor-dashboard');
});
app.post('/vendor-dashboard/ad-request/:id/cancel',login,async(req,res)=>{
  if(!req.session.user.is_vendor)return res.redirect('/login');
  await q("UPDATE vendor_ad_requests SET status='cancelled',payment_status='cancelled',admin_memo=COALESCE(admin_memo,'업체가 취소'),processed_at=now() WHERE id=$1 AND user_id=$2 AND status='new'",[req.params.id,req.session.user.id]);
  res.redirect('/vendor-dashboard');
});

app.post('/admin/banner-requests/:id/payment-confirm',admin,async(req,res)=>{
  const r=await q('SELECT * FROM vendor_banner_requests WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x)return res.redirect('/admin#bannerRequests');
  if(x.status!=='new'||x.payment_status!=='waiting')return res.redirect('/admin#bannerRequests');

  const v=await q('SELECT * FROM vendors WHERE id=$1',[x.vendor_id]);
  const vendor=v.rows[0];
  const until=vendor?.expire_at||new Date().toISOString().slice(0,10);

  await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data]);
  await q("UPDATE vendors SET ad_type='recommended',membership_type=$1,is_recommended=true,is_premium=true,banner_active=true,banner_until=$2,status=$3 WHERE id=$4",['recommended',until,'active',x.vendor_id]);
  await q('UPDATE vendor_banner_requests SET payment_status=$1,status=$2,admin_memo=$3,processed_at=now() WHERE id=$4',['paid','approved',(req.body.admin_memo||'입금확인 완료').slice(0,500),x.id]);
  await q('INSERT INTO payment_logs(user_id,vendor_id,product_type,request_type,request_id,krw_price,usdt_amount,status,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[x.user_id,x.vendor_id,'banner','banner_request',x.id,x.krw_price||0,x.usdt_amount||0,'paid',req.body.admin_memo||'프리미엄배너 입금확인']);
  await logAdmin(req,'배너 입금확인/추천승격','banner_request',x.id,`만기일 ${until}`);
  res.redirect('/admin#bannerRequests');
});
app.post('/admin/ad-requests/:id/payment-confirm',admin,async(req,res)=>{
  const r=await q('SELECT * FROM vendor_ad_requests WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x)return res.redirect('/admin#adRequests');
  if(x.status!=='new'||x.payment_status!=='waiting')return res.redirect('/admin#adRequests');

  const vendorRes=await q('SELECT * FROM vendors WHERE id=$1',[x.vendor_id]);
  const vendor=vendorRes.rows[0]||{};
  const days=parseInt(x.period||30,10)||30;
  const productType=x.product_type||'renewal_general';
  const wantsImmediate=(x.content||'').includes('[바로 적용 요청]');
  const oldExpire=vendor.expire_at||null;

  if(productType==='renewal_general'){
    await q(`UPDATE vendors SET ad_type='general',membership_type='general',is_recommended=false,is_premium=false,banner_active=false,banner_until=NULL,status='active', ${addDaysSqlFromExpire()}, scheduled_membership_type=NULL, scheduled_banner_active=NULL, scheduled_change_at=NULL, scheduled_change_note=NULL WHERE id=$2`,[days,x.vendor_id]);
  }else if(productType==='renewal_recommended'){
    if((vendor.membership_type||'general')==='general' && !wantsImmediate && oldExpire){
      await q(`UPDATE vendors SET status='active', ${addDaysSqlFromExpire()}, scheduled_membership_type='recommended', scheduled_banner_active=false, scheduled_change_at=$3, scheduled_change_note=$4 WHERE id=$2`,[days,x.vendor_id,oldExpire,'일반 기간 종료 후 추천업체로 변경']);
    }else{
      await q(`UPDATE vendors SET ad_type='recommended',membership_type='recommended',is_recommended=true,is_premium=false,banner_active=false,banner_until=NULL,status='active', ${addDaysSqlFromExpire()}, scheduled_membership_type=NULL, scheduled_banner_active=NULL, scheduled_change_at=NULL, scheduled_change_note=NULL WHERE id=$2`,[days,x.vendor_id]);
    }
  }else if(productType==='renewal_banner'){
    await q(`UPDATE vendors SET ad_type='recommended',membership_type='recommended',is_recommended=true,is_premium=true,banner_active=true,status='active', ${addDaysSqlFromExpire()}, banner_until=expire_at, scheduled_membership_type=NULL, scheduled_banner_active=NULL, scheduled_change_at=NULL, scheduled_change_note=NULL WHERE id=$2`,[days,x.vendor_id]);
  }

  await q('UPDATE vendor_ad_requests SET payment_status=$1,status=$2,admin_memo=$3,processed_at=now() WHERE id=$4',['paid','approved',(req.body.admin_memo||'입금확인 완료').slice(0,500),x.id]);

  const paymentProduct=productType==='renewal_banner'?'banner':(productType==='renewal_general'?'general':'recommended');
  await q('INSERT INTO payment_logs(user_id,vendor_id,product_type,request_type,request_id,krw_price,usdt_amount,status,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[x.user_id,x.vendor_id,paymentProduct,'ad_request',x.id,x.krw_price||0,x.usdt_amount||0,'paid',req.body.admin_memo||x.plan||'변경/연장 입금확인']);

  await logAdmin(req,'변경/연장 입금확인','ad_request',x.id,`${x.plan||productType} 적용`);
  res.redirect('/admin#adRequests');
});
app.post('/admin/banner-requests/:id/reject',admin,async(req,res)=>{await q("UPDATE vendor_banner_requests SET status=$1,payment_status=$2,admin_memo=$3,processed_at=now() WHERE id=$4 AND status='new'",['rejected','rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'배너신청 반려','banner_request',req.params.id,req.body.admin_memo||''); res.redirect('/admin#bannerRequests');});

app.post('/admin/ad-requests/:id/approve',admin,async(req,res)=>{res.redirect('/admin#adRequests');});

app.post('/admin/ad-requests/:id/reject',admin,async(req,res)=>{await q("UPDATE vendor_ad_requests SET status=$1,payment_status=$2,admin_memo=$3,processed_at=now() WHERE id=$4 AND status='new'",['rejected','rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'상품/광고신청 반려','ad_request',req.params.id,req.body.admin_memo||''); res.redirect('/admin#adRequests');});

app.post('/admin/vendor-requests/:id/approve',admin,async(req,res)=>{
  const r=await q('SELECT * FROM vendor_update_requests WHERE id=$1',[req.params.id]);
  const x=r.rows[0];
  if(!x||x.status!=='new')return res.redirect('/admin#vendorRequests');

  const params=[x.name,x.category,x.region,x.phone,x.kakao_url,x.business_hours,x.tags,x.description,x.sns_url,x.line_url,x.telegram_url,x.holiday_info,x.vendor_id];

  if(x.image_data){
    await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,business_hours=$6,tags=$7,description=$8,sns_url=$9,line_url=$10,telegram_url=$11,holiday_info=$12,image_data=$14,image_updated_at=now() WHERE id=$13',[...params,x.image_data]);
  }else{
    await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,business_hours=$6,tags=$7,description=$8,sns_url=$9,line_url=$10,telegram_url=$11,holiday_info=$12 WHERE id=$13',params);
  }

  await q('UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]);
  await logAdmin(req,'업체수정요청 승인','vendor_update_request',x.id,req.body.admin_memo||'');
  res.redirect('/admin#vendorRequests');
});
app.post('/admin/vendor-requests/:id/reject',admin,async(req,res)=>{await q("UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3 AND status='new'",['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); await logAdmin(req,'업체수정요청 반려','vendor_update_request',req.params.id,req.body.admin_memo||''); res.redirect('/admin#vendorRequests');});

app.post('/admin/link-user-vendor',admin,async(req,res)=>{const userId=parseInt(req.body.user_id||0,10); const vendorId=parseInt(req.body.vendor_id||0,10); if(userId&&vendorId){await q('UPDATE users SET is_vendor=true,vendor_id=$1 WHERE id=$2',[vendorId,userId]); await logAdmin(req,'회원 업체연결','user',userId,`vendor_id=${vendorId}`);} await logAdmin(req,'회원 수정','user',req.body.id,req.body.nickname||''); res.redirect('/admin#users');});




app.post('/admin/banner-requests/:id/cancel',admin,async(req,res)=>{
  await q("UPDATE vendor_banner_requests SET status='cancelled',payment_status='cancelled',admin_memo=$1,processed_at=now() WHERE id=$2 AND status='new'",[(req.body.admin_memo||'관리자 취소').slice(0,500),req.params.id]);
  await logAdmin(req,'배너신청 취소','banner_request',req.params.id,req.body.admin_memo||'관리자 취소');
  res.redirect('/admin#bannerRequests');
});

app.post('/admin/ad-requests/:id/cancel',admin,async(req,res)=>{
  await q("UPDATE vendor_ad_requests SET status='cancelled',payment_status='cancelled',admin_memo=$1,processed_at=now() WHERE id=$2 AND status='new'",[(req.body.admin_memo||'관리자 취소').slice(0,500),req.params.id]);
  await logAdmin(req,'상품/광고신청 취소','ad_request',req.params.id,req.body.admin_memo||'관리자 취소');
  res.redirect('/admin#adRequests');
});

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

  await q('BEGIN');
  try{
    const tables=[
      'payment_logs',
      'vendor_view_logs',
      'vendor_ad_requests',
      'vendor_banner_requests',
      'vendor_update_requests',
      'flags',
      'reviews',
      'favorites',
      'banners',
      'inquiries',
      'notices',
      'admin_logs',
      'vendors'
    ];

    for(const table of tables){
      await q(`DELETE FROM ${table}`);
    }

    await q("DELETE FROM users WHERE role <> 'admin'");

    for(const table of tables){
      await q(`ALTER SEQUENCE IF EXISTS ${table}_id_seq RESTART WITH 1`);
    }

    await q("SELECT setval(pg_get_serial_sequence('users','id'), COALESCE((SELECT MAX(id) FROM users),0)+1, false)");

    await q('COMMIT');
  }catch(e){
    await q('ROLLBACK');
    console.error('reset-data error',e);
    return res.redirect('/admin#settings');
  }

  await logAdmin(req,'초기화','system','all','관리자 계정과 환경설정을 제외한 전체 운영 데이터 초기화');
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
  const adType=req.body.ad_type||'none';
  const membership=adType==='recommended'?'recommended':'general';
  const bannerActive=!!req.body.banner_active;
  const isRecommended=adType==='recommended';
  const isPremium=bannerActive;

  if(req.body.id){
    const params=[
      req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,
      req.body.tags,req.body.description,req.body.business_hours,isRecommended,isPremium,
      req.body.status||'active',membership,adType,req.body.expire_at||null,bannerActive,req.body.banner_until||null,
      req.body.sns_url||'',req.body.line_url||'',req.body.telegram_url||'',req.body.holiday_info||'',req.body.id
    ];
    if(im){
      await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11,membership_type=$12,ad_type=$13,expire_at=$14,banner_active=$15,banner_until=$16,sns_url=$17,line_url=$18,telegram_url=$19,holiday_info=$20,image_data=$22,image_updated_at=now() WHERE id=$21',[...params,im]);
    }else{
      await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11,membership_type=$12,ad_type=$13,expire_at=$14,banner_active=$15,banner_until=$16,sns_url=$17,line_url=$18,telegram_url=$19,holiday_info=$20 WHERE id=$21',params);
    }
  }else{
    await q('INSERT INTO vendors(name,category,region,phone,kakao_url,tags,description,business_hours,is_recommended,is_premium,image_data,membership_type,ad_type,expire_at,banner_active,banner_until,status,sns_url,line_url,telegram_url,holiday_info) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)',[
      req.body.name,req.body.category,req.body.region,req.body.phone,req.body.kakao_url,
      req.body.tags,req.body.description,req.body.business_hours,isRecommended,isPremium,im,
      membership,adType,req.body.expire_at||null,bannerActive,req.body.banner_until||null,req.body.status||'active',
      req.body.sns_url||'',req.body.line_url||'',req.body.telegram_url||'',req.body.holiday_info||''
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
