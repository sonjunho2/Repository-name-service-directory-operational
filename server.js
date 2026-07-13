require('dotenv').config();
const express=require('express'), session=require('express-session'), bcrypt=require('bcryptjs'), multer=require('multer');
const fs=require('fs'), path=require('path');
const {Pool}=require('pg'); const PgSession=require('connect-pg-simple')(session);
const app=express(); const upload=multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024}, fileFilter:(req,file,cb)=>{/image\/(jpeg|png|gif|jpg|webp)/.test(file.mimetype)?cb(null,true):cb(new Error('이미지는 JPG, PNG, GIF, WEBP만 가능합니다.'))}});
const pool=new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_URL?.includes('supabase')?{rejectUnauthorized:false}:undefined});
const q=(s,p=[])=>pool.query(s,p);
function validImageBuffer(file){
  if(!file||!file.buffer||!file.mimetype)return false;
  const b=file.buffer;
  const mime=String(file.mimetype||'').toLowerCase();
  if(mime==='image/png')return b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
  if(mime==='image/jpeg'||mime==='image/jpg')return b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  if(mime==='image/gif')return b.length>6&&b.slice(0,3).toString()==='GIF';
  if(mime==='image/webp')return b.length>12&&b.slice(0,4).toString()==='RIFF'&&b.slice(8,12).toString()==='WEBP';
  return false;
}
const img=f=>f&&validImageBuffer(f)?`data:${f.mimetype};base64,${f.buffer.toString('base64')}`:null;
async function ensureSchema(){
    await q(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, nickname TEXT NOT NULL, role TEXT DEFAULT 'user', status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS vendors(id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, region TEXT NOT NULL, phone TEXT, tags TEXT, description TEXT, business_hours TEXT, image_data TEXT, is_recommended BOOLEAN DEFAULT false, is_premium BOOLEAN DEFAULT false, status TEXT DEFAULT 'active', views INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS banners(id SERIAL PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, link_url TEXT, image_data TEXT, position TEXT DEFAULT 'premium', sort_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS reviews(id SERIAL PRIMARY KEY, vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, title TEXT NOT NULL, content TEXT NOT NULL, rating INTEGER DEFAULT 5, status TEXT DEFAULT 'visible', created_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS events(id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, image_data TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS notices(id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, is_pinned BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT now())`);
    await q('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kakao_url text'); await q(`CREATE TABLE IF NOT EXISTS inquiries(id SERIAL PRIMARY KEY,type text,company_name text,name text,phone text,kakao text,email text,category text,region text,content text,main_image_data text,banner_image_data text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS banner_status text DEFAULT 'new'"); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS user_id int"); await q("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS vendor_id int"); await q(`CREATE TABLE IF NOT EXISTS flags(id SERIAL PRIMARY KEY,type text,target_id int,reason text,content text,status text DEFAULT 'new',created_at timestamp DEFAULT now())`); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS admin_memo text"); await q("ALTER TABLE flags ADD COLUMN IF NOT EXISTS processed_at timestamp"); await q(`CREATE TABLE IF NOT EXISTS app_settings(key text PRIMARY KEY, value text DEFAULT '')`); await q("INSERT INTO app_settings(key,value) VALUES('categories','카페\n뷰티\n맛집\n교육\n기타') ON CONFLICT (key) DO NOTHING"); await q("INSERT INTO app_settings(key,value) VALUES('regions','서울\n부산\n대구\n인천\n광주\n대전\n제주') ON CONFLICT (key) DO NOTHING"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_id int"); await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()"); await q(`CREATE TABLE IF NOT EXISTS vendor_update_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,name text,category text,region text,phone text,kakao_url text,business_hours text,tags text,description text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_banner_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,title text,subtitle text,link_url text,image_data text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q(`CREATE TABLE IF NOT EXISTS vendor_ad_requests(id SERIAL PRIMARY KEY,user_id int,vendor_id int,plan text,period text,content text,status text DEFAULT 'new',admin_memo text,created_at timestamp DEFAULT now(),processed_at timestamp)`); await q("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS ad_until date");
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
    await q("ALTER TABLE vendor_banner_requests ADD COLUMN IF NOT EXISTS payment_expires_at timestamp");
    await q("ALTER TABLE vendor_banner_requests ADD COLUMN IF NOT EXISTS paid_usdt_amount numeric");
    await q("ALTER TABLE vendor_banner_requests ADD COLUMN IF NOT EXISTS payment_txid text");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS krw_price int");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS usdt_amount numeric");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS payment_expires_at timestamp");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS paid_usdt_amount numeric");
    await q("ALTER TABLE vendor_ad_requests ADD COLUMN IF NOT EXISTS payment_txid text");
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
    await q("INSERT INTO app_settings(key,value) VALUES('site_name','서비스 디렉터리') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('brand_show_logo','off') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('brand_show_name','on') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('site_logo_data','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('site_favicon_data','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('site_link_url','/') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('brand_logo_height','56') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('brand_name_size','32') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_auto','on') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_source','auto') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_margin_percent','0') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_last_value','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_last_source','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_updated_at','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('usdt_rate_error','') ON CONFLICT (key) DO NOTHING");
    await q("INSERT INTO app_settings(key,value) VALUES('payment_expire_hours','24') ON CONFLICT (key) DO NOTHING");

    await q(`CREATE TABLE IF NOT EXISTS notifications(id SERIAL PRIMARY KEY,user_id int,role_target text DEFAULT 'user',type text,title text,message text,link_url text,is_read boolean DEFAULT false,created_at timestamp DEFAULT now())`);
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_target_read_created ON notifications(role_target,user_id,is_read,created_at DESC)");
    await q(`CREATE TABLE IF NOT EXISTS payment_logs(id SERIAL PRIMARY KEY,user_id int,vendor_id int,product_type text,request_type text,request_id int,krw_price int,usdt_amount numeric,status text DEFAULT 'paid',memo text,paid_at timestamp DEFAULT now(),created_at timestamp DEFAULT now())`);
    await q("ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS paid_usdt_amount numeric");
    await q("ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS payment_txid text");
    await q(`CREATE TABLE IF NOT EXISTS vendor_view_logs(id SERIAL PRIMARY KEY,vendor_id int,user_id int,created_at timestamp DEFAULT now())`);
    await q("ALTER TABLE banners ADD COLUMN IF NOT EXISTS vendor_id int");
    await q("CREATE INDEX IF NOT EXISTS idx_vendors_status_expire ON vendors(status,expire_at)");
    await q("CREATE INDEX IF NOT EXISTS idx_vendors_region_category ON vendors(region,category)");
    await q("CREATE INDEX IF NOT EXISTS idx_reviews_vendor_status ON reviews(vendor_id,status)");
    await q("CREATE INDEX IF NOT EXISTS idx_favorites_vendor ON favorites(vendor_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_view_logs_vendor_created ON vendor_view_logs(vendor_id,created_at)");
    await q("CREATE INDEX IF NOT EXISTS idx_ad_requests_status_payment ON vendor_ad_requests(status,payment_status)");
    await q("CREATE INDEX IF NOT EXISTS idx_banner_requests_status_payment ON vendor_banner_requests(status,payment_status)");
    await q("CREATE INDEX IF NOT EXISTS idx_ad_requests_payment_expire ON vendor_ad_requests(payment_status,payment_expires_at)");
    await q("CREATE INDEX IF NOT EXISTS idx_banner_requests_payment_expire ON vendor_banner_requests(payment_status,payment_expires_at)");
    await q("CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role,status)");
    await q("CREATE INDEX IF NOT EXISTS idx_vendors_created ON vendors(created_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_vendors_ad_type ON vendors(ad_type,banner_active)");
    await q("CREATE INDEX IF NOT EXISTS idx_inquiries_status_created ON inquiries(status,created_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_flags_status_created ON flags(status,created_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_payment_logs_paid_at ON payment_logs(paid_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_payment_logs_product_type ON payment_logs(product_type)");
    await q("CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_vendor_requests_status_created ON vendor_update_requests(status,created_at DESC)");
    await q(`CREATE TABLE IF NOT EXISTS board_categories(id SERIAL PRIMARY KEY,title TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,description TEXT DEFAULT '',type TEXT DEFAULT 'community',is_active BOOLEAN DEFAULT true,sort_order INTEGER DEFAULT 0,write_role TEXT DEFAULT 'member',comment_enabled BOOLEAN DEFAULT true,image_enabled BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS board_posts(id SERIAL PRIMARY KEY,board_id INTEGER REFERENCES board_categories(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,title TEXT NOT NULL,content TEXT NOT NULL,image_data TEXT,status TEXT DEFAULT 'visible',views INTEGER DEFAULT 0,is_pinned BOOLEAN DEFAULT false,created_at TIMESTAMP DEFAULT now(),updated_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS board_comments(id SERIAL PRIMARY KEY,post_id INTEGER REFERENCES board_posts(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,content TEXT NOT NULL,status TEXT DEFAULT 'visible',created_at TIMESTAMP DEFAULT now())`);
    await q("CREATE INDEX IF NOT EXISTS idx_board_categories_active_sort ON board_categories(is_active,sort_order)");
    await q("CREATE INDEX IF NOT EXISTS idx_board_posts_board_status_pinned_created ON board_posts(board_id,status,is_pinned,created_at DESC)");
    await q("CREATE INDEX IF NOT EXISTS idx_board_comments_post_status_created ON board_comments(post_id,status,created_at)");
    for(const board of [['공지사항','notice','notice','admin'],['자유게시판','free','community','member'],['이용후기','reviews','review','member'],['제보/신고','reports','report','member']]){
      await q('INSERT INTO board_categories(title,slug,type,write_role) VALUES($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING',board);
    }

  }
app.set('trust proxy',1);
app.set('view engine','ejs');
app.use(express.urlencoded({extended:true,limit:'10mb'}));
app.use(express.json({limit:'10mb'}));

/* SITE BRANDING V53
   style.css를 로드하는 모든 페이지에 관리자 브랜딩 크기값을 자동 반영합니다.
   views 파일마다 별도 snippet을 넣지 않아도 홈/마이페이지/업체관리/업체등록/업체상세에 공통 적용됩니다. */
app.get('/public/css/style.css',async(req,res,next)=>{
  try{
    const cssPath=path.join(__dirname,'public','css','style.css');
    let css=await fs.promises.readFile(cssPath,'utf8');

    const r=await q("SELECT key,value FROM app_settings WHERE key IN ('brand_logo_height','brand_name_size','payment_expire_hours')");
    const raw=Object.fromEntries((r.rows||[]).map(x=>[x.key,x.value||'']));
    const clamp=(v,min,max,d)=>{const n=parseInt(v,10);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):d;};
    const logoHeight=clamp(raw.brand_logo_height,24,120,56);
    const nameSize=clamp(raw.brand_name_size,14,72,32);
    const paymentExpireHours=clamp(raw.payment_expire_hours,1,168,24);

    css += `
/* SITE BRANDING V53 - runtime values from admin settings */
:root{--brand-logo-height:${logoHeight}px;--brand-name-size:${nameSize}px;--brand-gap:12px}
.top .site-brand-center,header .site-brand-center{max-width:min(62vw,760px)!important;gap:var(--brand-gap)!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important;text-decoration:none!important;color:#fff!important}
.top .site-brand-center img,header .site-brand-center img{height:var(--brand-logo-height)!important;width:auto!important;max-width:min(42vw,420px)!important;object-fit:contain!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;filter:drop-shadow(0 5px 15px rgba(0,0,0,.55))!important}
.top .site-brand-center span,header .site-brand-center span{display:block!important;max-width:min(44vw,520px)!important;font-size:var(--brand-name-size)!important;line-height:1.05!important;font-weight:1000!important;letter-spacing:-.055em!important;color:#fff!important;background:none!important;-webkit-background-clip:initial!important;background-clip:initial!important;text-shadow:0 4px 18px rgba(0,0,0,.75)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
@media(max-width:900px){:root{--brand-logo-height:${Math.max(24,Math.round(logoHeight*0.75))}px;--brand-name-size:${Math.max(16,Math.round(nameSize*0.75))}px}.top .site-brand-center,header .site-brand-center{max-width:100%!important}.top .site-brand-center img,header .site-brand-center img{max-width:220px!important}.top .site-brand-center span,header .site-brand-center span{max-width:100%!important}}
.paybox{position:relative!important}.paybox:after{content:'입금 안내: 신청 후 ${paymentExpireHours}시간 안에 정확한 USDT 금액을 입금해 주세요. 네트워크가 다르면 입금 확인이 지연되거나 누락될 수 있습니다.';display:block;margin-top:12px;padding:10px 12px;border:1px dashed #ffdc4d;border-radius:12px;background:rgba(255,220,77,.08);color:#ffef9a;font-size:13px;font-weight:800;line-height:1.45}
`;

    res.setHeader('Content-Type','text/css; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.send(css);
  }catch(e){
    next(e);
  }
});
app.use('/public',express.static('public',{maxAge:'30d',etag:true,lastModified:true,immutable:true}));
app.use(session({store:new PgSession({pool,createTableIfMissing:true}), secret:process.env.SESSION_SECRET||'dev-secret', resave:false, saveUninitialized:false, cookie:{maxAge:1000*60*60*12,httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');next();});
app.use((req,res,next)=>{
  if(req.path.startsWith('/admin')||req.path.startsWith('/api')||req.path.startsWith('/vendor-dashboard')){
    res.setHeader('Cache-Control','no-store');
  }
  next();
});


app.use((req,res,next)=>{
  if(req.method==='POST'&&req.path==='/join'&&!rateLimit(req,'join',5,1000*60*15)){
    return res.status(429).send('가입 요청이 많습니다. 잠시 후 다시 시도해주세요.');
  }
  if(req.method==='POST'&&req.path==='/inquiry'&&!rateLimit(req,'inquiry',10,1000*60*15)){
    return res.status(429).send('문의 요청이 많습니다. 잠시 후 다시 시도해주세요.');
  }
  if(req.path.startsWith('/api/')&&!rateLimit(req,'api',240,1000*60)){
    return res.status(429).json({error:'too_many_requests'});
  }
  next();
});

app.use((req,res,next)=>{
  if(req.method!=='POST')return next();
  const origin=req.get('origin');
  if(!origin)return next();
  const expected=`${req.protocol}://${req.get('host')}`;
  if(origin!==expected)return res.status(403).send('잘못된 요청입니다.');
  next();
});

app.use((req,res,next)=>{
  if(req.method==='POST'&&wantsJson(req)){
    const originalRedirect=res.redirect.bind(res);
    res.redirect=function redirectAsJson(url){
      if(res.headersSent)return originalRedirect(url);
      return res.json({ok:true,redirect:url});
    };
  }
  next();
});

const loginAttempts=new Map();
function loginAttemptKey(req,username,prefix='login'){
  return prefix+':'+(req.ip||req.headers['x-forwarded-for']||'ip')+':'+String(username||'').toLowerCase();
}
function loginBlocked(req,username,prefix='login'){
  const key=loginAttemptKey(req,username,prefix);
  const x=loginAttempts.get(key);
  if(!x)return false;
  if(Date.now()>x.until){loginAttempts.delete(key);return false;}
  return true;
}
function loginFail(req,username,prefix='login'){
  const key=loginAttemptKey(req,username,prefix);
  const x=loginAttempts.get(key)||{count:0,until:0};
  x.count+=1;
  if(x.count>=10)x.until=Date.now()+1000*60*15;
  loginAttempts.set(key,x);
}
function loginSuccess(req,username,prefix='login'){
  loginAttempts.delete(loginAttemptKey(req,username,prefix));
}

const requestLimits=new Map();
function rateLimitKey(req,name){
  return name+':'+(req.ip||req.headers['x-forwarded-for']||'ip');
}
function rateLimit(req,name,max,windowMs){
  const key=rateLimitKey(req,name);
  const now=Date.now();
  const x=requestLimits.get(key)||{count:0,reset:now+windowMs};
  if(now>x.reset){x.count=0;x.reset=now+windowMs;}
  x.count+=1;
  requestLimits.set(key,x);
  return x.count<=max;
}
setInterval(expirePendingPayments,1000*60*5).unref?.();

setInterval(()=>{
  const now=Date.now();
  for(const [k,v] of requestLimits.entries()){
    if(now>v.reset)requestLimits.delete(k);
  }
},1000*60*10).unref?.();

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
async function admin(req,res,next){
  try{
    const user=await refreshSessionUser(req);
    if(user&&user.role==='admin')return next();
    delete req.session.user;
    return req.session.save(()=>res.redirect('/admin/login'));
  }catch(e){
    console.error('admin auth failed',e);
    return res.status(500).send('admin auth failed');
  }
}

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

async function createNotification({userId=null,roleTarget='user',type='system',title='',message='',linkUrl=''}){
  try{
    await q(
      'INSERT INTO notifications(user_id,role_target,type,title,message,link_url) VALUES($1,$2,$3,$4,$5,$6)',
      [userId||null,String(roleTarget||'user').slice(0,30),String(type||'system').slice(0,50),String(title||'알림').slice(0,120),String(message||'').slice(0,600),String(linkUrl||'').slice(0,300)]
    );
  }catch(e){
    console.error('notification create failed',e.message);
  }
}
function adminNotify(type,title,message,linkUrl='/admin'){
  return createNotification({roleTarget:'admin',type,title,message,linkUrl});
}
function userNotify(userId,type,title,message,linkUrl='/'){
  if(!userId)return Promise.resolve();
  return createNotification({userId,roleTarget:'user',type,title,message,linkUrl});
}
function notificationTargetSql(req){
  if(req.session.user?.role==='admin')return {where:"role_target='admin'",params:[]};
  return {where:"role_target='user' AND user_id=$1",params:[req.session.user?.id||0]};
}

async function login(req,res,next){
  try{
    const user=await refreshSessionUser(req);
    if(user)return next();
    delete req.session.user;
    const wantsJson=String(req.get('accept')||'').includes('application/json')||req.path.startsWith('/api/');
    if(wantsJson)return res.status(401).json({ok:false,error:'login_required'});
    return req.session.save(()=>res.redirect('/login'));
  }catch(e){
    console.error('login auth failed',e);
    return res.status(500).send('login auth failed');
  }
}

async function refreshSessionUser(req){
  if(!req.session.user?.id)return null;
  const r=await q('SELECT id,username,nickname,role,status,is_vendor,vendor_id FROM users WHERE id=$1',[req.session.user.id]);
  const u=r.rows[0];
  if(!u||u.status!=='active')return null;
  req.session.user={id:u.id,username:u.username,nickname:u.nickname,role:u.role,is_vendor:u.is_vendor,vendor_id:u.vendor_id};
  return req.session.user;
}

async function getBoardCategories(){
  const r=await q(`SELECT b.*,(SELECT COUNT(*)::int FROM board_posts p WHERE p.board_id=b.id AND p.status='visible') post_count FROM board_categories b WHERE b.is_active=true ORDER BY b.sort_order,b.id`);
  return r.rows||[];
}
function canWriteBoard(user,board){
  if(!board)return false;
  if(board.write_role==='admin')return !!user&&user.role==='admin';
  if(board.write_role==='guest')return true;
  return !!user;
}
function boardSlugSafe(slug,title=''){
  const clean=String(slug||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
  if(clean)return clean;
  const fromTitle=String(title||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
  return fromTitle||('board-'+Date.now());
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
function buildPaymentConfirmMeta(body={},row={}){
  const planned=Number(row.usdt_amount||0);
  const entered=String(body.paid_usdt_amount||'').replace(/,/g,'').trim();
  const parsed=entered?Number(entered):planned;
  const paidUsdt=Number.isFinite(parsed)&&parsed>0?parsed:planned;
  const txid=String(body.payment_txid||body.txid||'').trim().slice(0,200);
  const adminMemo=(String(body.admin_memo||'').trim()||'입금확인 완료').slice(0,500);
  const memoParts=[adminMemo];
  if(paidUsdt) memoParts.push('실제입금: '+paidUsdt+' USDT');
  if(txid) memoParts.push('TXID: '+txid);
  return {paidUsdt,txid,adminMemo,memo:memoParts.filter(Boolean).join('\n').slice(0,1000)};
}

function paymentExpireHours(raw={}){
  const n=parseInt(raw.payment_expire_hours||24,10);
  return Number.isFinite(n)?Math.max(1,Math.min(168,n)):24;
}
function paymentExpireAt(raw={}){
  return new Date(Date.now()+paymentExpireHours(raw)*60*60*1000).toISOString();
}
async function expirePendingPayments(){
  try{
    const expiredMemo='결제기한 만료';
    const expiredMemoSql="admin_memo=CASE WHEN COALESCE(admin_memo,'')='' THEN $1 WHEN admin_memo LIKE '%만료%' THEN admin_memo ELSE admin_memo || ' / ' || $1 END";
    const ads=await q(`UPDATE vendor_ad_requests SET status='cancelled',payment_status='cancelled',${expiredMemoSql},processed_at=now() WHERE status='new' AND payment_status='unpaid' AND payment_expires_at IS NOT NULL AND payment_expires_at<now() RETURNING id,user_id,plan,krw_price,usdt_amount`,[expiredMemo]);
    const banners=await q(`UPDATE vendor_banner_requests SET status='cancelled',payment_status='cancelled',${expiredMemoSql},processed_at=now() WHERE status='new' AND payment_status='unpaid' AND payment_expires_at IS NOT NULL AND payment_expires_at<now() RETURNING id,user_id,title,krw_price,usdt_amount`,[expiredMemo]);
    for(const x of ads.rows||[]){
      await userNotify(x.user_id,'payment_expired','결제요청 만료',`${x.plan||'광고 신청'} 결제기한이 만료되어 자동 취소되었습니다.`,'/vendor-dashboard?panel=history');
    }
    for(const x of banners.rows||[]){
      await userNotify(x.user_id,'payment_expired','결제요청 만료','프리미엄배너 신청 결제기한이 만료되어 자동 취소되었습니다.','/vendor-dashboard?panel=history');
    }
  }catch(e){console.error('expire pending payments failed',e.message);}
}

const USDT_RATE_CACHE={value:null,source:'',updatedAt:0,error:''};
const USDT_RATE_CACHE_MS=1000*60*10;
function safeNumber(v){
  const n=Number(v);
  return Number.isFinite(n)?n:0;
}
function clampNumber(v,min,max,d){
  const n=safeNumber(v);
  return n?Math.max(min,Math.min(max,n)):d;
}
async function fetchJsonWithTimeout(url,timeoutMs=4500){
  if(typeof fetch!=='function')throw new Error('fetch unavailable');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{headers:{'Accept':'application/json'},signal:controller.signal});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}
async function fetchUpbitUsdtKrw(){
  const data=await fetchJsonWithTimeout('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
  const price=Number(Array.isArray(data)?data[0]?.trade_price:data?.trade_price);
  if(!Number.isFinite(price)||price<=0)throw new Error('upbit invalid price');
  return {value:price,source:'upbit'};
}
async function fetchBithumbUsdtKrw(){
  const data=await fetchJsonWithTimeout('https://api.bithumb.com/public/ticker/USDT_KRW');
  const price=Number(data?.data?.closing_price||data?.data?.trade_price||data?.data?.prev_closing_price);
  if(!Number.isFinite(price)||price<=0)throw new Error('bithumb invalid price');
  return {value:price,source:'bithumb'};
}
async function fetchExternalUsdtKrw(source){
  const normalized=['upbit','bithumb'].includes(source)?source:'auto';
  const errors=[];
  const sources=normalized==='auto'?['upbit','bithumb']:[normalized];
  for(const src of sources){
    try{
      return src==='bithumb'?await fetchBithumbUsdtKrw():await fetchUpbitUsdtKrw();
    }catch(e){
      errors.push(src+': '+(e.message||'failed'));
    }
  }
  throw new Error(errors.join(' / ')||'rate fetch failed');
}
function applyUsdtRateMargin(value,marginPercent){
  const base=Number(value||0);
  const margin=Number(marginPercent||0);
  if(!Number.isFinite(base)||base<=0)return 0;
  const boundedMargin=Number.isFinite(margin)?Math.max(-10,Math.min(10,margin)):0;
  return Math.round(base*(1+(boundedMargin/100)));
}
async function resolveUsdtKrwRate(raw={},force=false){
  const manual=clampNumber(raw.usdt_krw_rate,100,100000,1400);
  const auto=raw.usdt_rate_auto!=='off';
  const source=(raw.usdt_rate_source||'auto').trim()||'auto';
  const margin=Number(raw.usdt_rate_margin_percent||0);
  const last=clampNumber(raw.usdt_rate_last_value,100,100000,0);

  if(!auto){
    return {value:manual,source:'manual',auto:false,updatedAt:raw.usdt_rate_updated_at||'',error:''};
  }

  if(!force&&USDT_RATE_CACHE.value&&Date.now()-USDT_RATE_CACHE.updatedAt<USDT_RATE_CACHE_MS){
    return {value:USDT_RATE_CACHE.value,source:USDT_RATE_CACHE.source,auto:true,updatedAt:new Date(USDT_RATE_CACHE.updatedAt).toISOString(),error:USDT_RATE_CACHE.error||''};
  }

  try{
    const fetched=await fetchExternalUsdtKrw(source);
    const effective=applyUsdtRateMargin(fetched.value,margin);
    const nowIso=new Date().toISOString();
    USDT_RATE_CACHE.value=effective;
    USDT_RATE_CACHE.source=fetched.source;
    USDT_RATE_CACHE.updatedAt=Date.now();
    USDT_RATE_CACHE.error='';
    await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",['usdt_rate_last_value',String(effective)]);
    await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",['usdt_rate_last_source',fetched.source]);
    await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",['usdt_rate_updated_at',nowIso]);
    await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",['usdt_rate_error','']);
    return {value:effective,source:fetched.source,auto:true,updatedAt:nowIso,error:''};
  }catch(e){
    const msg=String(e.message||'자동 환율 조회 실패').slice(0,500);
    USDT_RATE_CACHE.value=last||manual;
    USDT_RATE_CACHE.source=last?'last_success':'manual_fallback';
    USDT_RATE_CACHE.updatedAt=Date.now();
    USDT_RATE_CACHE.error=msg;
    try{
      await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",['usdt_rate_error',msg]);
    }catch(_e){}
    return {value:last||manual,source:last?'last_success':'manual_fallback',auto:true,updatedAt:raw.usdt_rate_updated_at||'',error:msg};
  }
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

function normalizeBrandSettings(raw){
  const clamp=(v,min,max,d)=>{const n=parseInt(v,10);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):d;};
  const name=(raw.site_name||'서비스 디렉터리').trim()||'서비스 디렉터리';
  const showLogo=raw.brand_show_logo==='on'&&!!raw.site_logo_data;
  const showName=raw.brand_show_name!=='off';
  const link=(raw.site_link_url||'/').trim().slice(0,200)||'/';
  const logoHeight=clamp(raw.brand_logo_height,24,120,56);
  const nameSize=clamp(raw.brand_name_size,14,72,32);
    const paymentExpireHours=clamp(raw.payment_expire_hours,1,168,24);
  return {name,showLogo,showName,logo:raw.site_logo_data||'',favicon:raw.site_favicon_data||'',link,logoHeight,nameSize};
}
async function getSettings(){const r=await q('SELECT key,value FROM app_settings'); const raw=Object.fromEntries(r.rows.map(x=>[x.key,x.value||''])); const split=v=>(v||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const rate=await resolveUsdtKrwRate(raw,false); raw.usdt_krw_manual_rate=raw.usdt_krw_rate||'1400'; raw.usdt_rate_auto=raw.usdt_rate_auto||'on'; raw.usdt_rate_source=raw.usdt_rate_source||'auto'; raw.usdt_rate_margin_percent=raw.usdt_rate_margin_percent||'0'; raw.usdt_rate_effective_value=String(rate.value); raw.usdt_rate_effective_source=rate.source; raw.usdt_rate_effective_auto=rate.auto?'on':'off'; raw.usdt_rate_effective_updated_at=rate.updatedAt||raw.usdt_rate_updated_at||''; raw.usdt_rate_effective_error=rate.error||raw.usdt_rate_error||''; raw.usdt_krw_rate=String(rate.value); raw.payment_expire_hours=String(paymentExpireHours(raw)); return {raw,categories:split(raw.categories),regions:split(raw.regions),brand:normalizeBrandSettings(raw)};}
app.post('/admin/settings/usdt-rate-refresh',admin,async(req,res)=>{
  try{
    const r=await q('SELECT key,value FROM app_settings');
    const raw=Object.fromEntries(r.rows.map(x=>[x.key,x.value||'']));
    const rate=await resolveUsdtKrwRate(raw,true);
    await logAdmin(req,'USDT 환율 수동갱신','settings','usdt-rate',`${rate.value}원 / ${rate.source}`);
    if(wantsJson(req))return res.json({ok:true,rate});
  }catch(e){
    console.error('usdt rate refresh failed',e);
    if(wantsJson(req))return res.status(500).json({ok:false,error:e.message||'환율 갱신 실패'});
  }
  return sendOk(req,res,'/admin#settings');
});

app.get('/api/notifications',login,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const target=notificationTargetSql(req);
    const rows=await q(`SELECT * FROM notifications WHERE ${target.where} ORDER BY id DESC LIMIT 30`,target.params);
    const unread=await q(`SELECT COUNT(*)::int cnt FROM notifications WHERE ${target.where} AND is_read=false`,target.params);
    res.json({ok:true,unread:unread.rows[0]?.cnt||0,items:rows.rows||[],now:new Date().toISOString()});
  }catch(e){
    console.error('notifications api failed',e);
    res.status(500).json({ok:false,error:'알림을 불러오지 못했습니다.'});
  }
});
app.post('/api/notifications/read-all',login,async(req,res)=>{
  try{
    const target=notificationTargetSql(req);
    await q(`UPDATE notifications SET is_read=true WHERE ${target.where}`,target.params);
    res.json({ok:true});
  }catch(e){res.status(500).json({ok:false,error:'읽음 처리 실패'});}
});
app.post('/api/notifications/:id/read',login,async(req,res)=>{
  try{
    const id=parseInt(req.params.id||0,10);
    const target=notificationTargetSql(req);
    await q(`UPDATE notifications SET is_read=true WHERE id=$${target.params.length+1} AND ${target.where}`,[...target.params,id]);
    res.json({ok:true});
  }catch(e){res.status(500).json({ok:false,error:'읽음 처리 실패'});}
});

async function homeData(req){
  await expireAds();
  const search=(req.query.search||'').trim().slice(0,80), region=(req.query.region||'').trim().slice(0,50), category=(req.query.category||'').trim().slice(0,50), sort=(req.query.sort||'default').trim();
  const where=[PUBLIC_VENDOR_SQL];
  const params=[];

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
  const vendors=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 120`,params);
  const banners=await q(`SELECT x.* FROM (
    SELECT b.id,b.title,b.subtitle,b.link_url,b.position,b.sort_order,b.is_active,b.image_data,NULL::int vendor_id,b.created_at,'direct'::text source
    FROM banners b
    WHERE b.is_active=true AND b.vendor_id IS NULL
    UNION ALL
    SELECT COALESCE(linked.id,-v.id) id,v.name title,
      COALESCE(NULLIF(linked.subtitle,''),NULLIF(v.category,''),NULLIF(v.region,''),NULLIF(v.description,''),'') subtitle,
      COALESCE(NULLIF(linked.link_url,''),'/vendor/'||v.id) link_url,
      COALESCE(linked.position,'premium') position,COALESCE(linked.sort_order,0) sort_order,true is_active,
      COALESCE(NULLIF(linked.image_data,''),NULLIF(v.image_data,'')) image_data,v.id vendor_id,
      COALESCE(linked.created_at,v.created_at) created_at,'vendor'::text source
    FROM vendors v
    LEFT JOIN LATERAL (
      SELECT b.id,b.subtitle,b.link_url,b.position,b.sort_order,b.image_data,b.created_at
      FROM banners b WHERE b.vendor_id=v.id ORDER BY b.id DESC LIMIT 1
    ) linked ON true
    WHERE ${PUBLIC_VENDOR_SQL}
      AND COALESCE(v.banner_active,false)=true
      AND v.banner_until IS NOT NULL AND v.banner_until>=CURRENT_DATE
      AND COALESCE(NULLIF(linked.image_data,''),NULLIF(v.image_data,'')) IS NOT NULL
  ) x ORDER BY x.sort_order,x.created_at DESC,x.id DESC`);
  const reviews=await q(`SELECT r.*,v.name vendor_name,u.nickname FROM reviews r JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id WHERE r.status='visible' AND ${PUBLIC_VENDOR_SQL} ORDER BY r.id DESC LIMIT 8`);
  const notices=await q(`SELECT * FROM notices ORDER BY is_pinned DESC,id DESC LIMIT 5`);
  const settings=await getSettings();
  return {vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,notices:notices.rows,query:req.query,settings};
}
app.get('/healthz',async(req,res)=>{try{await q('SELECT 1');res.json({ok:true,db:true,time:new Date().toISOString()});}catch(e){res.status(500).json({ok:false,db:false,error:e.message,time:new Date().toISOString()});}});
app.get('/',async(req,res)=>res.render('index',await homeData(req)));
app.get('/advertise',async(req,res)=>res.render('inquiry',{type:'ad',title:'광고문의',done:false,error:null,settings:await getSettings()}));
app.get('/boards',async(req,res)=>{
  try{
    const boards=await getBoardCategories();
    const ids=boards.map(x=>x.id);
    const recent=ids.length?await q(`SELECT p.id,p.board_id,p.title,p.created_at,u.nickname FROM board_posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.status='visible' AND p.board_id=ANY($1::int[]) ORDER BY p.created_at DESC`,[ids]):{rows:[]};
    const recentByBoard={};
    for(const post of recent.rows||[]){const list=recentByBoard[post.board_id]||(recentByBoard[post.board_id]=[]);if(list.length<5)list.push(post);}
    res.render('board-list',{mode:'categories',boards,board:null,posts:[],recentByBoard,page:1,totalPages:1,qText:'',canWrite:false,settings:await getSettings()});
  }catch(e){console.error('boards list failed',e);res.status(500).send('게시판을 불러오지 못했습니다.');}
});
app.get('/boards/:slug',async(req,res)=>{
  try{
    const boardResult=await q('SELECT * FROM board_categories WHERE slug=$1 AND is_active=true',[String(req.params.slug||'').toLowerCase()]);
    const board=boardResult.rows[0];if(!board)return res.status(404).send('게시판을 찾을 수 없습니다.');
    const page=Math.max(1,parseInt(req.query.page||'1',10)||1),limit=20,offset=(page-1)*limit;
    const qText=String(req.query.q||'').trim().slice(0,100),params=[board.id];
    let search='';if(qText){params.push(`%${qText}%`);search=` AND (p.title ILIKE $2 OR p.content ILIKE $2)`;}
    const count=await q(`SELECT COUNT(*)::int count FROM board_posts p WHERE p.board_id=$1 AND p.status='visible'${search}`,params);
    const total=Number(count.rows[0]?.count||0),totalPages=Math.max(1,Math.ceil(total/limit));
    const rows=await q(`SELECT p.id,p.title,p.views,p.is_pinned,p.created_at,u.nickname,u.username,(SELECT COUNT(*)::int FROM board_comments c WHERE c.post_id=p.id AND c.status='visible') comment_count FROM board_posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.board_id=$1 AND p.status='visible'${search} ORDER BY p.is_pinned DESC,p.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,offset]);
    res.render('board-list',{mode:'posts',boards:await getBoardCategories(),board,posts:rows.rows,recentByBoard:{},page,totalPages,qText,canWrite:!!req.session.user&&canWriteBoard(req.session.user,board),settings:await getSettings()});
  }catch(e){console.error('board posts failed',e);res.status(500).send('게시글을 불러오지 못했습니다.');}
});
app.get('/boards/:slug/write',async(req,res)=>{
  const board=(await q('SELECT * FROM board_categories WHERE slug=$1 AND is_active=true',[String(req.params.slug||'').toLowerCase()])).rows[0];
  if(!board)return res.status(404).send('게시판을 찾을 수 없습니다.');
  if(!req.session.user)return res.redirect('/login');
  if(!canWriteBoard(req.session.user,board))return res.status(403).send('글쓰기 권한이 없습니다.');
  res.render('board-write',{board,settings:await getSettings(),error:null});
});
app.post('/boards/:slug/write',login,upload.single('image'),async(req,res)=>{
  try{
    const board=(await q('SELECT * FROM board_categories WHERE slug=$1 AND is_active=true',[String(req.params.slug||'').toLowerCase()])).rows[0];
    if(!board)return res.status(404).send('게시판을 찾을 수 없습니다.');
    if(!canWriteBoard(req.session.user,board))return res.status(403).send('글쓰기 권한이 없습니다.');
    const title=String(req.body.title||'').trim().slice(0,100),content=String(req.body.content||'').trim().slice(0,5000);
    if(title.length<2||content.length<2)return res.status(400).render('board-write',{board,settings:await getSettings(),error:'제목과 내용을 2자 이상 입력해주세요.'});
    const imageData=board.image_enabled?img(req.file):null;
    const saved=await q('INSERT INTO board_posts(board_id,user_id,title,content,image_data) VALUES($1,$2,$3,$4,$5) RETURNING id',[board.id,req.session.user.id,title,content,imageData]);
    res.redirect(`/boards/${board.slug}/${saved.rows[0].id}`);
  }catch(e){console.error('board write failed',e);res.status(500).send('게시글을 저장하지 못했습니다.');}
});
app.post('/boards/:slug/:id/comments',login,async(req,res)=>{
  const id=parseInt(req.params.id||0,10),content=String(req.body.content||'').trim().slice(0,1000);
  const found=await q(`SELECT p.id,b.slug,b.comment_enabled FROM board_posts p JOIN board_categories b ON b.id=p.board_id WHERE p.id=$1 AND b.slug=$2 AND p.status='visible' AND b.is_active=true`,[id,String(req.params.slug||'').toLowerCase()]);
  if(!found.rows[0])return res.status(404).send('게시글을 찾을 수 없습니다.');
  if(!found.rows[0].comment_enabled)return res.status(403).send('댓글을 사용할 수 없습니다.');
  if(!content)return res.status(400).send('댓글 내용을 입력해주세요.');
  await q('INSERT INTO board_comments(post_id,user_id,content) VALUES($1,$2,$3)',[id,req.session.user.id,content]);
  res.redirect(`/boards/${found.rows[0].slug}/${id}`);
});
app.get('/boards/:slug/:id',async(req,res)=>{
  try{
    const id=parseInt(req.params.id||0,10);if(!id)return res.status(404).send('게시글을 찾을 수 없습니다.');
    const updated=await q(`UPDATE board_posts p SET views=views+1 FROM board_categories b WHERE p.board_id=b.id AND p.id=$1 AND b.slug=$2 AND b.is_active=true AND p.status='visible' RETURNING p.*`,[id,String(req.params.slug||'').toLowerCase()]);
    const post=updated.rows[0];if(!post)return res.status(404).send('게시글을 찾을 수 없습니다.');
    const board=(await q('SELECT * FROM board_categories WHERE id=$1',[post.board_id])).rows[0];
    const author=(await q('SELECT username,nickname FROM users WHERE id=$1',[post.user_id])).rows[0]||{};
    const comments=await q(`SELECT c.*,u.username,u.nickname FROM board_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.status='visible' ORDER BY c.created_at`,[id]);
    res.render('board-post',{board,post:{...post,...author},comments:comments.rows,canWrite:!!req.session.user&&canWriteBoard(req.session.user,board),settings:await getSettings()});
  }catch(e){console.error('board post failed',e);res.status(500).send('게시글을 불러오지 못했습니다.');}
});
app.get('/apply',async(req,res)=>res.render('inquiry',{type:'apply',title:'입점신청',done:false,error:null,settings:await getSettings()}));
app.post('/inquiry',upload.fields([{name:'main_image',maxCount:1},{name:'banner_image',maxCount:1}]),async(req,res)=>{try{const type=['apply','ad'].includes(req.body.type)?req.body.type:'ad'; const company=(req.body.company_name||'').trim().slice(0,100); const phone=(req.body.phone||'').trim().slice(0,50); const content=(req.body.content||'').trim().slice(0,2000); if(!company||!phone||content.length<5)return res.render('inquiry',{type,title:type==='apply'?'입점신청':'광고문의',done:false,error:'업체명, 연락처, 신청 내용을 정확히 입력해주세요.',settings:await getSettings()}); const f=req.files||{}; await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,banner_image_data,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[type,company,(req.body.name||'').trim().slice(0,50),phone,(req.body.kakao||'').trim().slice(0,200),(req.body.email||'').trim().slice(0,120),(req.body.category||'').trim().slice(0,50),(req.body.region||'').trim().slice(0,50),content,img(f.main_image?.[0]),img(f.banner_image?.[0]),req.session.user?.id||null]); res.render('inquiry',{type,title:type==='apply'?'입점신청':'광고문의',done:true,error:null,settings:await getSettings()});}catch(e){res.render('inquiry',{type:req.body.type||'ad',title:req.body.type==='apply'?'입점신청':'광고문의',done:false,error:e.message||'신청 저장 실패',settings:await getSettings()});}});

const PUBLIC_VENDOR_SQL="v.status='active' AND COALESCE(v.ad_type,'none')<>'none' AND v.expire_at IS NOT NULL AND v.expire_at>=CURRENT_DATE";
async function favoriteIdsForUser(userId){
  const r=await q(`SELECT f.vendor_id FROM favorites f JOIN vendors v ON v.id=f.vendor_id WHERE f.user_id=$1 AND ${PUBLIC_VENDOR_SQL} ORDER BY f.id DESC`,[userId]);
  return r.rows.map(x=>Number(x.vendor_id));
}
app.post('/favorite/:id',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){const v=await q(`SELECT id FROM vendors v WHERE v.id=$1 AND ${PUBLIC_VENDOR_SQL}`,[id]); if(v.rows[0])await q('INSERT INTO favorites(user_id,vendor_id) VALUES($1,$2) ON CONFLICT(user_id,vendor_id) DO NOTHING',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});
app.post('/favorite/:id/delete',login,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(id){const v=await q('SELECT id FROM vendors WHERE id=$1',[id]); if(v.rows[0])await q('DELETE FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]);} res.redirect(req.get('referer')||'/');});
app.get('/api/favorites',login,async(req,res)=>{res.json({ok:true,ids:await favoriteIdsForUser(req.session.user.id)});});
app.post('/api/favorite/:id/toggle',login,async(req,res)=>{
  const id=parseInt(req.params.id||0,10);
  if(!id)return res.status(400).json({ok:false,error:'bad_vendor_id'});
  const v=await q(`SELECT id FROM vendors v WHERE v.id=$1 AND ${PUBLIC_VENDOR_SQL}`,[id]);
  if(!v.rows[0])return res.status(404).json({ok:false,error:'vendor_not_found'});
  const existing=await q('SELECT id FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]);
  let favorited=false;
  if(existing.rows[0]){
    await q('DELETE FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,id]);
  }else{
    await q('INSERT INTO favorites(user_id,vendor_id) VALUES($1,$2) ON CONFLICT(user_id,vendor_id) DO NOTHING',[req.session.user.id,id]);
    favorited=true;
  }
  res.json({ok:true,favorited,ids:await favoriteIdsForUser(req.session.user.id)});
});
async function vendorData(req,id,options={}){
  const vendorId=parseInt(id||0,10);
  if(!vendorId)return {vendor:null,reviews:[]};
  const where=['v.id=$1'];
  if(options.publicOnly===true)where.push(PUBLIC_VENDOR_SQL);
  const v=await q(`SELECT v.*, (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating, (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count, (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count FROM vendors v WHERE ${where.join(' AND ')}`,[vendorId]);
  if(!v.rows[0])return {vendor:null,reviews:[]};
  req.session.viewedVendors=req.session.viewedVendors||{};
  if(!req.session.viewedVendors[vendorId]){
    await q('UPDATE vendors SET views=views+1 WHERE id=$1',[vendorId]);
    await q('INSERT INTO vendor_view_logs(vendor_id,user_id) VALUES($1,$2)',[vendorId,req.session.user?.id||null]);
    req.session.viewedVendors[vendorId]=Date.now();
    v.rows[0].views=Number(v.rows[0].views||0)+1;
  }
  if(req.session.user){
    const fav=await q('SELECT 1 FROM favorites WHERE user_id=$1 AND vendor_id=$2',[req.session.user.id,vendorId]);
    v.rows[0].is_favorited=!!fav.rows[0];
  }
  const reviews=await q('SELECT r.*,u.nickname FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.vendor_id=$1 AND r.status=$2 ORDER BY r.id DESC',[vendorId,'visible']);
  return {vendor:v.rows[0],reviews:reviews.rows};
}
app.get('/api/vendor/:id',async(req,res)=>{const data=await vendorData(req,req.params.id,{publicOnly:true}); if(!data.vendor)return res.status(404).json({error:'not found'}); res.json(data);});
app.post('/api/review',login,async(req,res)=>{const vendorId=parseInt(req.body.vendor_id||0,10); const title=(req.body.title||'').trim().slice(0,100); const content=(req.body.content||'').trim().slice(0,1000); if(!vendorId||!title||content.length<5)return res.status(400).json({error:'bad_review'}); const vendor=await q(`SELECT id FROM vendors v WHERE v.id=$1 AND ${PUBLIC_VENDOR_SQL}`,[vendorId]); if(!vendor.rows[0])return res.status(404).json({error:'vendor_not_found'}); const dup=await q("SELECT id FROM reviews WHERE vendor_id=$1 AND user_id=$2 AND created_at>=CURRENT_DATE-INTERVAL '1 day' LIMIT 1",[vendorId,req.session.user.id]); if(dup.rows[0])return res.status(429).json({error:'review_duplicate'}); const ratingRaw=parseInt(req.body.rating,10); const rating=Math.max(1,Math.min(5,Number.isFinite(ratingRaw)?ratingRaw:5)); await q('INSERT INTO reviews(vendor_id,user_id,title,content,rating) VALUES($1,$2,$3,$4,$5)',[vendorId,req.session.user.id,title,content,rating]); res.json({ok:true});});
app.post('/api/flag',async(req,res)=>{const type=(req.body.type||'').trim(); const target=parseInt(req.body.target_id||0,10); const reason=(req.body.reason||'기타').trim().slice(0,50); const content=(req.body.content||'').trim().slice(0,1000); if(!['vendor','review'].includes(type)||!target||!reason.trim()||content.length>1000)return res.status(400).json({error:'bad_request'}); const exists=type==='vendor'?await q(`SELECT id FROM vendors v WHERE v.id=$1 AND ${PUBLIC_VENDOR_SQL}`,[target]):await q(`SELECT r.id FROM reviews r JOIN vendors v ON v.id=r.vendor_id WHERE r.id=$1 AND r.status='visible' AND ${PUBLIC_VENDOR_SQL}`,[target]); if(!exists.rows[0])return res.status(404).json({error:'target_not_found'}); await q('INSERT INTO flags(type,target_id,reason,content) VALUES($1,$2,$3,$4)',[type,target,reason,content]); res.json({ok:true});});
app.get('/vendor/:id',async(req,res)=>{const data=await vendorData(req,req.params.id,{publicOnly:true}); if(!data.vendor)return res.status(404).send('Not found'); res.render('vendor',{...data,settings:await getSettings()});});
app.get('/login',(req,res)=>res.render('login',{mode:'login',error:null})); app.post('/login',async(req,res)=>{const username=(req.body.username||'').trim(); if(loginBlocked(req,username,'user'))return res.status(429).render('login',{mode:'login',error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'}); const u=await q('SELECT * FROM users WHERE username=$1',[username]); if(!u.rows[0]||u.rows[0].status!=='active'||!await bcrypt.compare(req.body.password||'',u.rows[0].password_hash)){loginFail(req,username,'user'); return res.render('login',{mode:'login',error:'아이디 또는 비밀번호가 올바르지 않습니다.'});} loginSuccess(req,username,'user'); req.session.regenerate(err=>{if(err)return res.render('login',{mode:'login',error:'로그인 처리 중 오류가 발생했습니다.'}); req.session.user={id:u.rows[0].id,username:u.rows[0].username,nickname:u.rows[0].nickname,role:u.rows[0].role,is_vendor:u.rows[0].is_vendor,vendor_id:u.rows[0].vendor_id}; res.redirect(u.rows[0].role==='admin'?'/admin':u.rows[0].is_vendor?'/vendor-dashboard':'/');});});
app.get('/join',(req,res)=>res.render('login',{mode:'join',error:null})); app.post('/join',async(req,res)=>{try{const username=(req.body.username||'').trim(); const password=req.body.password||''; const nickname=(req.body.nickname||username).trim().slice(0,50); if(!/^[a-zA-Z0-9_]{4,30}$/.test(username))return res.render('login',{mode:'join',error:'아이디는 영문/숫자/밑줄 4~30자로 입력해주세요.'}); if(password.length<6)return res.render('login',{mode:'join',error:'비밀번호는 6자 이상 입력해주세요.'}); const h=await bcrypt.hash(password,10); await q('INSERT INTO users(username,password_hash,nickname) VALUES($1,$2,$3)',[username,h,nickname||username]); res.redirect('/login')}catch(e){res.render('login',{mode:'join',error:'이미 사용 중인 아이디입니다.'})}});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.post('/review',login,async(req,res)=>{const vendorId=parseInt(req.body.vendor_id||0,10); const title=(req.body.title||'').trim().slice(0,100); const content=(req.body.content||'').trim().slice(0,1000); if(!vendorId||!title||content.length<5)return res.redirect('/vendor/'+(vendorId||'')); const vendor=await q(`SELECT id FROM vendors v WHERE v.id=$1 AND ${PUBLIC_VENDOR_SQL}`,[vendorId]); if(!vendor.rows[0])return res.redirect('/'); const dup=await q("SELECT id FROM reviews WHERE vendor_id=$1 AND user_id=$2 AND created_at>=CURRENT_DATE-INTERVAL '1 day' LIMIT 1",[vendorId,req.session.user.id]); const ratingRaw=parseInt(req.body.rating,10); const rating=Math.max(1,Math.min(5,Number.isFinite(ratingRaw)?ratingRaw:5)); if(!dup.rows[0])await q('INSERT INTO reviews(vendor_id,user_id,title,content,rating) VALUES($1,$2,$3,$4,$5)',[vendorId,req.session.user.id,title,content,rating]); res.redirect('/vendor/'+vendorId);});
app.get('/admin/login',(req,res)=>res.render('admin-login',{error:null})); app.post('/admin/login',async(req,res)=>{const username=(req.body.username||'').trim(); if(loginBlocked(req,username,'admin'))return res.status(429).render('admin-login',{error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'}); const u=await q('SELECT * FROM users WHERE username=$1 AND role=$2 AND status=$3',[username,'admin','active']); if(!u.rows[0]||!await bcrypt.compare(req.body.password||'',u.rows[0].password_hash)){loginFail(req,username,'admin'); return res.render('admin-login',{error:'관리자 로그인 실패'});} loginSuccess(req,username,'admin'); req.session.regenerate(err=>{if(err)return res.render('admin-login',{error:'로그인 처리 중 오류가 발생했습니다.'}); req.session.user={id:u.rows[0].id,username:u.rows[0].username,nickname:u.rows[0].nickname,role:'admin',is_vendor:u.rows[0].is_vendor,vendor_id:u.rows[0].vendor_id}; res.redirect('/admin');});});


function adminPageParams(req){
  const page=Math.max(1,parseInt(req.query.page||'1',10)||1);
  const limit=Math.min(100,Math.max(1,parseInt(req.query.limit||'20',10)||20));
  const offset=(page-1)*limit;
  return {page,limit,offset};
}
async function adminPagedJson(req,res,sql,countSql,params=[]){
  try{
    res.setHeader('Cache-Control','no-store');
    const {page,limit,offset}=adminPageParams(req);
    const rows=await q(sql+` LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,offset]);
    const cnt=await q(countSql,params);
    const total=Number(cnt.rows[0]?.count||0);
    res.json({ok:true,page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit)),rows:rows.rows});
  }catch(e){
    console.error('admin paged api failed',e);
    res.status(500).json({ok:false,error:e.message||'admin_api_failed'});
  }
}
function wantsJson(req){
  const accept=String(req.get('accept')||'');
  const xrw=String(req.get('x-requested-with')||'').toLowerCase();
  return xrw==='fetch'||xrw==='xmlhttprequest'||accept.includes('application/json');
}
function sendOk(req,res,redirectTo,payload={}){
  if(wantsJson(req))return res.json({ok:true,redirect:redirectTo,...payload});
  return res.redirect(redirectTo||'/admin');
}
function sendFail(req,res,status,message,redirectTo){
  if(wantsJson(req))return res.status(status||400).json({ok:false,error:message||'요청 처리 실패'});
  return res.redirect(redirectTo||'/admin');
}
async function runAdminAction(req,res,redirectTo,fn){
  try{
    const payload=await fn();
    return sendOk(req,res,redirectTo,payload||{});
  }catch(e){
    console.error('admin action failed',e);
    return sendFail(req,res,500,e.message||'관리자 작업 처리 중 오류가 발생했습니다.',redirectTo);
  }
}
app.get('/admin/api/vendors',admin,async(req,res)=>{
  await expireAds();
  const where=[];
  const params=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const status=String(req.query.status||'').trim();
  const adType=String(req.query.ad_type||'').trim();
  const orderBy={default:'v.id DESC',views:'v.views DESC NULLS LAST,v.id DESC',reviews:'review_count DESC,v.id DESC',rating:'avg_rating DESC NULLS LAST,v.id DESC',latest:'v.id DESC'}[String(req.query.sort||'default')]||'v.id DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(v.name ILIKE $${params.length} OR v.category ILIKE $${params.length} OR v.region ILIKE $${params.length} OR v.phone ILIKE $${params.length} OR v.tags ILIKE $${params.length} OR v.description ILIKE $${params.length} OR v.business_hours ILIKE $${params.length})`);}
  if(['pending','active','hidden','expired','inactive'].includes(status)){params.push(status);where.push(`v.status=$${params.length}`);}
  if(adType==='noad'||adType==='none')where.push("COALESCE(v.ad_type,'none')='none'");
  else if(adType==='banner')where.push('COALESCE(v.banner_active,false)=true');
  else if(adType==='expiring')where.push("v.expire_at>=CURRENT_DATE AND v.expire_at<=CURRENT_DATE+INTERVAL '7 days'");
  else if(['general','recommended'].includes(adType)){params.push(adType);where.push(`v.ad_type=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  return adminPagedJson(req,res,`SELECT v.*,
    (SELECT u.username FROM users u WHERE u.vendor_id=v.id ORDER BY u.id DESC LIMIT 1) linked_username,
    (SELECT u.nickname FROM users u WHERE u.vendor_id=v.id ORDER BY u.id DESC LIMIT 1) linked_nickname,
    (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count,
    (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating,
    (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count
    FROM vendors v${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*) FROM vendors v${whereSql}`,params);
});
app.get('/admin/api/vendors/:id',admin,async(req,res)=>{
  try{
    const id=parseInt(req.params.id||'0',10);
    if(!id)return res.status(400).json({ok:false,error:'bad_vendor_id'});
    const r=await q(`SELECT v.*,u.username linked_username,u.nickname linked_nickname FROM vendors v LEFT JOIN users u ON u.vendor_id=v.id WHERE v.id=$1`,[id]);
    if(!r.rows[0])return res.status(404).json({ok:false,error:'vendor_not_found'});
    res.json({ok:true,vendor:r.rows[0]});
  }catch(e){
    console.error('admin vendor detail failed',e);
    res.status(500).json({ok:false,error:e.message||'vendor_detail_failed'});
  }
});
app.get('/admin/api/users',admin,async(req,res)=>{
  const where=[];
  const params=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const role=String(req.query.role||'').trim();
  const status=String(req.query.status||'').trim();
  const orderBy={default:'u.id DESC',latest:'u.id DESC',admin:"CASE WHEN u.role='admin' THEN 0 ELSE 1 END,u.id DESC",blocked:"CASE WHEN u.status='blocked' THEN 0 ELSE 1 END,u.id DESC"}[String(req.query.sort||'default')]||'u.id DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(u.username ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);}
  if(['active','blocked','suspended','inactive'].includes(status)){params.push(status);where.push(`u.status=$${params.length}`);}
  if(role==='admin')where.push("u.role='admin'");
  else if(role==='vendor')where.push('(COALESCE(u.is_vendor,false)=true OR u.vendor_id IS NOT NULL)');
  else if(role==='user')where.push("u.role<>'admin' AND COALESCE(u.is_vendor,false)=false AND u.vendor_id IS NULL");
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  return adminPagedJson(req,res,`SELECT u.id,u.username,u.nickname,u.role,u.status,COALESCE(u.is_vendor,false) is_vendor,u.vendor_id,u.created_at FROM users u${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*) FROM users u${whereSql}`,params);
});
app.get('/admin/api/inquiries',admin,async(req,res)=>{
  const where=[];
  const params=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const type=String(req.query.type||'').trim();
  const status=String(req.query.status||'').trim();
  const orderBy={latest:'i.id DESC',oldest:'i.id ASC',status:"CASE WHEN i.status='new' THEN 0 WHEN i.status='approved' THEN 1 ELSE 2 END,i.id DESC",type:'i.type ASC,i.id DESC'}[String(req.query.sort||'latest')]||'i.id DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(i.company_name ILIKE $${params.length} OR i.name ILIKE $${params.length} OR i.phone ILIKE $${params.length} OR i.content ILIKE $${params.length} OR i.kakao ILIKE $${params.length} OR i.email ILIKE $${params.length} OR i.category ILIKE $${params.length} OR i.region ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);}
  if(['apply','ad'].includes(type)){params.push(type);where.push(`i.type=$${params.length}`);}
  if(['new','approved','rejected','cancelled'].includes(status)){params.push(status);where.push(`i.status=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const fromSql=` FROM inquiries i LEFT JOIN users u ON u.id=i.user_id LEFT JOIN LATERAL (SELECT v.image_data FROM vendors v WHERE v.id=i.vendor_id OR (i.vendor_id IS NULL AND v.name=i.company_name) ORDER BY v.id DESC LIMIT 1) iv ON true`;
  return adminPagedJson(req,res,`SELECT i.id,i.type,i.company_name,i.name,i.phone,i.kakao,i.email,i.category,i.region,i.content,i.status,i.banner_status,i.user_id,i.vendor_id,i.created_at,
  u.username applicant_username,u.nickname applicant_nickname,
  CASE WHEN COALESCE(i.main_image_data,iv.image_data,i.banner_image_data,'')<>'' THEN true ELSE false END has_main_image_data,
  CASE WHEN COALESCE(i.banner_image_data,'')<>'' THEN true ELSE false END has_banner_image_data,
  CASE WHEN COALESCE(i.main_image_data,iv.image_data,i.banner_image_data,'')<>'' THEN true ELSE false END has_image_data
  ${fromSql}${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*)${fromSql}${whereSql}`,params);
});
app.get('/admin/api/payments',admin,async(req,res)=>adminPagedJson(req,res,`SELECT p.*,v.name vendor_name,u.username FROM payment_logs p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC`,'SELECT COUNT(*) FROM payment_logs'));
app.get('/admin/api/reports',admin,async(req,res)=>{
  const where=[];
  const params=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const type=String(req.query.type||'').trim();
  const status=String(req.query.status||'').trim();
  const orderBy={latest:'f.id DESC',oldest:'f.id ASC',status:"CASE WHEN f.status='new' THEN 0 ELSE 1 END,f.id DESC",reason:'f.reason ASC NULLS LAST,f.id DESC'}[String(req.query.sort||'latest')]||'f.id DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(f.reason ILIKE $${params.length} OR f.content ILIKE $${params.length} OR f.admin_memo ILIKE $${params.length} OR f.type ILIKE $${params.length} OR v.name ILIKE $${params.length} OR rv.title ILIKE $${params.length})`);}
  if(['vendor','review'].includes(type)){params.push(type);where.push(`f.type=$${params.length}`);}
  if(['new','done','rejected','cancelled'].includes(status)){params.push(status);where.push(`f.status=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const fromSql=" FROM flags f LEFT JOIN vendors v ON f.type='vendor' AND v.id=f.target_id LEFT JOIN reviews rv ON f.type='review' AND rv.id=f.target_id";
  return adminPagedJson(req,res,`SELECT f.*,v.name vendor_name,rv.title review_title${fromSql}${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*)${fromSql}${whereSql}`,params);
});
app.get('/admin/api/banners',admin,async(req,res)=>{
  const params=[];
  const where=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const source=String(req.query.source||'').trim();
  const status=String(req.query.status||'').trim();
  const orderBy={default:'x.sort_order,x.created_at DESC,x.row_key DESC',order:'x.sort_order,x.created_at DESC,x.row_key DESC',active:"CASE WHEN x.display_status='active' THEN 0 ELSE 1 END,x.sort_order,x.created_at DESC",latest:'x.created_at DESC,x.row_key DESC'}[String(req.query.sort||'default')]||'x.sort_order,x.created_at DESC,x.row_key DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(x.title ILIKE $${params.length} OR x.link_url ILIKE $${params.length} OR x.vendor_name ILIKE $${params.length} OR x.position ILIKE $${params.length})`);}
  if(['direct','vendor'].includes(source)){params.push(source);where.push(`x.source=$${params.length}`);}
  if(['active','inactive','expired'].includes(status)){params.push(status);where.push(`x.display_status=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const baseSql=` FROM (
    SELECT b.id banner_id,b.id::text row_key,b.title,b.subtitle,b.link_url,b.position,b.sort_order,b.is_active,b.vendor_id,b.created_at,
      CASE WHEN COALESCE(b.image_data,'')<>'' THEN true ELSE false END has_image_data,
      v.name vendor_name,v.status vendor_status,v.ad_type vendor_ad_type,v.expire_at vendor_expire_at,v.banner_active vendor_banner_active,v.banner_until vendor_banner_until,
      CASE WHEN b.vendor_id IS NULL THEN 'direct' ELSE 'vendor' END source,
      CASE WHEN b.vendor_id IS NULL THEN CASE WHEN b.is_active THEN 'active' ELSE 'inactive' END
        WHEN v.status='expired' OR v.expire_at<CURRENT_DATE OR v.banner_until<CURRENT_DATE THEN 'expired'
        WHEN v.status='active' AND COALESCE(v.ad_type,'none')<>'none' AND v.expire_at>=CURRENT_DATE AND COALESCE(v.banner_active,false)=true AND v.banner_until>=CURRENT_DATE THEN 'active'
        ELSE 'inactive' END display_status
    FROM banners b LEFT JOIN vendors v ON v.id=b.vendor_id
    UNION ALL
    SELECT NULL banner_id,('vendor-'||v.id)::text row_key,v.name title,'' subtitle,'' link_url,'premium' position,0 sort_order,true is_active,v.id vendor_id,v.created_at,
      CASE WHEN COALESCE(v.image_data,'')<>'' THEN true ELSE false END has_image_data,
      v.name vendor_name,v.status vendor_status,v.ad_type vendor_ad_type,v.expire_at vendor_expire_at,v.banner_active vendor_banner_active,v.banner_until vendor_banner_until,'vendor' source,
      CASE WHEN v.status='expired' OR v.expire_at<CURRENT_DATE OR v.banner_until<CURRENT_DATE THEN 'expired'
        WHEN v.status='active' AND COALESCE(v.ad_type,'none')<>'none' AND v.expire_at>=CURRENT_DATE AND COALESCE(v.banner_active,false)=true AND v.banner_until>=CURRENT_DATE THEN 'active'
        ELSE 'inactive' END display_status
    FROM vendors v WHERE COALESCE(v.banner_active,false)=true AND NOT EXISTS(SELECT 1 FROM banners b2 WHERE b2.vendor_id=v.id)
  ) x`;
  return adminPagedJson(req,res,`SELECT x.*${baseSql}${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*)${baseSql}${whereSql}`,params);
});
app.get('/admin/api/notices',admin,async(req,res)=>{
  const params=[];const where=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const pinned=String(req.query.pinned??req.query.is_pinned??'').trim();
  const orderBy={default:'n.id DESC',latest:'n.id DESC',pinned:'n.is_pinned DESC,n.id DESC',normal:'n.is_pinned ASC,n.id DESC'}[String(req.query.sort||'default')]||'n.id DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(n.title ILIKE $${params.length} OR n.content ILIKE $${params.length})`);}
  if(['true','1','pinned'].includes(pinned)){params.push(true);where.push(`n.is_pinned=$${params.length}`);}
  else if(['false','0','normal'].includes(pinned)){params.push(false);where.push(`n.is_pinned=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  return adminPagedJson(req,res,`SELECT n.id,n.title,n.content,n.is_pinned,n.created_at FROM notices n${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*) FROM notices n${whereSql}`,params);
});
app.get('/admin/api/reviews',admin,async(req,res)=>{
  const params=[];const where=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const status=String(req.query.status||'').trim();
  const orderBy={default:'r.id DESC',latest:'r.id DESC',high:'r.rating DESC,r.id DESC',low:'r.rating ASC,r.id DESC'}[String(req.query.sort||'default')]||'r.id DESC';
  if(qText){params.push(`%${qText}%`);where.push(`(r.title ILIKE $${params.length} OR r.content ILIKE $${params.length} OR v.name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);}
  if(['visible','hidden','deleted'].includes(status)){params.push(status);where.push(`r.status=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const fromSql=' FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id';
  return adminPagedJson(req,res,`SELECT r.id,r.vendor_id,r.user_id,r.title,r.content,r.rating,r.status,r.created_at,v.name vendor_name,u.username,u.nickname${fromSql}${whereSql} ORDER BY ${orderBy}`,`SELECT COUNT(*)${fromSql}${whereSql}`,params);
});
app.get('/admin/api/logs',admin,async(req,res)=>{
  const params=[];const where=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const action=String(req.query.action||'').trim().slice(0,100);
  const targetType=String(req.query.target_type||'').trim().slice(0,100);
  if(qText){params.push(`%${qText}%`);where.push(`(l.action ILIKE $${params.length} OR l.target_type ILIKE $${params.length} OR l.target_id ILIKE $${params.length} OR l.memo ILIKE $${params.length} OR l.admin_username ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);}
  if(action){params.push(action);where.push(`l.action=$${params.length}`);}
  if(targetType){params.push(targetType);where.push(`l.target_type=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const fromSql=' FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id';
  return adminPagedJson(req,res,`SELECT l.id,l.admin_id,l.admin_username,l.action,l.target_type,l.target_id,l.memo,l.created_at,u.nickname admin_nickname${fromSql}${whereSql} ORDER BY l.id DESC`,`SELECT COUNT(*)${fromSql}${whereSql}`,params);
});
app.get('/admin/api/vendor-update-requests',admin,async(req,res)=>{
  const params=[];const where=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const status=String(req.query.status||'').trim();
  if(qText){params.push(`%${qText}%`);where.push(`(r.name ILIKE $${params.length} OR v.name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.nickname ILIKE $${params.length} OR r.phone ILIKE $${params.length} OR r.description ILIKE $${params.length} OR r.admin_memo ILIKE $${params.length} OR CAST(r.vendor_id AS text) ILIKE $${params.length})`);}
  if(['new','approved','rejected','cancelled'].includes(status)){params.push(status);where.push(`r.status=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const fromSql=' FROM vendor_update_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id';
  return adminPagedJson(req,res,`SELECT r.id,r.user_id,r.vendor_id,r.name,r.category,r.region,r.phone,r.kakao_url,r.business_hours,r.tags,r.description,r.status,r.admin_memo,r.created_at,r.processed_at,u.username,u.nickname,
    CASE WHEN COALESCE(r.image_data,'')<>'' THEN true ELSE false END has_image_data,
    v.name current_vendor_name,v.category current_category,v.region current_region,v.phone current_phone,v.kakao_url current_kakao_url,v.business_hours current_business_hours,v.tags current_tags,v.description current_description
    ${fromSql}${whereSql} ORDER BY r.id DESC`,`SELECT COUNT(*)${fromSql}${whereSql}`,params);
});
app.get('/admin/api/ad-center',admin,async(req,res)=>{
  const params=[];const where=[];
  const qText=String(req.query.q||'').trim().slice(0,100);
  const status=String(req.query.status||'').trim();
  const paymentStatus=String(req.query.payment_status||'').trim();
  const requestType=String(req.query.type||req.query.request_type||'').trim().slice(0,100);
  const source=String(req.query.source||'').trim();
  if(qText){params.push(`%${qText}%`);where.push(`(x.vendor_name ILIKE $${params.length} OR x.username ILIKE $${params.length} OR x.nickname ILIKE $${params.length} OR x.product_name ILIKE $${params.length} OR x.request_type ILIKE $${params.length} OR x.admin_memo ILIKE $${params.length} OR x.payment_txid ILIKE $${params.length} OR x.vendor_phone ILIKE $${params.length})`);}
  if(['new','approved','rejected','cancelled'].includes(status)){params.push(status);where.push(`x.status=$${params.length}`);}
  if(['unpaid','waiting','paid','rejected','cancelled'].includes(paymentStatus)){params.push(paymentStatus);where.push(`COALESCE(x.payment_status,'unpaid')=$${params.length}`);}
  if(requestType){params.push(requestType);where.push(`x.request_type=$${params.length}`);}
  if(['ad_request','banner_request'].includes(source)){params.push(source);where.push(`x.source=$${params.length}`);}
  const whereSql=where.length?' WHERE '+where.join(' AND '):'';
  const baseSql=` FROM (
    SELECT r.id,'ad_request'::text source,COALESCE(r.product_type,'recommended')::text request_type,r.user_id,r.vendor_id,
      COALESCE(r.plan,r.product_type,'-')::text product_name,''::text product_sub,r.period::text period,r.content::text content,
      r.status,r.admin_memo,r.created_at,r.processed_at,r.krw_price,r.usdt_amount,r.payment_status,r.payment_expires_at,r.paid_usdt_amount,r.payment_txid,
      u.username,u.nickname,v.name vendor_name,v.phone vendor_phone,false has_image_data
    FROM vendor_ad_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id
    UNION ALL
    SELECT r.id,'banner_request'::text source,'banner'::text request_type,r.user_id,r.vendor_id,
      '프리미엄배너 신청'::text product_name,COALESCE(r.title,'')::text product_sub,NULL::text period,NULL::text content,
      r.status,r.admin_memo,r.created_at,r.processed_at,r.krw_price,r.usdt_amount,r.payment_status,r.payment_expires_at,r.paid_usdt_amount,r.payment_txid,
      u.username,u.nickname,v.name vendor_name,v.phone vendor_phone,CASE WHEN COALESCE(r.image_data,'')<>'' THEN true ELSE false END has_image_data
    FROM vendor_banner_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id
  ) x`;
  return adminPagedJson(req,res,`SELECT x.*${baseSql}${whereSql} ORDER BY x.created_at DESC,x.id DESC`,`SELECT COUNT(*)${baseSql}${whereSql}`,params);
});


app.get('/admin/api/live-summary',admin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  await expirePendingPayments();
  const safeScalar=async(sql)=>{try{return Number((await q(sql)).rows[0]?.v||0);}catch(e){console.error('live scalar failed',e.message);return 0;}};
  const safeRows=async(sql)=>{try{return (await q(sql)).rows;}catch(e){console.error('live rows failed',e.message);return [];}};
  const counts={
    pendingInquiries:await safeScalar("SELECT COUNT(*) v FROM inquiries WHERE status='new'"),
    pendingVendorRequests:await safeScalar("SELECT COUNT(*) v FROM vendor_update_requests WHERE status='new'"),
    pendingAdRequests:await safeScalar("SELECT COUNT(*) v FROM vendor_ad_requests WHERE status='new'"),
    pendingBannerRequests:await safeScalar("SELECT COUNT(*) v FROM vendor_banner_requests WHERE status='new'"),
    pendingReports:await safeScalar("SELECT COUNT(*) v FROM flags WHERE status='new'"),
    waitingPayments:await safeScalar("SELECT COUNT(*) v FROM (SELECT payment_status FROM vendor_ad_requests UNION ALL SELECT payment_status FROM vendor_banner_requests) x WHERE payment_status='waiting'"),
    expiring7:await safeScalar("SELECT COUNT(*) v FROM vendors WHERE expire_at IS NOT NULL AND expire_at>=CURRENT_DATE AND expire_at<=CURRENT_DATE+INTERVAL '7 days'"),
    todayViews:await safeScalar("SELECT COUNT(*) v FROM vendor_view_logs WHERE created_at>=CURRENT_DATE"),
    todayUsers:await safeScalar("SELECT COUNT(*) v FROM users WHERE created_at>=CURRENT_DATE"),
    todayInquiries:await safeScalar("SELECT COUNT(*) v FROM inquiries WHERE created_at>=CURRENT_DATE"),
    todayRevenue:await safeScalar("SELECT COALESCE(SUM(krw_price),0) v FROM payment_logs WHERE paid_at>=CURRENT_DATE"),
    monthRevenue:await safeScalar("SELECT COALESCE(SUM(krw_price),0) v FROM payment_logs WHERE date_trunc('month',paid_at)=date_trunc('month',CURRENT_DATE)"),
    totalUsers:await safeScalar("SELECT COUNT(*) v FROM users"),
    totalVendors:await safeScalar("SELECT COUNT(*) v FROM vendors")
  };
  const ops={
    todayDone:await safeScalar("SELECT COUNT(*) v FROM admin_logs WHERE created_at>=CURRENT_DATE"),
    todayVendors:await safeScalar("SELECT COUNT(*) v FROM vendors WHERE created_at>=CURRENT_DATE"),
    todayReports:await safeScalar("SELECT COUNT(*) v FROM flags WHERE created_at>=CURRENT_DATE"),
    expiring3:await safeScalar("SELECT COUNT(*) v FROM vendors WHERE expire_at IS NOT NULL AND expire_at>=CURRENT_DATE AND expire_at<=CURRENT_DATE+INTERVAL '3 days'"),
    expiringToday:await safeScalar("SELECT COUNT(*) v FROM vendors WHERE expire_at IS NOT NULL AND expire_at=CURRENT_DATE"),
    bannerExpiring7:await safeScalar("SELECT COUNT(*) v FROM vendors WHERE banner_until IS NOT NULL AND banner_until>=CURRENT_DATE AND banner_until<=CURRENT_DATE+INTERVAL '7 days'"),
    bannerExpiring3:await safeScalar("SELECT COUNT(*) v FROM vendors WHERE banner_until IS NOT NULL AND banner_until>=CURRENT_DATE AND banner_until<=CURRENT_DATE+INTERVAL '3 days'"),
    lastBackup:(await safeRows("SELECT action,memo,created_at FROM admin_logs WHERE action LIKE '%백업%' OR action LIKE '%복원%' ORDER BY id DESC LIMIT 1"))[0]||null,
    db:true,api:true
  };
  const recent={
    inquiries:await safeRows(`SELECT i.id,i.type,i.company_name,i.name,i.status,i.created_at,u.username applicant_username FROM inquiries i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.id DESC LIMIT 5`),
    payments:await safeRows(`SELECT p.id,p.product_type,p.krw_price,p.paid_at,p.created_at,v.name vendor_name,u.username FROM payment_logs p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 5`),
    reports:await safeRows(`SELECT f.id,f.type,f.reason,f.status,f.created_at,v.name vendor_name,rv.title review_title FROM flags f LEFT JOIN vendors v ON f.type='vendor' AND v.id=f.target_id LEFT JOIN reviews rv ON f.type='review' AND rv.id=f.target_id ORDER BY f.id DESC LIMIT 5`),
    logs:await safeRows(`SELECT id,action,target_type,target_id,memo,created_at FROM admin_logs ORDER BY id DESC LIMIT 5`)
  };
  const charts={
    dailyViews:await safeRows("SELECT to_char(d::date,'MM-DD') AS label, COALESCE(x.cnt,0)::int AS value FROM generate_series(CURRENT_DATE-INTERVAL '6 days',CURRENT_DATE,INTERVAL '1 day') d LEFT JOIN (SELECT created_at::date AS \"day\",COUNT(*) AS cnt FROM vendor_view_logs WHERE created_at>=CURRENT_DATE-INTERVAL '6 days' GROUP BY created_at::date) x ON x.day=d::date ORDER BY d"),
    dailyUsers:await safeRows("SELECT to_char(d::date,'MM-DD') AS label, COALESCE(x.cnt,0)::int AS value FROM generate_series(CURRENT_DATE-INTERVAL '6 days',CURRENT_DATE,INTERVAL '1 day') d LEFT JOIN (SELECT created_at::date AS \"day\",COUNT(*) AS cnt FROM users WHERE created_at>=CURRENT_DATE-INTERVAL '6 days' GROUP BY created_at::date) x ON x.day=d::date ORDER BY d"),
    dailyRevenue:await safeRows("SELECT to_char(d::date,'MM-DD') AS label, COALESCE(x.sum,0)::int AS value FROM generate_series(CURRENT_DATE-INTERVAL '6 days',CURRENT_DATE,INTERVAL '1 day') d LEFT JOIN (SELECT paid_at::date AS \"day\",SUM(krw_price) AS sum FROM payment_logs WHERE paid_at>=CURRENT_DATE-INTERVAL '6 days' GROUP BY paid_at::date) x ON x.day=d::date ORDER BY d"),
    productSales:await safeRows("SELECT COALESCE(product_type,'기타') label,COUNT(*)::int value FROM payment_logs GROUP BY product_type ORDER BY value DESC LIMIT 6"),
    regionVendors:await safeRows("SELECT COALESCE(region,'미지정') label,COUNT(*)::int value FROM vendors GROUP BY region ORDER BY value DESC LIMIT 6")
  };
  const alertTotal=counts.pendingInquiries+counts.pendingVendorRequests+counts.pendingAdRequests+counts.pendingBannerRequests+counts.pendingReports+counts.waitingPayments;
  res.json({ok:true,time:new Date().toISOString(),counts,ops,recent,charts,alertTotal});
});



// 통합 관리자 화면 사용: 개별 신청/신고 페이지는 관리자 메인 탭으로 이동
app.get('/admin/inquiries',admin,(req,res)=>res.redirect('/admin#inquiries'));
app.get('/admin/reports',admin,(req,res)=>res.redirect('/admin#reports'));

app.post('/admin/reports/:id/done',admin,async(req,res)=>runAdminAction(req,res,'/admin#reports',async()=>{const r=await q("UPDATE flags SET status=$1, admin_memo=$2, processed_at=now() WHERE id=$3 AND status='new' RETURNING id",['done',(req.body.admin_memo||'').slice(0,500),req.params.id]); if(!r.rows[0])throw new Error('처리할 신고를 찾을 수 없거나 이미 처리되었습니다.'); await logAdmin(req,'신고 처리완료','report',req.params.id,req.body.admin_memo||'');}));
app.post('/admin/inquiries/:id/reject',admin,async(req,res)=>runAdminAction(req,res,'/admin#inquiries',async()=>{const r=await q("UPDATE inquiries SET status=$1 WHERE id=$2 AND status='new' RETURNING id,type",['rejected',req.params.id]); const x=r.rows[0]; if(!x)throw new Error('반려할 문의를 찾을 수 없거나 이미 처리되었습니다.'); const label=x.type==='apply'?'입점신청 반려':'광고문의 반려'; await logAdmin(req,label,'inquiry',req.params.id,label);}));
app.get('/admin/inquiry-image/:id/:kind',admin,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(!id)return res.status(404).send('이미지가 없습니다.'); let sql; if(req.params.kind==='banner'){sql='SELECT banner_image_data image_data FROM inquiries WHERE id=$1';}else{sql=`SELECT COALESCE(i.main_image_data,iv.image_data,i.banner_image_data) image_data FROM inquiries i LEFT JOIN LATERAL (SELECT v.image_data FROM vendors v WHERE v.id=i.vendor_id OR (i.vendor_id IS NULL AND v.name=i.company_name) ORDER BY v.id DESC LIMIT 1) iv ON true WHERE i.id=$1`; } const r=await q(sql,[id]); const data=r.rows[0]?.image_data; if(!data)return res.status(404).send('이미지가 없습니다.'); const m=String(data).match(/^data:(.+);base64,(.+)$/); if(!m)return res.status(400).send('이미지 형식 오류'); res.setHeader('Content-Type',m[1]); res.setHeader('Cache-Control','private, max-age=86400'); res.send(Buffer.from(m[2],'base64'));});
app.get('/admin/vendor-requests/:id/image',admin,async(req,res)=>{const id=parseInt(req.params.id||0,10); if(!id)return res.status(404).send('이미지가 없습니다.'); const r=await q('SELECT image_data FROM vendor_update_requests WHERE id=$1',[id]); const data=r.rows[0]?.image_data; if(!data)return res.status(404).send('이미지가 없습니다.'); const m=String(data).match(/^data:(.+);base64,(.+)$/); if(!m)return res.status(400).send('이미지 형식 오류'); res.setHeader('Content-Type',m[1]); res.setHeader('Cache-Control','private, max-age=86400'); res.send(Buffer.from(m[2],'base64'));});
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

  await q('UPDATE inquiries SET status=$1,vendor_id=$3 WHERE id=$2',['approved',x.id,vendorId||null]);
  await logAdmin(req,'입점신청 승인/업체회원전환','inquiry',x.id,`업체ID ${vendorId} 생성, 광고상태 없음`);
  return sendOk(req,res,'/admin#inquiries');
});
app.post('/admin/inquiries/:id/banner',admin,async(req,res)=>{const r=await q('SELECT * FROM inquiries WHERE id=$1',[req.params.id]); const x=r.rows[0]; if(!x||!x.banner_image_data||x.banner_status==='approved')return sendFail(req,res,400,'banner_not_available','/admin#inquiries'); await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[x.company_name||'입점신청 배너','입점신청으로 등록된 배너','#','premium',0,true,x.banner_image_data]); await q("UPDATE inquiries SET banner_status=$1 WHERE id=$2 AND COALESCE(banner_status,'new')<>'approved'",['approved',x.id]); await logAdmin(req,'입점신청 배너등록','inquiry',x.id,x.company_name||''); return sendOk(req,res,'/admin#inquiries');});
app.post('/admin/boards',admin,async(req,res)=>runAdminAction(req,res,'/admin#boards',async()=>{
  const title=String(req.body.title||'').trim().slice(0,100);if(!title)throw new Error('게시판 제목을 입력해주세요.');
  const slug=boardSlugSafe(req.body.slug,title),type=['notice','community','review','report','free'].includes(req.body.type)?req.body.type:'community';
  const writeRole=['guest','member','admin'].includes(req.body.write_role)?req.body.write_role:'member';
  await q(`INSERT INTO board_categories(title,slug,description,type,is_active,sort_order,write_role,comment_enabled,image_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[title,slug,String(req.body.description||'').trim().slice(0,500),type,!!req.body.is_active,parseInt(req.body.sort_order||0,10)||0,writeRole,!!req.body.comment_enabled,!!req.body.image_enabled]);
  await logAdmin(req,'게시판 생성','board_category',slug,title);
}));
app.post('/admin/boards/:id/update',admin,async(req,res)=>runAdminAction(req,res,'/admin#boards',async()=>{
  const id=parseInt(req.params.id||0,10),title=String(req.body.title||'').trim().slice(0,100);if(!id||!title)throw new Error('게시판 정보를 확인해주세요.');
  const slug=boardSlugSafe(req.body.slug,title),type=['notice','community','review','report','free'].includes(req.body.type)?req.body.type:'community';
  const writeRole=['guest','member','admin'].includes(req.body.write_role)?req.body.write_role:'member';
  const r=await q(`UPDATE board_categories SET title=$1,slug=$2,description=$3,type=$4,is_active=$5,sort_order=$6,write_role=$7,comment_enabled=$8,image_enabled=$9 WHERE id=$10 RETURNING id`,[title,slug,String(req.body.description||'').trim().slice(0,500),type,!!req.body.is_active,parseInt(req.body.sort_order||0,10)||0,writeRole,!!req.body.comment_enabled,!!req.body.image_enabled,id]);
  if(!r.rows[0])throw new Error('게시판을 찾을 수 없습니다.');await logAdmin(req,'게시판 수정','board_category',id,title);
}));
app.post('/admin/boards/:id/delete',admin,async(req,res)=>runAdminAction(req,res,'/admin#boards',async()=>{
  const r=await q('UPDATE board_categories SET is_active=false WHERE id=$1 RETURNING id,title',[parseInt(req.params.id||0,10)]);if(!r.rows[0])throw new Error('게시판을 찾을 수 없습니다.');await logAdmin(req,'게시판 비활성화','board_category',r.rows[0].id,r.rows[0].title);
}));
app.get('/admin',admin,async(req,res)=>{
  try{
await expireAds(); await expirePendingPayments();
  const dashStats={};
  const norm=x=>(x||'미지정').toString().trim()||'미지정';
const [users,vendors,banners,reviews,events,notices,inquiries,flags,vendorRequests,bannerRequests,adRequests,adminLogs,paymentLogs,settings]=await Promise.all([q('SELECT u.id,u.username,u.nickname,u.role,u.status,u.is_vendor,u.vendor_id,u.created_at FROM users u ORDER BY u.id DESC LIMIT 300'),q(`SELECT v.id,v.name,v.category,v.region,v.phone,v.kakao_url,v.business_hours,v.description,v.tags,v.status,v.ad_type,v.expire_at,v.banner_active,v.banner_until,v.views,v.created_at,v.is_premium,v.is_recommended,v.membership_type,v.sns_url,v.line_url,v.telegram_url,v.holiday_info,v.ad_until,v.scheduled_membership_type,v.scheduled_banner_active,v.scheduled_change_at,v.scheduled_change_note,
  CASE WHEN v.image_data IS NOT NULL AND v.image_data<>'' THEN true ELSE false END has_image_data,
  (SELECT u.username FROM users u WHERE u.vendor_id=v.id ORDER BY u.id DESC LIMIT 1) linked_username,
  (SELECT u.nickname FROM users u WHERE u.vendor_id=v.id ORDER BY u.id DESC LIMIT 1) linked_nickname,
  (SELECT COUNT(*)::int FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') review_count,
  (SELECT ROUND(AVG(r.rating)::numeric,1) FROM reviews r WHERE r.vendor_id=v.id AND r.status='visible') avg_rating,
  (SELECT COUNT(*)::int FROM favorites f WHERE f.vendor_id=v.id) favorite_count
  FROM vendors v ORDER BY v.id DESC LIMIT 500`),q('SELECT b.id,b.title,b.subtitle,b.link_url,b.position,b.sort_order,b.is_active,b.vendor_id,b.created_at,CASE WHEN b.image_data IS NOT NULL AND b.image_data<>\'\' THEN true ELSE false END has_image_data, v.name vendor_name, v.status vendor_status, v.ad_type vendor_ad_type, v.expire_at vendor_expire_at, v.banner_active vendor_banner_active, v.banner_until vendor_banner_until FROM banners b LEFT JOIN vendors v ON v.id=b.vendor_id ORDER BY b.sort_order,b.id DESC LIMIT 200'),q('SELECT r.*,v.name vendor_name,u.username,u.nickname FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 500'),q("SELECT id,title,content,is_active,created_at,CASE WHEN image_data IS NOT NULL AND image_data<>'' THEN true ELSE false END has_image_data FROM events ORDER BY id DESC LIMIT 200"),q('SELECT * FROM notices ORDER BY id DESC LIMIT 200'),q(`SELECT i.id,i.type,i.company_name,i.name,i.phone,i.kakao,i.email,i.category,i.region,i.content,i.status,i.banner_status,i.user_id,i.vendor_id,i.created_at,u.username applicant_username,u.nickname applicant_nickname,
  CASE WHEN i.main_image_data IS NOT NULL AND i.main_image_data<>'' THEN true ELSE false END has_main_image_data,
  CASE WHEN i.banner_image_data IS NOT NULL AND i.banner_image_data<>'' THEN true ELSE false END has_banner_image_data,
  CASE WHEN COALESCE(i.main_image_data,iv.has_vendor_image,i.banner_image_data) IS NOT NULL AND COALESCE(i.main_image_data,iv.has_vendor_image,i.banner_image_data)<>'' THEN true ELSE false END has_image_data
  FROM inquiries i LEFT JOIN users u ON u.id=i.user_id LEFT JOIN LATERAL (SELECT '1' has_vendor_image FROM vendors v WHERE (v.id=i.vendor_id OR (i.vendor_id IS NULL AND v.name=i.company_name)) AND v.image_data IS NOT NULL AND v.image_data<>'' ORDER BY v.id DESC LIMIT 1) iv ON true ORDER BY i.id DESC LIMIT 500`),q(`SELECT f.*, v.name vendor_name, rv.title review_title FROM flags f LEFT JOIN vendors v ON f.type='vendor' AND v.id=f.target_id LEFT JOIN reviews rv ON f.type='review' AND rv.id=f.target_id ORDER BY f.id DESC LIMIT 500`),q(`SELECT r.id,r.user_id,r.vendor_id,r.name,r.category,r.region,r.phone,r.kakao_url,r.business_hours,r.tags,r.description,r.status,r.admin_memo,r.created_at,r.processed_at,u.username,u.nickname,
  CASE WHEN r.image_data IS NOT NULL AND r.image_data<>'' THEN true ELSE false END has_image_data,
  v.name current_vendor_name, v.category current_category, v.region current_region, v.phone current_phone,
  v.kakao_url current_kakao_url, v.business_hours current_business_hours, v.tags current_tags, v.description current_description
  FROM vendor_update_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC LIMIT 500`),q(`SELECT r.id,r.user_id,r.vendor_id,r.title,r.subtitle,r.link_url,r.status,r.admin_memo,r.created_at,r.processed_at,r.krw_price,r.usdt_amount,r.payment_status,r.payment_expires_at,r.paid_usdt_amount,r.payment_txid,
  CASE WHEN r.image_data IS NOT NULL AND r.image_data<>'' THEN true ELSE false END has_image_data,
  u.username,u.nickname,v.name vendor_name FROM vendor_banner_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC LIMIT 500`),q(`SELECT r.*,u.username,u.nickname,v.name vendor_name FROM vendor_ad_requests r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id ORDER BY r.id DESC LIMIT 500`),q('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200'),q(`SELECT p.*,v.name vendor_name,u.username FROM payment_logs p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 500`),getSettings()]);
  const adminBoards=(await q('SELECT * FROM board_categories ORDER BY sort_order,id')).rows;
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
  const paymentStatusStats={waiting:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='waiting').length,unpaid:[...bannerRequests.rows,...adRequests.rows].filter(x=>!x.payment_status||x.payment_status==='unpaid').length,paid:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='paid').length,rejected:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='rejected').length,cancelled:[...bannerRequests.rows,...adRequests.rows].filter(x=>x.payment_status==='cancelled').length};
  const revenueAgg=(await q(`SELECT
    COALESCE(SUM(krw_price),0) AS total,
    COALESCE(SUM(krw_price) FILTER (WHERE paid_at>=CURRENT_DATE),0) AS today,
    COALESCE(SUM(krw_price) FILTER (WHERE date_trunc('month',paid_at)=date_trunc('month',CURRENT_DATE)),0) AS "month",
    COALESCE(SUM(krw_price) FILTER (WHERE date_trunc('year',paid_at)=date_trunc('year',CURRENT_DATE)),0) AS "year",
    COUNT(*)::int AS count,
    COUNT(*) FILTER (WHERE product_type='general')::int AS general,
    COUNT(*) FILTER (WHERE product_type='recommended')::int AS recommended,
    COUNT(*) FILTER (WHERE product_type='banner')::int AS banner,
    COALESCE(SUM(usdt_amount),0) AS "usdtTotal"
    FROM payment_logs`)).rows[0]||{};
  const revenueStats={
    today:Number(revenueAgg.today||0),
    month:Number(revenueAgg.month||0),
    year:Number(revenueAgg.year||0),
    total:Number(revenueAgg.total||0),
    count:Number(revenueAgg.count||0),
    general:Number(revenueAgg.general||0),
    recommended:Number(revenueAgg.recommended||0),
    banner:Number(revenueAgg.banner||0),
    usdtTotal:Number(revenueAgg.usdtTotal||0),
    recent:paidRows.slice(0,10),
    statuses:paymentStatusStats
  };
  const scalar=async(sql)=>Number((await q(sql)).rows[0]?.v||0);
  const adminSummary={
    totalUsers:await scalar("SELECT COUNT(*) v FROM users"),
    totalVendors:await scalar("SELECT COUNT(*) v FROM vendors"),
    activeVendors:await scalar("SELECT COUNT(*) v FROM vendors WHERE status='active'"),
    totalReviews:await scalar("SELECT COUNT(*) v FROM reviews"),
    todayViews:await scalar("SELECT COUNT(*) v FROM vendor_view_logs WHERE created_at>=CURRENT_DATE"),
    weekViews:await scalar("SELECT COUNT(*) v FROM vendor_view_logs WHERE created_at>=date_trunc('week',CURRENT_DATE)"),
    monthViews:await scalar("SELECT COUNT(*) v FROM vendor_view_logs WHERE created_at>=date_trunc('month',CURRENT_DATE)"),
    todayUsers:await scalar("SELECT COUNT(*) v FROM users WHERE created_at>=CURRENT_DATE"),
    weekUsers:await scalar("SELECT COUNT(*) v FROM users WHERE created_at>=date_trunc('week',CURRENT_DATE)"),
    todayInquiries:await scalar("SELECT COUNT(*) v FROM inquiries WHERE created_at>=CURRENT_DATE"),
    pendingInquiries:await scalar("SELECT COUNT(*) v FROM inquiries WHERE status='new'"),
    pendingVendorRequests:await scalar("SELECT COUNT(*) v FROM vendor_update_requests WHERE status='new'"),
    pendingAdRequests:await scalar("SELECT COUNT(*) v FROM vendor_ad_requests WHERE status='new'"),
    pendingBannerRequests:await scalar("SELECT COUNT(*) v FROM vendor_banner_requests WHERE status='new'"),
    waitingPayments:await scalar("SELECT COUNT(*) v FROM (SELECT payment_status FROM vendor_ad_requests UNION ALL SELECT payment_status FROM vendor_banner_requests) x WHERE payment_status='waiting'"),
    pendingReports:await scalar("SELECT COUNT(*) v FROM flags WHERE status='new'"),
    activeAds:await scalar("SELECT COUNT(*) v FROM vendors WHERE status='active' AND ad_type<>'none'"),
    activeBanners:await scalar("SELECT COUNT(*) v FROM vendors WHERE status='active' AND banner_active=true"),
    expiring7:await scalar("SELECT COUNT(*) v FROM vendors WHERE expire_at IS NOT NULL AND expire_at>=CURRENT_DATE AND expire_at<=CURRENT_DATE+INTERVAL '7 days'"),
    todayRevenue:await scalar("SELECT COALESCE(SUM(krw_price),0) v FROM payment_logs WHERE paid_at>=CURRENT_DATE"),
    monthRevenue:await scalar("SELECT COALESCE(SUM(krw_price),0) v FROM payment_logs WHERE date_trunc('month',paid_at)=date_trunc('month',CURRENT_DATE)"),
    yearRevenue:await scalar("SELECT COALESCE(SUM(krw_price),0) v FROM payment_logs WHERE date_trunc('year',paid_at)=date_trunc('year',CURRENT_DATE)"),
    totalRevenue:await scalar("SELECT COALESCE(SUM(krw_price),0) v FROM payment_logs")
  };
  const [listCounts,bannerCounts,adRequestCounts,bannerRequestCounts]=await Promise.all([
    q(`SELECT
      (SELECT COUNT(*) FROM users)::int users_total,
      (SELECT COUNT(*) FROM users WHERE role='admin')::int users_admin,
      (SELECT COUNT(*) FROM users WHERE role<>'admin' AND (COALESCE(is_vendor,false)=true OR vendor_id IS NOT NULL))::int users_vendor,
      (SELECT COUNT(*) FROM users WHERE role<>'admin' AND COALESCE(is_vendor,false)=false AND vendor_id IS NULL)::int users_normal,
      (SELECT COUNT(*) FROM users WHERE status IS NULL OR status='active')::int users_active,
      (SELECT COUNT(*) FROM notices)::int notices_total,
      (SELECT COUNT(*) FROM notices WHERE COALESCE(is_pinned,false)=true)::int notices_pinned,
      (SELECT COUNT(*) FROM reviews)::int reviews_total,
      (SELECT COUNT(*) FROM reviews WHERE status='visible')::int reviews_visible,
      (SELECT COUNT(*) FROM reviews WHERE status='hidden')::int reviews_hidden,
      (SELECT COUNT(*) FROM reviews WHERE status='deleted')::int reviews_deleted,
      (SELECT COUNT(*) FROM admin_logs)::int admin_logs_total,
      (SELECT COUNT(*) FROM vendor_update_requests)::int vendor_requests_total,
      (SELECT COUNT(*) FROM vendor_update_requests WHERE status='new')::int vendor_requests_new,
      (SELECT COUNT(*) FROM vendor_update_requests WHERE status='approved')::int vendor_requests_approved,
      (SELECT COUNT(*) FROM vendor_update_requests WHERE status='rejected')::int vendor_requests_rejected,
      (SELECT COUNT(*) FROM vendor_update_requests WHERE status='cancelled')::int vendor_requests_cancelled,
      (SELECT COUNT(*) FROM inquiries)::int inquiries_total,
      (SELECT COUNT(*) FROM inquiries WHERE status='new')::int inquiries_new,
      (SELECT COUNT(*) FROM inquiries WHERE status='approved')::int inquiries_approved,
      (SELECT COUNT(*) FROM inquiries WHERE status='rejected')::int inquiries_rejected,
      (SELECT COUNT(*) FROM inquiries WHERE type='apply')::int inquiries_apply,
      (SELECT COUNT(*) FROM inquiries WHERE type<>'apply' OR type IS NULL)::int inquiries_ad,
      (SELECT COUNT(*) FROM flags)::int reports_total,
      (SELECT COUNT(*) FROM flags WHERE status<>'done' OR status IS NULL)::int reports_new,
      (SELECT COUNT(*) FROM flags WHERE status='done')::int reports_done,
      (SELECT COUNT(*) FROM flags WHERE type='vendor')::int reports_vendor,
      (SELECT COUNT(*) FROM flags WHERE type='review')::int reports_review`),
    q(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE source='direct')::int direct,
      COUNT(*) FILTER (WHERE source='vendor')::int vendor,
      COUNT(*) FILTER (WHERE display_status='active')::int active,
      COUNT(*) FILTER (WHERE display_status='inactive')::int inactive,
      COUNT(*) FILTER (WHERE display_status='expired')::int expired
      FROM (
        SELECT CASE WHEN b.vendor_id IS NULL THEN 'direct' ELSE 'vendor' END source,
          CASE WHEN b.vendor_id IS NULL THEN CASE WHEN b.is_active THEN 'active' ELSE 'inactive' END
            WHEN v.status='expired' OR v.expire_at<CURRENT_DATE OR v.banner_until<CURRENT_DATE THEN 'expired'
            WHEN v.status='active' AND COALESCE(v.ad_type,'none')<>'none' AND v.expire_at>=CURRENT_DATE AND COALESCE(v.banner_active,false)=true AND v.banner_until>=CURRENT_DATE THEN 'active'
            ELSE 'inactive' END display_status
        FROM banners b LEFT JOIN vendors v ON v.id=b.vendor_id
        UNION ALL
        SELECT 'vendor' source,
          CASE WHEN v.status='expired' OR v.expire_at<CURRENT_DATE OR v.banner_until<CURRENT_DATE THEN 'expired'
            WHEN v.status='active' AND COALESCE(v.ad_type,'none')<>'none' AND v.expire_at>=CURRENT_DATE AND COALESCE(v.banner_active,false)=true AND v.banner_until>=CURRENT_DATE THEN 'active'
            ELSE 'inactive' END display_status
        FROM vendors v WHERE COALESCE(v.banner_active,false)=true AND NOT EXISTS(SELECT 1 FROM banners b2 WHERE b2.vendor_id=v.id)
      ) x`),
    q(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='new')::int new,
      COUNT(*) FILTER (WHERE status='approved')::int approved, COUNT(*) FILTER (WHERE status='rejected')::int rejected,
      COUNT(*) FILTER (WHERE status='cancelled')::int cancelled,
      COUNT(*) FILTER (WHERE status='new' AND COALESCE(payment_status,'unpaid')='unpaid')::int unpaid,
      COUNT(*) FILTER (WHERE status='new' AND payment_status='waiting')::int waiting,
      COUNT(*) FILTER (WHERE payment_status='paid')::int paid FROM vendor_ad_requests`),
    q(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='new')::int new,
      COUNT(*) FILTER (WHERE status='approved')::int approved, COUNT(*) FILTER (WHERE status='rejected')::int rejected,
      COUNT(*) FILTER (WHERE status='cancelled')::int cancelled,
      COUNT(*) FILTER (WHERE status='new' AND COALESCE(payment_status,'unpaid')='unpaid')::int unpaid,
      COUNT(*) FILTER (WHERE status='new' AND payment_status='waiting')::int waiting,
      COUNT(*) FILTER (WHERE payment_status='paid')::int paid FROM vendor_banner_requests`)
  ]);
  const lc=listCounts.rows[0]||{},bc=bannerCounts.rows[0]||{},ac=adRequestCounts.rows[0]||{},brc=bannerRequestCounts.rows[0]||{};
  const nums=(row,keys)=>Object.fromEntries(keys.map(key=>[key,Number(row[key]||0)]));
  const requestKeys=['total','new','approved','rejected','cancelled','unpaid','waiting','paid'];
  const adRequestStats=nums(ac,requestKeys),bannerRequestStats=nums(brc,requestKeys);
  const adminListStats={
    users:{total:Number(lc.users_total||0),normal:Number(lc.users_normal||0),vendor:Number(lc.users_vendor||0),admin:Number(lc.users_admin||0),active:Number(lc.users_active||0)},
    banners:nums(bc,['total','direct','vendor','active','inactive','expired']),
    notices:{total:Number(lc.notices_total||0),pinned:Number(lc.notices_pinned||0)},
    reviews:{total:Number(lc.reviews_total||0),visible:Number(lc.reviews_visible||0),hidden:Number(lc.reviews_hidden||0),deleted:Number(lc.reviews_deleted||0)},
    adminLogs:{total:Number(lc.admin_logs_total||0)},
    vendorUpdateRequests:{total:Number(lc.vendor_requests_total||0),new:Number(lc.vendor_requests_new||0),approved:Number(lc.vendor_requests_approved||0),rejected:Number(lc.vendor_requests_rejected||0),cancelled:Number(lc.vendor_requests_cancelled||0)},
    inquiries:{total:Number(lc.inquiries_total||0),new:Number(lc.inquiries_new||0),approved:Number(lc.inquiries_approved||0),rejected:Number(lc.inquiries_rejected||0),apply:Number(lc.inquiries_apply||0),ad:Number(lc.inquiries_ad||0)},
    reports:{total:Number(lc.reports_total||0),new:Number(lc.reports_new||0),done:Number(lc.reports_done||0),vendor:Number(lc.reports_vendor||0),review:Number(lc.reports_review||0)},
    adRequests:adRequestStats,bannerRequests:bannerRequestStats,
    adCenter:Object.fromEntries(requestKeys.map(key=>[key,adRequestStats[key]+bannerRequestStats[key]]))
  };
  res.render('admin',{adminSummary,adminListStats,adminBoards,users:users.rows,vendors:vendors.rows,banners:banners.rows,reviews:reviews.rows,events:events.rows,notices:notices.rows,inquiries:inquiries.rows,flags:flags.rows,vendorRequests:vendorRequests.rows,bannerRequests:bannerRequests.rows,adRequests:adRequests.rows,adminLogs:adminLogs.rows,paymentLogs:paidRows,revenueStats,settings,dashboardStats});
  }catch(e){
    console.error('admin load failed',e);
    if(!res.headersSent)res.status(500).send('admin load failed: '+String(e.message||e));
  }
});

app.get('/mypage',login,async(req,res)=>{
  const user=await refreshSessionUser(req);
  if(!user){
    delete req.session.user;
    return res.redirect('/login');
  }
  if(user.role==='admin')return res.redirect('/admin');
  if(user.is_vendor)return res.redirect('/vendor-dashboard?panel=plan');

  const reviews=await q('SELECT r.*,v.name vendor_name FROM reviews r LEFT JOIN vendors v ON v.id=r.vendor_id WHERE r.user_id=$1 ORDER BY r.id DESC',[user.id]);
  const favorites=await q(`SELECT f.*,v.name vendor_name,v.region,v.category FROM favorites f JOIN vendors v ON v.id=f.vendor_id WHERE f.user_id=$1 AND ${PUBLIC_VENDOR_SQL} ORDER BY f.id DESC`,[user.id]);
  const inquiries=await q('SELECT id,type,company_name,category,region,content,status,created_at FROM inquiries WHERE user_id=$1 ORDER BY id DESC',[user.id]);
  res.render('mypage',{reviews:reviews.rows,favorites:favorites.rows,inquiries:inquiries.rows,settings:await getSettings()});
});

app.get('/vendor-apply',login,async(req,res)=>{const user=await refreshSessionUser(req); if(!user){delete req.session.user; return req.session.save(()=>res.redirect('/login'));} if(user.is_vendor&&user.vendor_id)return res.redirect('/vendor-dashboard'); const settings=await getSettings(); const pending=await q("SELECT id FROM inquiries WHERE user_id=$1 AND type='apply' AND status='new' LIMIT 1",[user.id]); res.render('vendor-apply',{settings,error:null,done:!!pending.rows[0]});});

app.post('/vendor-apply',login,upload.single('image'),async(req,res)=>{try{const user=await refreshSessionUser(req); if(!user){delete req.session.user; return req.session.save(()=>res.redirect('/login'));} if(user.is_vendor&&user.vendor_id)return res.redirect('/vendor-dashboard'); const settings=await getSettings(); const company=(req.body.company_name||'').trim().slice(0,100); const phone=(req.body.phone||'').trim().slice(0,50); const content=(req.body.content||'').trim().slice(0,2000); if(!company||!phone||content.length<5)return res.render('vendor-apply',{settings,error:'업체명, 연락처, 신청 내용을 정확히 입력해주세요.',done:false}); const exists=await q("SELECT id FROM inquiries WHERE user_id=$1 AND type='apply' AND status='new' LIMIT 1",[user.id]); if(exists.rows[0])return res.render('vendor-apply',{settings,error:null,done:true}); const im=img(req.file); await q('INSERT INTO inquiries(type,company_name,name,phone,kakao,email,category,region,content,main_image_data,status,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',['apply',company,user.nickname,phone,(req.body.kakao_url||'').trim().slice(0,200),(req.body.email||'').trim().slice(0,120),(req.body.category||'기타').trim().slice(0,50),(req.body.region||'기타').trim().slice(0,50),content,im,'new',user.id]); res.render('vendor-apply',{settings,error:null,done:true});}catch(e){res.render('vendor-apply',{settings:await getSettings(),error:e.message||'신청 실패',done:false});}});

app.get('/vendor-dashboard',login,async(req,res)=>{
  try{
    await ensureSchema();
    await expireAds();
    await expirePendingPayments();
    const refreshedUser=await refreshSessionUser(req);
    if(!refreshedUser){
      req.session.user=null;
      return req.session.save(()=>res.redirect('/login'));
    }

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

    const requests=await safeRows('SELECT * FROM vendor_update_requests WHERE user_id=$1 AND vendor_id=$2 ORDER BY id DESC LIMIT 100',[req.session.user.id,req.session.user.vendor_id]);
    const bannerRequests=await safeRows('SELECT * FROM vendor_banner_requests WHERE user_id=$1 AND vendor_id=$2 ORDER BY id DESC LIMIT 100',[req.session.user.id,req.session.user.vendor_id]);
    const adRequests=await safeRows('SELECT * FROM vendor_ad_requests WHERE user_id=$1 AND vendor_id=$2 ORDER BY id DESC LIMIT 100',[req.session.user.id,req.session.user.vendor_id]);
    const paymentLogs=await safeRows('SELECT * FROM payment_logs WHERE vendor_id=$1 ORDER BY id DESC LIMIT 100',[req.session.user.vendor_id]);

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
        const pr=await safeRows('SELECT * FROM vendor_ad_requests WHERE id=$1 AND user_id=$2 AND vendor_id=$3',[req.query.id,req.session.user.id,req.session.user.vendor_id]);
        if(pr[0])pendingPayment={kind:'ad',row:pr[0]};
      }else if(req.query.pay==='banner'){
        const pr=await safeRows('SELECT * FROM vendor_banner_requests WHERE id=$1 AND user_id=$2 AND vendor_id=$3',[req.query.id,req.session.user.id,req.session.user.vendor_id]);
        if(pr[0])pendingPayment={kind:'banner',row:pr[0]};
      }
    }

    const dashboardError=req.query.error==='image'?'이미지 파일을 확인해주세요. JPG, PNG, GIF, WEBP 형식의 정상 파일만 등록할 수 있습니다.':null;
    res.render('vendor-dashboard',{vendor,requests,bannerRequests,adRequests,paymentLogs,viewStats,expiryNotice,pricingPreview,pendingPayment,stats,settings,error:dashboardError,done:false});
  }catch(e){
    console.error('vendor-dashboard fatal error',e);
    res.status(500).send('업체관리 페이지 오류가 발생했습니다. 서버 로그를 확인해주세요.');
  }
});

app.post('/vendor-dashboard/update-request',login,upload.single('image'),async(req,res)=>{
  const user=await refreshSessionUser(req);
  if(!user){
    delete req.session.user;
    return req.session.save(()=>res.redirect('/login'));
  }
  if(!user.is_vendor||!user.vendor_id)return res.redirect('/vendor-apply');
  const vendorCheck=await q('SELECT id FROM vendors WHERE id=$1',[user.vendor_id]);
  if(!vendorCheck.rows[0])return res.redirect('/vendor-apply');
  const pending=await q("SELECT id FROM vendor_update_requests WHERE user_id=$1 AND vendor_id=$2 AND status='new' LIMIT 1",[user.id,user.vendor_id]);
  if(pending.rows[0])return res.redirect('/vendor-dashboard');
  const name=(req.body.name||'').trim().slice(0,100);
  if(!name)return res.redirect('/vendor-dashboard');
  const im=img(req.file);
  if(req.file&&!im)return res.redirect('/vendor-dashboard?error=image#edit');
  await q(
    'INSERT INTO vendor_update_requests(user_id,vendor_id,name,category,region,phone,kakao_url,business_hours,tags,description,image_data,sns_url,line_url,telegram_url,holiday_info) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
    [user.id,user.vendor_id,name,(req.body.category||'기타').trim().slice(0,50),(req.body.region||'기타').trim().slice(0,50),(req.body.phone||'').trim().slice(0,50),(req.body.kakao_url||'').trim().slice(0,200),(req.body.business_hours||'').trim().slice(0,200),(req.body.tags||'').trim().slice(0,300),(req.body.description||'').trim().slice(0,3000),im,(req.body.sns_url||'').trim().slice(0,200),(req.body.line_url||'').trim().slice(0,200),(req.body.telegram_url||'').trim().slice(0,200),(req.body.holiday_info||'').trim().slice(0,500)]
  );
  await adminNotify('vendor_update_request','업체정보 수정요청',`${name} 업체정보 수정요청이 접수되었습니다.`,'/admin#vendorRequests');
  res.redirect('/vendor-dashboard');
});

app.post('/vendor-dashboard/banner-request',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');

  const settings=await getSettings();
  const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]);
  const vendor=v.rows[0]||{};
  if(!vendor.image_data)return res.redirect('/vendor-dashboard?panel=banner');
  const today=new Date(); today.setHours(0,0,0,0);
  const expire=vendor.expire_at?new Date(vendor.expire_at):null;
  if(expire)expire.setHours(0,0,0,0);
  if(!expire||Number.isNaN(expire.getTime())||expire<today)return res.redirect('/vendor-dashboard?panel=banner');
  const pending=await q("SELECT id FROM vendor_banner_requests WHERE user_id=$1 AND vendor_id=$2 AND status='new' LIMIT 1",[req.session.user.id,req.session.user.vendor_id]);
  if(pending.rows[0])return res.redirect('/vendor-dashboard?panel=banner&pay=banner&id='+pending.rows[0].id);

  const price=(vendor.ad_type==='recommended')
    ? Number(settings.raw.recommended_to_banner_price_krw||settings.raw.banner_price_krw||0)
    : Number(settings.raw.general_to_banner_price_krw||0);

  const rate=Number(settings.raw.usdt_krw_rate||1400);
  const usdt=calcUsdt(price,rate);
  const payExpiresAt=paymentExpireAt(settings.raw);
  const payExpireMemo='입금기한: '+formatKstDateTime(payExpiresAt);

  const inserted=await q(
    'INSERT INTO vendor_banner_requests(user_id,vendor_id,title,subtitle,link_url,image_data,krw_price,usdt_amount,payment_status,status,admin_memo,payment_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
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
      'new',
      payExpireMemo,
      payExpiresAt
    ]
  );

  await adminNotify('banner_request','프리미엄배너 결제요청',`${vendor.name||'업체'} 프리미엄배너 신청이 접수되었습니다. ${Number(price||0).toLocaleString()}원 / ${usdt} USDT`,'/admin#bannerRequests');
  res.redirect('/vendor-dashboard?panel=banner&pay=banner&id='+inserted.rows[0].id);
});

app.post('/vendor-dashboard/ad-request',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/vendor-apply');

  const settings=await getSettings();
  const v=await q('SELECT * FROM vendors WHERE id=$1',[req.session.user.vendor_id]);
  const vendor=v.rows[0]||{};
  if(!vendor.id)return res.redirect('/vendor-dashboard?panel=plan');

  const productType=['renewal_general','renewal_recommended','renewal_banner'].includes(req.body.product_type)?req.body.product_type:'renewal_general';
  if(productType==='renewal_banner'){
    const today=new Date(); today.setHours(0,0,0,0);
    const bannerUntil=vendor.banner_until?new Date(vendor.banner_until):null;
    if(bannerUntil)bannerUntil.setHours(0,0,0,0);
    if(!vendor.banner_active||!bannerUntil||Number.isNaN(bannerUntil.getTime())||bannerUntil<today)return res.redirect('/vendor-dashboard?panel=banner');
  }
  const pending=await q("SELECT id,product_type FROM vendor_ad_requests WHERE user_id=$1 AND vendor_id=$2 AND status='new' AND product_type=$3 LIMIT 1",[req.session.user.id,req.session.user.vendor_id,productType]);
  if(pending.rows[0])return res.redirect('/vendor-dashboard?panel='+(productType==='renewal_banner'?'banner':'plan')+'&pay=ad&id='+pending.rows[0].id);
  const period=['30','60','90'].includes(String(req.body.period))?String(req.body.period):'30';
  const immediateApply=!!req.body.immediate_apply;

  const price=calcProductPrice(settings,vendor,productType,period,immediateApply);
  const rate=Number(settings.raw.usdt_krw_rate||1400);
  const usdt=calcUsdt(price,rate);
  const payExpiresAt=paymentExpireAt(settings.raw);
  const payExpireMemo='입금기한: '+formatKstDateTime(payExpiresAt);

  const productLabel=productType==='renewal_banner'
    ? '프리미엄배너 신청/연장'
    : productType==='renewal_recommended'
      ? '추천광고 신청/변경/연장'
      : '일반광고 신청/변경/연장';

  const content=[
    (req.body.content||'').trim().slice(0,1000),
    immediateApply?'[바로 적용 요청]':''
  ].filter(Boolean).join('\n');

  const inserted=await q(
    'INSERT INTO vendor_ad_requests(user_id,vendor_id,plan,period,content,status,payment_status,product_type,krw_price,usdt_amount,admin_memo,payment_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
    [req.session.user.id,req.session.user.vendor_id,productLabel,period,content,'new','unpaid',productType,price,usdt,payExpireMemo,payExpiresAt]
  );

  const panel=productType==='renewal_banner'?'banner':'plan';
  await adminNotify('ad_request','광고 결제요청',`${vendor.name||'업체'} ${productLabel} 신청이 접수되었습니다. ${Number(price||0).toLocaleString()}원 / ${usdt} USDT`,'/admin#adRequests');
  res.redirect('/vendor-dashboard?panel='+panel+'&pay=ad&id='+inserted.rows[0].id);
});

app.post('/vendor-dashboard/ad-request/:id/paid',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/login');
  await expirePendingPayments();
  const r=await q("UPDATE vendor_ad_requests SET payment_status=$1 WHERE id=$2 AND user_id=$3 AND vendor_id=$4 AND status='new' AND payment_status='unpaid' AND (payment_expires_at IS NULL OR payment_expires_at>=now()) RETURNING id,plan,krw_price,usdt_amount",['waiting',req.params.id,req.session.user.id,req.session.user.vendor_id]);
  if(r.rows[0])await adminNotify('payment_waiting','입금완료 알림',`${req.session.user.nickname||req.session.user.username||'업체'}님이 ${r.rows[0].plan||'광고 신청'} 입금완료를 눌렀습니다.`,'/admin#adRequests');
  res.redirect('/vendor-dashboard');
});

app.post('/admin/banner-requests/:id/approve',admin,async(req,res)=>sendFail(req,res,400,'배너 신청은 입금확인 버튼으로 승인 처리됩니다.','/admin#bannerRequests'));




app.post('/vendor-dashboard/banner-request/:id/paid',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/login');
  await expirePendingPayments();
  const r=await q("UPDATE vendor_banner_requests SET payment_status=$1 WHERE id=$2 AND user_id=$3 AND vendor_id=$4 AND status='new' AND payment_status='unpaid' AND (payment_expires_at IS NULL OR payment_expires_at>=now()) RETURNING id,title,krw_price,usdt_amount",['waiting',req.params.id,req.session.user.id,req.session.user.vendor_id]);
  if(r.rows[0])await adminNotify('payment_waiting','입금완료 알림',`${req.session.user.nickname||req.session.user.username||'업체'}님이 프리미엄배너 입금완료를 눌렀습니다.`,'/admin#bannerRequests');
  res.redirect('/vendor-dashboard?panel=banner');
});

app.post('/vendor-dashboard/banner-request/:id/cancel',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/login');
  await q("UPDATE vendor_banner_requests SET status='cancelled',payment_status='cancelled',admin_memo=COALESCE(admin_memo,'업체가 취소'),processed_at=now() WHERE id=$1 AND user_id=$2 AND vendor_id=$3 AND status='new' AND payment_status='unpaid'",[req.params.id,req.session.user.id,req.session.user.vendor_id]);
  res.redirect('/vendor-dashboard');
});
app.post('/vendor-dashboard/ad-request/:id/cancel',login,async(req,res)=>{
  if(!req.session.user.is_vendor||!req.session.user.vendor_id)return res.redirect('/login');
  await q("UPDATE vendor_ad_requests SET status='cancelled',payment_status='cancelled',admin_memo=COALESCE(admin_memo,'업체가 취소'),processed_at=now() WHERE id=$1 AND user_id=$2 AND vendor_id=$3 AND status='new' AND payment_status='unpaid'",[req.params.id,req.session.user.id,req.session.user.vendor_id]);
  res.redirect('/vendor-dashboard');
});

app.post('/admin/banner-requests/:id/payment-confirm',admin,async(req,res)=>{
  await expirePendingPayments();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const claimed=await client.query(
      "UPDATE vendor_banner_requests SET payment_status=$1,status=$2,processed_at=now() WHERE id=$3 AND status='new' AND payment_status='waiting' RETURNING *",
      ['paid','approved',req.params.id]
    );
    const x=claimed.rows[0];
    if(!x){
      await client.query('ROLLBACK');
      return sendOk(req,res,'/admin#bannerRequests');
    }

    const v=await client.query('SELECT * FROM vendors WHERE id=$1',[x.vendor_id]);
    const vendor=v.rows[0];
    const today=new Date(); today.setHours(0,0,0,0);
    const expire=vendor?.expire_at?new Date(vendor.expire_at):null;
    if(expire)expire.setHours(0,0,0,0);
    if(!expire||Number.isNaN(expire.getTime())||expire<today){
      await client.query('ROLLBACK');
      return sendFail(req,res,400,'광고기간이 있는 업체만 프리미엄배너를 승인할 수 있습니다.','/admin#bannerRequests');
    }
    const until=vendor.expire_at;

    const payMeta=buildPaymentConfirmMeta(req.body,x);
    await client.query(
      'UPDATE vendor_banner_requests SET admin_memo=$1,paid_usdt_amount=$2,payment_txid=$3 WHERE id=$4',
      [payMeta.memo,payMeta.paidUsdt||null,payMeta.txid||null,x.id]
    );

    const existingBanner=await client.query('SELECT id FROM banners WHERE vendor_id=$1 ORDER BY id DESC LIMIT 1',[x.vendor_id]);
    if(existingBanner.rows[0]){
      await client.query('UPDATE banners SET title=$1,subtitle=$2,link_url=$3,position=$4,sort_order=$5,is_active=$6,image_data=$7 WHERE id=$8',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data,existingBanner.rows[0].id]);
    }else{
      await client.query('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data,vendor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[x.title,x.subtitle,x.link_url||'#','premium',0,true,x.image_data,x.vendor_id]);
    }
    await client.query("UPDATE vendors SET ad_type='recommended',membership_type=$1,is_recommended=true,is_premium=true,banner_active=true,banner_until=$2,status=$3 WHERE id=$4",['recommended',until,'active',x.vendor_id]);
    await client.query('INSERT INTO payment_logs(user_id,vendor_id,product_type,request_type,request_id,krw_price,usdt_amount,paid_usdt_amount,payment_txid,status,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[x.user_id,x.vendor_id,'banner','banner_request',x.id,x.krw_price||0,x.usdt_amount||0,payMeta.paidUsdt||null,payMeta.txid||null,'paid',payMeta.memo||'프리미엄배너 입금확인']);
    await client.query('INSERT INTO admin_logs(admin_id,admin_username,action,target_type,target_id,memo) VALUES($1,$2,$3,$4,$5,$6)',[req.session.user?.id||null,req.session.user?.username||'','배너 입금확인/추천승격','banner_request',String(x.id||''),`만기일 ${until}${payMeta.txid?' / TXID '+payMeta.txid:''}`]);
    if(x.user_id){
      await client.query('INSERT INTO notifications(user_id,role_target,type,title,message,link_url) VALUES($1,$2,$3,$4,$5,$6)',[x.user_id,'user','payment_confirmed','프리미엄배너 결제완료','프리미엄배너 입금확인이 완료되어 배너가 적용되었습니다.','/vendor-dashboard?panel=payments']);
    }
    await client.query('COMMIT');
    return sendOk(req,res,'/admin#bannerRequests');
  }catch(e){
    try{await client.query('ROLLBACK');}catch(_){}
    console.error('banner payment confirm failed',e.message);
    return res.status(500).send('입금확인 처리 중 오류가 발생했습니다.');
  }finally{
    client.release();
  }
});
app.post('/admin/ad-requests/:id/payment-confirm',admin,async(req,res)=>{
  await expirePendingPayments();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const claimed=await client.query(
      "UPDATE vendor_ad_requests SET payment_status=$1,status=$2,processed_at=now() WHERE id=$3 AND status='new' AND payment_status='waiting' RETURNING *",
      ['paid','approved',req.params.id]
    );
    const x=claimed.rows[0];
    if(!x){
      await client.query('ROLLBACK');
      return sendOk(req,res,'/admin#adRequests');
    }

    const payMeta=buildPaymentConfirmMeta(req.body,x);
    await client.query(
      'UPDATE vendor_ad_requests SET admin_memo=$1,paid_usdt_amount=$2,payment_txid=$3 WHERE id=$4',
      [payMeta.memo,payMeta.paidUsdt||null,payMeta.txid||null,x.id]
    );

    const vendorRes=await client.query('SELECT * FROM vendors WHERE id=$1',[x.vendor_id]);
    const vendor=vendorRes.rows[0]||{};
    const days=parseInt(x.period||30,10)||30;
    const productType=x.product_type||'renewal_general';
    const wantsImmediate=(x.content||'').includes('[바로 적용 요청]');
    const oldExpire=vendor.expire_at||null;
    let vendorUpdate=null;

    if(productType==='renewal_general'){
      vendorUpdate=await client.query(`UPDATE vendors SET ad_type='general',membership_type='general',is_recommended=false,is_premium=false,banner_active=false,banner_until=NULL,status='active', ${addDaysSqlFromExpire()}, scheduled_membership_type=NULL, scheduled_banner_active=NULL, scheduled_change_at=NULL, scheduled_change_note=NULL WHERE id=$2 RETURNING id`,[days,x.vendor_id]);
    }else if(productType==='renewal_recommended'){
      if((vendor.membership_type||'general')==='general' && !wantsImmediate && oldExpire){
        vendorUpdate=await client.query(`UPDATE vendors SET status='active', ${addDaysSqlFromExpire()}, scheduled_membership_type='recommended', scheduled_banner_active=false, scheduled_change_at=$3, scheduled_change_note=$4 WHERE id=$2 RETURNING id`,[days,x.vendor_id,oldExpire,'일반 기간 종료 후 추천업체로 변경']);
      }else{
        vendorUpdate=await client.query(`UPDATE vendors SET ad_type='recommended',membership_type='recommended',is_recommended=true,is_premium=false,banner_active=false,banner_until=NULL,status='active', ${addDaysSqlFromExpire()}, scheduled_membership_type=NULL, scheduled_banner_active=NULL, scheduled_change_at=NULL, scheduled_change_note=NULL WHERE id=$2 RETURNING id`,[days,x.vendor_id]);
      }
    }else if(productType==='renewal_banner'){
      vendorUpdate=await client.query(`UPDATE vendors SET ad_type='recommended',membership_type='recommended',is_recommended=true,is_premium=true,banner_active=true,status='active', ${addDaysSqlFromExpire()}, banner_until=CASE WHEN expire_at IS NOT NULL AND expire_at>CURRENT_DATE THEN (expire_at + ($1 || ' days')::interval)::date ELSE (CURRENT_DATE + ($1 || ' days')::interval)::date END, scheduled_membership_type=NULL, scheduled_banner_active=NULL, scheduled_change_at=NULL, scheduled_change_note=NULL WHERE id=$2 RETURNING id`,[days,x.vendor_id]);
    }
    if(!vendorUpdate?.rows?.[0]){
      await client.query('ROLLBACK');
      return sendFail(req,res,404,'vendor_not_found','/admin#adRequests');
    }

    const paymentProduct=productType==='renewal_banner'?'banner':(productType==='renewal_general'?'general':'recommended');
    await client.query('INSERT INTO payment_logs(user_id,vendor_id,product_type,request_type,request_id,krw_price,usdt_amount,paid_usdt_amount,payment_txid,status,memo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[x.user_id,x.vendor_id,paymentProduct,'ad_request',x.id,x.krw_price||0,x.usdt_amount||0,payMeta.paidUsdt||null,payMeta.txid||null,'paid',payMeta.memo||x.plan||'변경/연장 입금확인']);
    await client.query('INSERT INTO admin_logs(admin_id,admin_username,action,target_type,target_id,memo) VALUES($1,$2,$3,$4,$5,$6)',[req.session.user?.id||null,req.session.user?.username||'','변경/연장 입금확인','ad_request',String(x.id||''),`${x.plan||productType} 적용${payMeta.txid?' / TXID '+payMeta.txid:''}`]);
    if(x.user_id){
      await client.query('INSERT INTO notifications(user_id,role_target,type,title,message,link_url) VALUES($1,$2,$3,$4,$5,$6)',[x.user_id,'user','payment_confirmed','광고 결제완료',`${x.plan||'광고 신청'} 입금확인이 완료되어 광고가 적용되었습니다.`,'/vendor-dashboard?panel=payments']);
    }
    await client.query('COMMIT');
    return sendOk(req,res,'/admin#adRequests');
  }catch(e){
    try{await client.query('ROLLBACK');}catch(_){}
    console.error('ad payment confirm failed',e.message);
    return res.status(500).send('입금확인 처리 중 오류가 발생했습니다.');
  }finally{
    client.release();
  }
});
app.post('/admin/banner-requests/:id/reject',admin,async(req,res)=>runAdminAction(req,res,'/admin#bannerRequests',async()=>{const r=await q("UPDATE vendor_banner_requests SET status=$1,payment_status=$2,admin_memo=$3,processed_at=now() WHERE id=$4 AND status='new' RETURNING id,user_id",['rejected','rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); if(!r.rows[0])throw new Error('반려할 배너 신청을 찾을 수 없거나 이미 처리되었습니다.'); await userNotify(r.rows[0].user_id,'request_rejected','프리미엄배너 신청 반려',(req.body.admin_memo||'프리미엄배너 신청이 반려되었습니다.').slice(0,500),'/vendor-dashboard?panel=history'); await logAdmin(req,'배너신청 반려','banner_request',req.params.id,req.body.admin_memo||'');}));

app.post('/admin/ad-requests/:id/approve',admin,async(req,res)=>sendFail(req,res,400,'광고 신청은 입금확인 버튼으로 승인 처리됩니다.','/admin#adRequests'));

app.post('/admin/ad-requests/:id/reject',admin,async(req,res)=>runAdminAction(req,res,'/admin#adRequests',async()=>{const r=await q("UPDATE vendor_ad_requests SET status=$1,payment_status=$2,admin_memo=$3,processed_at=now() WHERE id=$4 AND status='new' RETURNING id,user_id,plan",['rejected','rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); if(!r.rows[0])throw new Error('반려할 광고 신청을 찾을 수 없거나 이미 처리되었습니다.'); await userNotify(r.rows[0].user_id,'request_rejected','광고 신청 반려',(req.body.admin_memo||`${r.rows[0].plan||'광고 신청'}이 반려되었습니다.`).slice(0,500),'/vendor-dashboard?panel=history'); await logAdmin(req,'상품/광고신청 반려','ad_request',req.params.id,req.body.admin_memo||'');}));

app.post('/admin/vendor-requests/:id/approve',admin,async(req,res)=>{
  const client=await pool.connect();
  let x=null;
  try{
    await client.query('BEGIN');
    const r=await client.query("SELECT * FROM vendor_update_requests WHERE id=$1 AND status='new' FOR UPDATE",[req.params.id]);
    x=r.rows[0];
    if(!x){
      await client.query('ROLLBACK');
      return sendFail(req,res,404,'승인할 업체 수정요청을 찾을 수 없거나 이미 처리되었습니다.','/admin#vendorRequests');
    }

    const params=[x.name,x.category,x.region,x.phone,x.kakao_url,x.business_hours,x.tags,x.description,x.sns_url,x.line_url,x.telegram_url,x.holiday_info,x.vendor_id];
    const updateSql=x.image_data
      ? 'UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,business_hours=$6,tags=$7,description=$8,sns_url=$9,line_url=$10,telegram_url=$11,holiday_info=$12,image_data=$14,image_updated_at=now() WHERE id=$13 RETURNING id'
      : 'UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,business_hours=$6,tags=$7,description=$8,sns_url=$9,line_url=$10,telegram_url=$11,holiday_info=$12 WHERE id=$13 RETURNING id';
    const updated=await client.query(updateSql,x.image_data?[...params,x.image_data]:params);
    if(!updated.rows[0]){
      await client.query('ROLLBACK');
      return sendFail(req,res,404,'수정요청의 업체를 찾을 수 없습니다.','/admin#vendorRequests');
    }

    await client.query('UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3',['approved',(req.body.admin_memo||'').slice(0,500),x.id]);
    await client.query('COMMIT');
  }catch(e){
    try{await client.query('ROLLBACK');}catch(rollbackErr){console.error('vendor request approve rollback failed',rollbackErr.message);}
    console.error('vendor request approve failed',e);
    return sendFail(req,res,500,e.message||'업체 수정요청 승인 중 오류가 발생했습니다.','/admin#vendorRequests');
  }finally{
    client.release();
  }
  await userNotify(x.user_id,'vendor_update_approved','업체정보 수정 승인','업체정보 수정요청이 승인되었습니다.','/vendor-dashboard?panel=history');
  await logAdmin(req,'업체수정요청 승인','vendor_update_request',x.id,req.body.admin_memo||'');
  return sendOk(req,res,'/admin#vendorRequests');
});
app.post('/admin/vendor-requests/:id/reject',admin,async(req,res)=>runAdminAction(req,res,'/admin#vendorRequests',async()=>{const r=await q("UPDATE vendor_update_requests SET status=$1,admin_memo=$2,processed_at=now() WHERE id=$3 AND status='new' RETURNING id,user_id",['rejected',(req.body.admin_memo||'').slice(0,500),req.params.id]); if(!r.rows[0])throw new Error('반려할 업체 수정요청을 찾을 수 없거나 이미 처리되었습니다.'); await userNotify(r.rows[0].user_id,'vendor_update_rejected','업체정보 수정 반려',(req.body.admin_memo||'업체정보 수정요청이 반려되었습니다.').slice(0,500),'/vendor-dashboard?panel=history'); await logAdmin(req,'업체수정요청 반려','vendor_update_request',req.params.id,req.body.admin_memo||'');}));


async function validateAdminUserChange(req,userId,nextRole,nextStatus){
  const current=await q('SELECT id,role,status FROM users WHERE id=$1',[userId]);
  const user=current.rows[0];
  if(!user)return {ok:false,error:'user_not_found',status:404};
  const becomingNonAdmin=nextRole!=='admin';
  const becomingInactive=nextStatus!=='active';
  if(user.id===req.session.user?.id&&(becomingNonAdmin||becomingInactive)){
    return {ok:false,error:'admin_self_protect',status:400,user};
  }
  if(user.role==='admin'&&user.status==='active'&&(becomingNonAdmin||becomingInactive)){
    const activeAdmins=await q("SELECT COUNT(*)::int count FROM users WHERE role='admin' AND status='active'");
    if(Number(activeAdmins.rows[0]?.count||0)<=1)return {ok:false,error:'last_admin_protect',status:400,user};
  }
  return {ok:true,user};
}

app.post('/admin/users/:id/update',admin,upload.none(),async(req,res)=>{
  const userId=parseInt(req.params.id||req.body.id||0,10);
  if(!userId)return res.status(400).json({ok:false,error:'잘못된 회원입니다.'});
  const current=await q('SELECT id,username,nickname,role,status FROM users WHERE id=$1',[userId]);
  const user=current.rows[0];
  if(!user)return res.status(404).json({ok:false,error:'회원을 찾을 수 없습니다.'});
  const hasNickname=Object.prototype.hasOwnProperty.call(req.body,'nickname');
  const nickname=hasNickname&&String(req.body.nickname||'').trim()?String(req.body.nickname).trim().slice(0,50):user.nickname;
  const role=['admin','user'].includes(req.body.role)?req.body.role:user.role;
  const status=['active','blocked','suspended','inactive'].includes(req.body.status)?req.body.status:user.status;
  const password=(req.body.password||'').trim();
  const protection=await validateAdminUserChange(req,userId,role,status);
  if(!protection.ok)return res.status(protection.status||400).json({ok:false,error:protection.error});
  if(password&&password.length<6)return res.status(400).json({ok:false,error:'비밀번호는 6자 이상이어야 합니다.'});
  if(password){
    const h=await bcrypt.hash(password,10);
    await q('UPDATE users SET nickname=$1,role=$2,status=$3,password_hash=$4 WHERE id=$5',[nickname,role,status,h,userId]);
  }else{
    await q('UPDATE users SET nickname=$1,role=$2,status=$3 WHERE id=$4',[nickname,role,status,userId]);
  }
  await logAdmin(req,'회원 수정','user',userId,nickname);
  const saved=await q('SELECT id,username,nickname,role,status,is_vendor,vendor_id,created_at FROM users WHERE id=$1',[userId]);
  if(req.get('x-requested-with'))return res.json({ok:true,user:saved.rows[0]});
  res.redirect('/admin#users');
});


app.post('/admin/delete/users/:id',admin,async(req,res)=>runAdminAction(req,res,'/admin#users',async()=>{
  const userId=parseInt(req.params.id||0,10);
  if(!userId)throw new Error('잘못된 회원입니다.');
  const u=await q('SELECT id,username,role FROM users WHERE id=$1',[userId]);
  if(!u.rows[0])throw new Error('회원을 찾을 수 없습니다.');
  if(u.rows[0].role==='admin')throw new Error('관리자 계정은 삭제할 수 없습니다.');
  await q('UPDATE users SET vendor_id=NULL,is_vendor=false WHERE id=$1',[userId]);
  await q('DELETE FROM users WHERE id=$1',[userId]);
  await logAdmin(req,'회원 삭제','user',userId,u.rows[0].username||'');
}));

app.post('/admin/link-user-vendor',admin,async(req,res)=>{
  const userId=parseInt(req.body.user_id||0,10);
  const vendorId=parseInt(req.body.vendor_id||0,10);
  if(!userId||!vendorId){
    if(req.get('x-requested-with'))return res.status(400).json({ok:false,error:'회원과 업체를 선택해주세요.'});
    return res.redirect('/admin#users');
  }
  const u=await q('SELECT id,role,username,vendor_id FROM users WHERE id=$1',[userId]);
  if(!u.rows[0]){
    if(req.get('x-requested-with'))return res.status(404).json({ok:false,error:'회원을 찾을 수 없습니다.'});
    return res.redirect('/admin#users');
  }
  if(u.rows[0].role==='admin'){
    if(req.get('x-requested-with'))return res.status(400).json({ok:false,error:'관리자 계정은 업체회원으로 연결할 수 없습니다.'});
    return res.redirect('/admin#users');
  }
  const vendor=await q('SELECT id,name FROM vendors WHERE id=$1',[vendorId]);
  if(!vendor.rows[0]){
    if(req.get('x-requested-with'))return res.status(404).json({ok:false,error:'연결할 업체를 찾을 수 없습니다.'});
    return res.redirect('/admin#users');
  }
  const already=await q('SELECT id,username FROM users WHERE vendor_id=$1 AND id<>$2 LIMIT 1',[vendorId,userId]);
  if(already.rows[0]){
    const msg=`이미 ${already.rows[0].username} 아이디와 연결된 업체입니다.`;
    if(req.get('x-requested-with'))return res.status(409).json({ok:false,error:msg});
    return res.redirect('/admin#users');
  }
  await q('UPDATE users SET is_vendor=true,vendor_id=$1 WHERE id=$2',[vendorId,userId]);
  await logAdmin(req,'회원 업체연결','user',userId,`vendor_id=${vendorId} / ${vendor.rows[0].name||''}`);
  if(req.get('x-requested-with'))return res.json({ok:true,vendor_id:vendorId,user_id:userId});
  res.redirect('/admin#users');
});




app.post('/admin/banner-requests/:id/cancel',admin,async(req,res)=>{
  const cancelled=await q("UPDATE vendor_banner_requests SET status='cancelled',payment_status='cancelled',admin_memo=$1,processed_at=now() WHERE id=$2 AND status='new' RETURNING id",[(req.body.admin_memo||'관리자 취소').slice(0,500),req.params.id]);
  if(!cancelled.rows[0])return sendFail(req,res,409,'already_processed','/admin#bannerRequests');
  await logAdmin(req,'배너신청 취소','banner_request',req.params.id,req.body.admin_memo||'관리자 취소');
  return sendOk(req,res,'/admin#bannerRequests');
});

app.post('/admin/ad-requests/:id/cancel',admin,async(req,res)=>{
  const cancelled=await q("UPDATE vendor_ad_requests SET status='cancelled',payment_status='cancelled',admin_memo=$1,processed_at=now() WHERE id=$2 AND status='new' RETURNING id",[(req.body.admin_memo||'관리자 취소').slice(0,500),req.params.id]);
  if(!cancelled.rows[0])return sendFail(req,res,409,'already_processed','/admin#adRequests');
  await logAdmin(req,'상품/광고신청 취소','ad_request',req.params.id,req.body.admin_memo||'관리자 취소');
  return sendOk(req,res,'/admin#adRequests');
});

app.get('/admin/backup.json',admin,async(req,res)=>{
  const tables=['users','vendors','banners','reviews','notices','inquiries','flags','vendor_update_requests','vendor_banner_requests','vendor_ad_requests','favorites','app_settings','payment_logs','vendor_view_logs'];
  const data={created_at:new Date().toISOString(),tables:{}};
  for(const t of tables){try{const r=await q(`SELECT * FROM ${t} ORDER BY 1`); data.tables[t]=r.rows;}catch(e){data.tables[t]=[];}}
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename=\"backup.json\"');
  res.send(JSON.stringify(data,null,2));
});
app.post('/admin/restore-json',admin,async(req,res)=>{await logAdmin(req,'복원 차단','system','restore','복원 기능 임시 비활성화');res.redirect('/admin#settings');});

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

app.post('/admin/settings/options',admin,upload.fields([{name:'site_logo',maxCount:1},{name:'site_favicon',maxCount:1}]),async(req,res)=>{const money=(v,d)=>{const n=parseInt(v,10);return Number.isFinite(n)&&n>=0&&n<=100000000?String(n):String(d)}; const days=(v,d)=>{const n=parseInt(v,10);return Number.isFinite(n)&&n>=1&&n<=3650?String(n):String(d)}; const size=(v,d,min,max)=>{const n=parseInt(v,10);return Number.isFinite(n)&&n>=min&&n<=max?String(n):String(d)}; const decimal=(v,d,min,max)=>{const n=parseFloat(v);return Number.isFinite(n)?String(Math.max(min,Math.min(max,n))):String(d)};
  const current=await getSettings();
  const section=String(req.body.settings_section||'').trim();
  const fields={};
  if(section==='basic'){
    fields.categories=(req.body.categories||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,50).join('\n');
    fields.regions=(req.body.regions||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,50).join('\n');
    fields.site_name=(req.body.site_name||current.raw.site_name||'서비스 디렉터리').trim().slice(0,80)||'서비스 디렉터리';
    fields.site_link_url=(req.body.site_link_url||current.raw.site_link_url||'/').trim().slice(0,200)||'/';
    fields.brand_show_logo=req.body.brand_show_logo?'on':'off';
    fields.brand_show_name=req.body.brand_show_name?'on':'off';
    fields.brand_logo_height=size(req.body.brand_logo_height,current.raw.brand_logo_height||56,24,120);
    fields.brand_name_size=size(req.body.brand_name_size,current.raw.brand_name_size||32,14,72);
    const logoFile=req.files?.site_logo?.[0];
    const faviconFile=req.files?.site_favicon?.[0];
    fields.site_logo_data=current.raw.site_logo_data||'';
    fields.site_favicon_data=current.raw.site_favicon_data||'';
    if(req.body.remove_site_logo)fields.site_logo_data='';
    else if(logoFile){const logo=img(logoFile);if(logo)fields.site_logo_data=logo;}
    if(req.body.remove_site_favicon)fields.site_favicon_data='';
    else if(faviconFile){const favicon=img(faviconFile);if(favicon)fields.site_favicon_data=favicon;}
  }else if(section==='payment'){
    fields.usdt_address=(req.body.usdt_address||'').trim().slice(0,200);
    fields.usdt_network=(req.body.usdt_network||current.raw.usdt_network||'TRC20').trim().slice(0,30);
    fields.usdt_krw_rate=money(req.body.usdt_krw_rate,current.raw.usdt_krw_rate||1400);
    fields.usdt_rate_auto=req.body.usdt_rate_auto?'on':'off';
    fields.usdt_rate_source=['auto','upbit','bithumb'].includes(req.body.usdt_rate_source)?req.body.usdt_rate_source:(current.raw.usdt_rate_source||'auto');
    fields.usdt_rate_margin_percent=decimal(req.body.usdt_rate_margin_percent,current.raw.usdt_rate_margin_percent||0,-10,10);
    fields.banner_price_krw=money(req.body.banner_price_krw,current.raw.banner_price_krw||100000);
    fields.ad_price_krw_30=money(req.body.ad_price_krw_30,current.raw.ad_price_krw_30||100000);
    fields.ad_price_krw_60=money(req.body.ad_price_krw_60,current.raw.ad_price_krw_60||180000);
    fields.ad_price_krw_90=money(req.body.ad_price_krw_90,current.raw.ad_price_krw_90||250000);
    fields.general_register_price_krw=money(req.body.general_register_price_krw,current.raw.general_register_price_krw||30000);
    fields.recommended_register_price_krw=money(req.body.recommended_register_price_krw,current.raw.recommended_register_price_krw||70000);
    fields.general_to_recommended_price_krw=money(req.body.general_to_recommended_price_krw,current.raw.general_to_recommended_price_krw||40000);
    fields.general_to_banner_price_krw=money(req.body.general_to_banner_price_krw,current.raw.general_to_banner_price_krw||100000);
    fields.recommended_to_banner_price_krw=money(req.body.recommended_to_banner_price_krw,current.raw.recommended_to_banner_price_krw||70000);
    fields.default_register_days=days(req.body.default_register_days,current.raw.default_register_days||30);
    fields.payment_expire_hours=days(req.body.payment_expire_hours,current.raw.payment_expire_hours||24);
  }else{
    return sendFail(req,res,400,'invalid_settings_section','/admin#settings');
  }
  for(const [key,value] of Object.entries(fields)){
    await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",[key,String(value)]);
  }
  await logAdmin(req,'환경설정 저장','settings',section,section==='basic'?'업종/지역/브랜딩 설정 수정':'결제/가격 설정 수정');
  return sendOk(req,res,'/admin#settings');
});
app.post('/admin/settings/admin-account',admin,upload.none(),async(req,res)=>{
  const username=(req.body.username||'').trim();
  const nickname=(req.body.nickname||'관리자').trim().slice(0,50);
  const password=(req.body.password||'').trim();
  if(!/^[a-zA-Z0-9_]{4,30}$/.test(username))return sendFail(req,res,400,'invalid_username','/admin#settings');
  if(password&&password.length<8)return sendFail(req,res,400,'password_too_short','/admin#settings');
  try{
    let updated;
    if(password){
      const h=await bcrypt.hash(password,10);
      updated=await q('UPDATE users SET username=$1,nickname=$2,password_hash=$3 WHERE id=$4 AND role=$5 RETURNING id,username,nickname',[username,nickname||'관리자',h,req.session.user.id,'admin']);
    }else{
      updated=await q('UPDATE users SET username=$1,nickname=$2 WHERE id=$3 AND role=$4 RETURNING id,username,nickname',[username,nickname||'관리자',req.session.user.id,'admin']);
    }
    const saved=updated.rows[0];
    if(!saved)return sendFail(req,res,404,'admin_account_not_found','/admin#settings');
    req.session.user.username=saved.username;
    req.session.user.nickname=saved.nickname;
    await logAdmin(req,'관리자 계정 수정','settings','admin-account',saved.username);
    return sendOk(req,res,'/admin#settings');
  }catch(e){
    console.error('admin account update failed',e);
    return sendFail(req,res,500,'admin_account_update_failed','/admin#settings');
  }
});
app.post('/admin/vendor',admin,upload.single('image'),async(req,res)=>{
  const wantsJson=!!req.get('x-requested-with') || (req.get('accept')||'').includes('application/json');
  try{
    const im=img(req.file);
    const id=parseInt(req.body.id||0,10);
    const name=(req.body.name||'').trim().slice(0,100);
    const category=(req.body.category||'기타').trim().slice(0,50)||'기타';
    const region=(req.body.region||'기타').trim().slice(0,50)||'기타';
    const phone=(req.body.phone||'').trim().slice(0,50);
    const kakaoUrl=(req.body.kakao_url||'').trim().slice(0,200);
    const tags=(req.body.tags||'').trim().slice(0,300);
    const description=(req.body.description||'').trim().slice(0,3000);
    const businessHours=(req.body.business_hours||'').trim().slice(0,200);
    const status=['pending','active','hidden','expired','inactive'].includes(req.body.status)?req.body.status:'active';
    const bannerActive=!!req.body.banner_active;
    const requestedAdType=['none','general','recommended'].includes(req.body.ad_type)?req.body.ad_type:'none';
    const adType=bannerActive?'recommended':requestedAdType;
    const membership=adType==='recommended'?'recommended':'general';
    const isRecommended=adType==='recommended';
    const isPremium=bannerActive;
    let expireAt=(req.body.expire_at||'').trim()||null;
    if(adType==='none')expireAt=null;
    if(adType!=='none'&&!expireAt){
      if(wantsJson)return res.status(400).json({ok:false,error:'광고상품 사용 시 광고 만료일을 입력해주세요.'});
      return res.redirect('/admin#vendors');
    }
    if(bannerActive&&!expireAt){
      if(wantsJson)return res.status(400).json({ok:false,error:'배너 사용 시 광고 만료일을 입력해주세요.'});
      return res.redirect('/admin#vendors');
    }
    const bannerUntil=bannerActive?expireAt:null;
    const snsUrl=(req.body.sns_url||'').trim().slice(0,200);
    const lineUrl=(req.body.line_url||'').trim().slice(0,200);
    const telegramUrl=(req.body.telegram_url||'').trim().slice(0,200);
    const holidayInfo=(req.body.holiday_info||'').trim().slice(0,500);

    if(!name){
      if(wantsJson)return res.status(400).json({ok:false,error:'업체명을 입력해주세요.'});
      return res.redirect('/admin#vendors');
    }

    let row;
    if(id){
      const params=[
        name,category,region,phone,kakaoUrl,tags,description,businessHours,isRecommended,isPremium,
        status,membership,adType,expireAt,bannerActive,bannerUntil,snsUrl,lineUrl,telegramUrl,holidayInfo,id
      ];
      if(im){
        const r=await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11,membership_type=$12,ad_type=$13,expire_at=$14,banner_active=$15,banner_until=$16,sns_url=$17,line_url=$18,telegram_url=$19,holiday_info=$20,image_data=$22,image_updated_at=now() WHERE id=$21 RETURNING *',[...params,im]);
        row=r.rows[0];
      }else{
        const r=await q('UPDATE vendors SET name=$1,category=$2,region=$3,phone=$4,kakao_url=$5,tags=$6,description=$7,business_hours=$8,is_recommended=$9,is_premium=$10,status=$11,membership_type=$12,ad_type=$13,expire_at=$14,banner_active=$15,banner_until=$16,sns_url=$17,line_url=$18,telegram_url=$19,holiday_info=$20 WHERE id=$21 RETURNING *',params);
        row=r.rows[0];
      }
      if(!row){
        if(wantsJson)return res.status(404).json({ok:false,error:'수정할 업체를 찾지 못했습니다.'});
        return res.redirect('/admin#vendors');
      }
    }else{
      const r=await q('INSERT INTO vendors(name,category,region,phone,kakao_url,tags,description,business_hours,is_recommended,is_premium,image_data,membership_type,ad_type,expire_at,banner_active,banner_until,status,sns_url,line_url,telegram_url,holiday_info) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *',[
        name,category,region,phone,kakaoUrl,tags,description,businessHours,isRecommended,isPremium,im,
        membership,adType,expireAt,bannerActive,bannerUntil,status,snsUrl,lineUrl,telegramUrl,holidayInfo
      ]);
      row=r.rows[0];
    }
    await logAdmin(req,id?'업체 수정':'관리자 업체 선등록','vendor',id||row?.id||'new',name);
    if(wantsJson)return res.json({ok:true,mode:id?'update':'create',vendor:row});
    res.redirect('/admin#vendors');
  }catch(e){
    console.error('admin vendor save failed',e);
    if(wantsJson)return res.status(500).json({ok:false,error:e.message||'업체 저장 중 오류가 발생했습니다.'});
    res.redirect('/admin#vendors');
  }
});
app.post('/admin/banner',admin,upload.single('image'),async(req,res)=>{const im=img(req.file); if(req.body.id){let p=[req.body.title,req.body.subtitle,req.body.link_url,req.body.position||'premium',req.body.sort_order||0,!!req.body.is_active,req.body.id]; await q(`UPDATE banners SET title=$1,subtitle=$2,link_url=$3,position=$4,sort_order=$5,is_active=$6 ${im?', image_data=$8':''} WHERE id=$7`, im?[...p,im]:p)} else await q('INSERT INTO banners(title,subtitle,link_url,position,sort_order,is_active,image_data) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.body.title,req.body.subtitle,req.body.link_url,req.body.position||'premium',req.body.sort_order||0,!!req.body.is_active,im]); await logAdmin(req,req.body.id?'배너 수정':'배너 등록','banner',req.body.id||'new',req.body.title||''); return sendOk(req,res,'/admin#banners');});
app.post('/admin/user',admin,upload.none(),async(req,res)=>{
  const userId=parseInt(req.body.id||0,10);
  if(!userId)return res.redirect('/admin#users');
  const current=await q('SELECT id,username,nickname,role,status FROM users WHERE id=$1',[userId]);
  const user=current.rows[0];
  if(!user){
    if(wantsJson(req))return res.status(404).json({ok:false,error:'user_not_found'});
    return res.redirect('/admin#users');
  }
  const hasNickname=Object.prototype.hasOwnProperty.call(req.body,'nickname');
  const nickname=hasNickname&&String(req.body.nickname||'').trim()?String(req.body.nickname).trim().slice(0,50):user.nickname;
  const role=['admin','user'].includes(req.body.role)?req.body.role:user.role;
  const status=['active','blocked','suspended','inactive'].includes(req.body.status)?req.body.status:user.status;
  const password=req.body.password||'';
  if(password&&password.length<6)return res.redirect('/admin#users');
  const protection=await validateAdminUserChange(req,userId,role,status);
  if(!protection.ok){if(wantsJson(req))return res.status(protection.status||400).json({ok:false,error:protection.error}); return res.redirect('/admin#users');}
  const h=password?await bcrypt.hash(password,10):null;
  if(h) await q('UPDATE users SET nickname=$1,role=$2,status=$3,password_hash=$4 WHERE id=$5',[nickname,role,status,h,userId]);
  else await q('UPDATE users SET nickname=$1,role=$2,status=$3 WHERE id=$4',[nickname,role,status,userId]);
  await logAdmin(req,'회원 수정','user',userId,nickname);
  if(req.get('x-requested-with'))return res.json({ok:true});
  res.redirect('/admin#users');
});
app.post('/admin/notice',admin,async(req,res)=>{await q('INSERT INTO notices(title,content,is_pinned) VALUES($1,$2,$3)',[req.body.title,req.body.content,!!req.body.is_pinned]); await logAdmin(req,'공지 등록','notice','new',req.body.title||''); return sendOk(req,res,'/admin#notices');});
app.post('/admin/delete/:table/:id',admin,async(req,res)=>runAdminAction(req,res,req.params.table==='vendors'?'/admin#vendors':'/admin#'+req.params.table,async()=>{const allowed={vendors:'vendors',banners:'banners',users:'users',reviews:'reviews',notices:'notices',events:'events',inquiries:'inquiries'}; const table=allowed[req.params.table]; const id=parseInt(req.params.id||0,10); if(!table||!id)throw new Error('삭제 대상이 올바르지 않습니다.'); if(table==='users'){const u=await q('SELECT role FROM users WHERE id=$1',[id]); if(u.rows[0]?.role==='admin')throw new Error('관리자 계정은 삭제할 수 없습니다.');} if(table==='vendors'){const r=await q('UPDATE vendors SET status=$1 WHERE id=$2 RETURNING id',['inactive',id]); if(!r.rows[0])throw new Error('업체를 찾을 수 없습니다.'); await logAdmin(req,'업체 비활성화','vendors',id,'관리자 삭제 대신 비활성화'); return;} if(table==='reviews'){const r=await q("UPDATE reviews SET status='deleted' WHERE id=$1 RETURNING id",[id]); if(!r.rows[0])throw new Error('삭제 대상을 찾을 수 없습니다.'); await logAdmin(req,'후기 삭제처리','reviews',id,'status=deleted'); return;} const r=await q(`DELETE FROM ${table} WHERE id=$1 RETURNING id`,[id]); if(!r.rows[0])throw new Error('삭제 대상을 찾을 수 없습니다.'); await logAdmin(req,'삭제',req.params.table,id,'관리자 삭제');}));

function siteBaseUrl(req){
  return (process.env.SITE_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
}
function escapeXml(s){
  return String(s||'').replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}
app.get('/favicon.svg',(req,res)=>{
  res.setHeader('Content-Type','image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=604800');
  res.send("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#ff3fb4\"/><stop offset=\"1\" stop-color=\"#10d9ff\"/></linearGradient></defs><rect width=\"128\" height=\"128\" rx=\"28\" fill=\"#080d18\"/><path d=\"M30 36h68v16H30zM30 60h48v16H30zM30 84h68v16H30z\" fill=\"url(#g)\"/></svg>");
});
app.get('/site.webmanifest',(req,res)=>{
  const base=siteBaseUrl(req);
  res.setHeader('Content-Type','application/manifest+json; charset=utf-8');
  res.send(JSON.stringify({name:'서비스 디렉토리',short_name:'서비스디렉토리',start_url:'/',scope:'/',display:'standalone',background_color:'#080d18',theme_color:'#080d18',icons:[{src:base+'/favicon.svg',sizes:'any',type:'image/svg+xml'}]}));
});
app.get('/robots.txt',(req,res)=>{
  const base=siteBaseUrl(req);
  res.type('text/plain').send("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /vendor-dashboard\nDisallow: /login\nDisallow: /join\n\nSitemap: "+base+'/sitemap.xml\n');
});
app.get('/sitemap.xml',async(req,res)=>{
  const base=siteBaseUrl(req);
  const urls=[{loc:base+'/',priority:'1.0'},{loc:base+'/inquiry',priority:'0.8'}];
  try{
    const vendors=await q("SELECT id,created_at FROM vendors WHERE status='active' ORDER BY id DESC LIMIT 1000");
    vendors.rows.forEach(v=>urls.push({loc:base+'/vendor/'+v.id,lastmod:v.created_at?new Date(v.created_at).toISOString().slice(0,10):undefined,priority:'0.7'}));
  }catch(e){}
  const items=urls.map(u=>'  <url>\n    <loc>'+escapeXml(u.loc)+'</loc>'+(u.lastmod?'\n    <lastmod>'+u.lastmod+'</lastmod>':'')+'\n    <priority>'+u.priority+'</priority>\n  </url>').join('\n');
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+items+'\n</urlset>');
});

app.get('/admin/api/performance-check',admin,async(req,res)=>{
  const started=Date.now();
  const checks=[];
  const add=(name,ok,detail='')=>checks.push({name,ok,detail});
  try{
    await q('SELECT 1');
    add('DB 응답',true,(Date.now()-started)+'ms');
  }catch(e){
    add('DB 응답',false,e.message);
  }
  add('정적 캐시',true,'/public 30일 캐시');
  add('관리자/API 캐시',true,'no-store');
  add('이미지 캐시',true,'private 1일');
  add('프로세스 메모리',true,Math.round(process.memoryUsage().rss/1024/1024)+'MB');
  res.json({ok:true,uptime:Math.round(process.uptime()),checks});
});



app.get('/admin/api/qa-admin-core',admin,async(req,res)=>{
  const checks=[];
  const add=(name,ok,detail='')=>checks.push({name,ok,detail});
  try{await q('SELECT COUNT(*) FROM users');add('회원 테이블',true,'정상');}catch(e){add('회원 테이블',false,e.message);}
  try{await q('SELECT COUNT(*) FROM vendors');add('업체 테이블',true,'정상');}catch(e){add('업체 테이블',false,e.message);}
  try{await q('SELECT COUNT(*) FROM inquiries');add('입점/문의 테이블',true,'정상');}catch(e){add('입점/문의 테이블',false,e.message);}
  try{await q('SELECT COUNT(*) FROM payment_logs');add('결제 테이블',true,'정상');}catch(e){add('결제 테이블',false,e.message);}
  try{await q('SELECT COUNT(*) FROM flags');add('신고 테이블',true,'정상');}catch(e){add('신고 테이블',false,e.message);}
  res.json({ok:checks.every(x=>x.ok),checks});
});



app.use((req,res)=>{
  res.status(404).send('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>페이지를 찾을 수 없습니다</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d18;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.box{max-width:560px;padding:32px;border:1px solid #29324f;border-radius:22px;background:#10182b;text-align:center}a{display:inline-flex;margin-top:18px;height:42px;padding:0 18px;align-items:center;border-radius:999px;background:linear-gradient(90deg,#ff3fb4,#10d9ff);color:#fff;text-decoration:none;font-weight:900}</style></head><body><div class="box"><h1>404</h1><p>요청하신 페이지를 찾을 수 없습니다.</p><a href="/">홈으로 이동</a></div></body></html>');
});
app.use((err,req,res,next)=>{
  console.error('server error',err);
  res.status(500).send('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오류가 발생했습니다</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d18;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.box{max-width:560px;padding:32px;border:1px solid #29324f;border-radius:22px;background:#10182b;text-align:center}a{display:inline-flex;margin-top:18px;height:42px;padding:0 18px;align-items:center;border-radius:999px;background:linear-gradient(90deg,#ff3fb4,#10d9ff);color:#fff;text-decoration:none;font-weight:900}</style></head><body><div class="box"><h1>500</h1><p>일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</p><a href="/">홈으로 이동</a></div></body></html>');
});

process.on('unhandledRejection',err=>{
  console.error('unhandledRejection',err);
});
process.on('uncaughtException',err=>{
  console.error('uncaughtException',err);
});
async function shutdown(signal){
  console.log(signal+' received, closing database pool');
  try{await pool.end();}catch(e){console.error('pool close failed',e);}
  process.exit(0);
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));

const port=process.env.PORT||3000;
ensureSchema()
  .then(()=>app.listen(port,()=>console.log('server on '+port)))
  .catch(e=>{
    console.error('ensureSchema failed',e);
    process.exit(1);
  });
