require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized:false } : undefined });
async function q(sql, params=[]){ return pool.query(sql, params); }
async function main(){
 await q(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, nickname TEXT NOT NULL, role TEXT DEFAULT 'user', status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS vendors(id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, region TEXT NOT NULL, phone TEXT, tags TEXT, description TEXT, business_hours TEXT, image_data TEXT, is_recommended BOOLEAN DEFAULT false, is_premium BOOLEAN DEFAULT false, status TEXT DEFAULT 'active', views INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT now())`);
 await q(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_hours TEXT`);
 await q(`CREATE TABLE IF NOT EXISTS banners(id SERIAL PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, link_url TEXT, image_data TEXT, position TEXT DEFAULT 'premium', sort_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS reviews(id SERIAL PRIMARY KEY, vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, title TEXT NOT NULL, content TEXT NOT NULL, rating INTEGER DEFAULT 5, status TEXT DEFAULT 'visible', created_at TIMESTAMP DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS events(id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, image_data TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS notices(id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, is_pinned BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT now())`);
 const adminId = process.env.ADMIN_ID || 'admin';
 const pw = process.env.ADMIN_PASSWORD || '1234';
 const hash = await bcrypt.hash(pw, 10);
 await q(`INSERT INTO users(username,password_hash,nickname,role,status) VALUES($1,$2,'관리자','admin','active') ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', status='active'`, [adminId, hash]);
 const { rows } = await q('SELECT count(*)::int c FROM vendors');
 if(!rows[0].c){
  await q(`INSERT INTO vendors(name,category,region,phone,tags,description,business_hours,is_recommended,is_premium) VALUES
  ('프리미엄 샘플업체','카페','서울','010-0000-0000','추천,프리미엄','관리자에서 이미지와 정보를 수정하세요.','10:00 ~ 24:00',true,true),
  ('추천 샘플업체','뷰티','부산','010-1111-1111','추천','추천업체 카드 예시입니다.','연중무휴',true,false),
  ('일반 샘플업체','맛집','대구','010-2222-2222','일반','일반업체 카드 예시입니다.','09:00 ~ 22:00',false,false)`);
 }
 const b = await q('SELECT count(*)::int c FROM banners');
 if(!b.rows[0].c){
  await q(`INSERT INTO banners(title,subtitle,position,sort_order) VALUES('프리미엄 배너','관리자에서 이미지 업로드 가능','premium',1),('이벤트 배너','슬라이드로 노출됩니다','premium',2)`);
 }
 console.log('DB 초기화 완료. 관리자:', adminId, '/', pw);
 await pool.end();
}
main().catch(e=>{console.error(e); process.exit(1);});