'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'public/css/style.css'),'utf8');
const viewRoot=path.join(root,'views');
const views=[];
function collect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())collect(target);else if(entry.name.endsWith('.ejs'))views.push(target);}}
collect(viewRoot);views.sort();
const pages=views.filter(file=>/<body\b/i.test(fs.readFileSync(file,'utf8')));
const partials=views.filter(file=>!pages.includes(file));
const relative=file=>path.relative(root,file).replaceAll('\\','/');

test('core Purple Admin UI design tokens are exact',()=>{
  const tokens={'ui-gradient-start':'#4c1d95','ui-gradient-middle':'#a21caf','ui-gradient-end':'#ec2f8f','ui-primary':'#63489a','ui-nav-active':'#34495e','ui-accent':'#1abc9c','ui-body':'#f5f3f8','ui-surface':'#fff','ui-text':'#111827','ui-line':'#dde1e7','ui-radius-shell':'28px'};
  for(const [name,value] of Object.entries(tokens))assert.match(css,new RegExp(`--${name}:${value.replace('#','\\#')}(?:;|})`),name);
});

test('local system font stack uses Pretendard without remote font assets',()=>{
  assert.match(css,/font-family:Pretendard,"Helvetica Neue","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",Arial,sans-serif/);
  assert.doesNotMatch(css,/@import\s+url|https?:\/\/|\.woff2?\b/i);
});

test('desktop gradient and bounded application shell contract exists',()=>{
  assert.match(css,/\.ui-theme\{[^}]*padding:42px[^}]*linear-gradient/s);
  assert.match(css,/\.ui-public-page>\.top,[^}]*\.ui-auth-page>\.auth\{max-width:1480px/);
  assert.match(css,/--ui-shadow-shell:0 28px 80px/);
});

test('light surfaces text and line palette are applied',()=>{
  assert.match(css,/--ui-surface:#fff/);assert.match(css,/--ui-text:#111827/);assert.match(css,/--ui-line:#dde1e7/);
  assert.match(css,/\.ui-public-page[^}]*background:linear-gradient/);
});

test('form controls expose hover focus and focus-visible states',()=>{
  assert.match(css,/\.ui-theme input[^}]*min-height:44px/);assert.match(css,/\.ui-theme input:focus[^}]*--ui-primary/);
  assert.match(css,/\.ui-theme :focus-visible\{outline:2px solid var\(--ui-primary\)/);
});

test('primary secondary danger and success button contracts exist',()=>{
  assert.match(css,/\.ui-theme button[^}]*background:var\(--ui-primary\)/);
  assert.match(css,/\.ui-theme \.secondary[^}]*background:#fff/);assert.match(css,/\.ui-theme \.danger[^}]*--ui-danger/);assert.match(css,/\.ui-theme \.success[^}]*--ui-accent/);
});

test('admin sidebar is light with a solid slate active item',()=>{
  assert.match(css,/\.ui-admin-page \.admin-sidebar\{[^}]*background:#f3f4f6/);
  assert.match(css,/\.ui-admin-page \.admin-sidebar a\.active\{background:var\(--ui-nav-active\);color:#fff/);
});

test('authentication page has responsive gradient split layout',()=>{
  assert.match(css,/\.ui-auth-page \.auth\{[^}]*grid-template-columns:[^}]*46%[^}]*54%/);
  assert.match(css,/\.ui-auth-page \.auth:before\{content:'서비스 디렉터리'/);
});

test('tables use white surfaces muted headers and visible row hover',()=>{
  assert.match(css,/\.ui-public-page \.board-table[^}]*background:#fff/);assert.match(css,/th\{background:#f8f9fb/);assert.match(css,/tbody tr:hover\{background:#faf7ff/);
});

test('desktop tablet and mobile breakpoints are present',()=>{
  for(const width of ['1100','800','520'])assert.match(css,new RegExp(`@media\\(max-width:${width}px\\)`));
  assert.match(css,/@media\(max-width:800px\)[\s\S]*font-size:16px/);
});

test('reduced motion stops marquee and hover translation',()=>{
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/\.premium-track,\.public-ad-banner-track\{animation:none\}/);assert.match(css,/\.card:hover,\.admin-dashboard-card:hover\{transform:none\}/);
});

test('every top-level EJS page has a scoped UI theme body class',()=>{
  assert.equal(pages.length,12);
  for(const file of pages){const source=fs.readFileSync(file,'utf8');assert.match(source,/<body\b[^>]*class="[^"]*\bui-theme\b[^"]*"/,relative(file));}
});

test('partials remain fragments without html or body elements',()=>{
  assert.equal(partials.length,6);
  for(const file of partials)assert.doesNotMatch(fs.readFileSync(file,'utf8'),/<\/?(?:html|body)\b/i,relative(file));
});

test('UI sources add no framework CDN font OAuth or sample branding',()=>{
  const source=[css,...views.map(file=>fs.readFileSync(file,'utf8'))].join('\n');
  assert.doesNotMatch(source,/tailwind|ant\s*design|antd|react(?:\.js)?|lucide|framer\s*motion|cdn\.|google로 로그인|github로 로그인|purple admin ui logo/i);
});

test('EJS functional contracts match HEAD exactly apart from body class',()=>{
  const attributes=['method','action','name','id','href','src','onclick','onsubmit'];
  const values=(source,name)=>[...source.matchAll(new RegExp(`\\b${name}\\s*=\\s*(["'])[^"']*\\1`,'gi'))].map(match=>match[0]);
  const dataValues=source=>[...source.matchAll(/\bdata-[\w-]+\s*=\s*(["'])[^"']*\1/gi)].map(match=>match[0]);
  const tags=source=>[...source.matchAll(/<%[\s\S]*?%>/g)].map(match=>match[0].replace(/\r\n/g,'\n'));
  const scripts=source=>[...source.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(match=>crypto.createHash('sha256').update(match[0].replace(/\r\n/g,'\n')).digest('hex'));
  for(const file of views){const name=relative(file),before=execFileSync('git',['show',`HEAD:${name}`],{cwd:root,encoding:'utf8'}),after=fs.readFileSync(file,'utf8');assert.deepEqual(tags(after),tags(before),`${name}: EJS tags`);for(const attribute of attributes)assert.deepEqual(values(after,attribute),values(before,attribute),`${name}: ${attribute}`);assert.deepEqual(dataValues(after),dataValues(before),`${name}: data-*`);assert.deepEqual(scripts(after),scripts(before),`${name}: scripts`);}
});

test('package lock remains byte-identical and no UI dependency was added',()=>{
  const before=execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root});const after=fs.readFileSync(path.join(root,'package-lock.json'));assert.deepEqual(after,before);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));assert.equal(manifest.scripts['test:ui-theme'],'node --test tests/ui-theme.test.js');
});

test('light top header forces branded text dark above legacy important rules',()=>{
  assert.match(css,/\.ui-theme>\.top \.site-brand-center,\.ui-theme>\.top \.site-brand-center span\{color:var\(--ui-text\)!important;text-shadow:none!important}/);
  assert.ok(css.indexOf('.ui-theme>.top .site-brand-center')>css.indexOf('.top .site-brand-center span{color:#fff!important'));
});

test('vendor dashboard source contains the actual structural classes',()=>{
  const source=fs.readFileSync(path.join(viewRoot,'vendor-dashboard.ejs'),'utf8');
  for(const value of ['<header','class="wrap"','class="layout"','class="side"','menu-btn','class="box"','class="card"','class="form"'])assert.match(source,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),value);
});

test('vendor theme directly targets its actual header main sidebar and menu',()=>{
  assert.match(css,/\.ui-vendor-dashboard-page>header:not\(\.top\)\{[^}]*background:#fff!important[^}]*color:var\(--ui-text\)!important/);
  assert.match(css,/\.ui-vendor-dashboard-page>main\.wrap\{[^}]*background:var\(--ui-body\)/);
  assert.match(css,/\.ui-vendor-dashboard-page \.side\{[^}]*background:#f3f4f6/);
  assert.match(css,/\.ui-vendor-dashboard-page \.menu-btn\.active[^}]*background:var\(--ui-nav-active\)/);
});

test('obsolete vendor shell selectors are absent from theme CSS',()=>{
  assert.doesNotMatch(css,/\.vendor-shell|\.vendor-layout|\.dashboard-wrap/);
});

test('vendor cards boxes and real form controls use light surfaces',()=>{
  assert.match(css,/\.ui-vendor-dashboard-page \.box,[^}]*\.vendor-stat-card\{background:#fff;color:var\(--ui-text\)/);
  for(const selector of ['.form input','.form select','.form textarea','.addr input'])assert.ok(css.includes(`.ui-vendor-dashboard-page ${selector}`),selector);
});

test('vendor home important dark card is defeated by a scoped important light rule',()=>{
  assert.match(css,/\.ui-vendor-dashboard-page #panel-home>\.box:first-child>\.grid>\.card\{background:#fff!important;color:var\(--ui-text\)!important/);
});

test('vendor ancillary surfaces target every actual dark component',()=>{
  for(const selector of ['.paybox','.file-guide','.image-spec-grid span','.image-current-preview','.image-current-preview .preview-frame','.banner-preview','.vendor-status-item','.vendor-empty','.vendor-insight'])assert.ok(css.includes(`.ui-vendor-dashboard-page ${selector}`),selector);
});

test('admin dark component inventory receives scoped light surfaces',()=>{
  for(const selector of ['.admin-home-box','.admin-pending-card','.admin-today-card','.admin-summary-card','.request-summary-card','.revenue-card','.vendor-summary-card','.vendor-request-summary-card','.data-management-card','.settings-box','.admin-account-summary>div','.board-operation-tabs','#adCenter .ad-payment-summary-grid>button','.vendor-form-box','.integrated-card','.admin-dashboard-card','.admin-dashboard-recent'])assert.ok(css.includes(`.ui-admin-page ${selector}`),selector);
});

test('all real admin modal overlays and cards have light contracts',()=>{
  for(const selector of ['.vendor-modal','.vendor-request-review-modal','.admin-account-modal','.admin-password-result-modal'])assert.ok(css.includes(`.ui-admin-page ${selector}`),selector);
  for(const selector of ['.vendor-modal-box','.vendor-request-review-modal-card','.admin-account-modal-card','.admin-password-result-card'])assert.ok(css.includes(`.ui-admin-page ${selector}`),selector);
  assert.match(css,/\.ui-admin-page \.vendor-modal-box,[^}]*background:#fff;color:var\(--ui-text\)/);
});

test('admin buttons retain semantic primary success danger and secondary states',()=>{
  assert.match(css,/\.ui-admin-page \.admin-content button\{background:var\(--ui-primary\)/);
  assert.match(css,/\.ui-admin-page \.admin-content \.approve-btn[^}]*background:var\(--ui-accent\)/);
  assert.match(css,/\.ui-admin-page \.admin-content \.reject-btn[^}]*color:var\(--ui-danger\)/);
  assert.match(css,/\.ui-admin-page \.admin-content \.cancel-edit[^}]*background:#fff!important/);
});

test('date inputs explicitly use light color scheme and normal picker icon',()=>{
  assert.match(css,/\.ui-admin-page \.admin-content input\[type=date\],\.ui-vendor-dashboard-page input\[type=date\]\{color-scheme:light}/);
  assert.match(css,/calendar-picker-indicator[^}]*filter:none!important/);
});

test('notification controls panel items and filters use light surfaces',()=>{
  for(const selector of ['.notification-float-btn','.notification-panel','.notification-panel>header','.notification-item','.notification-item.unread','.notification-item b','.notification-item p','.notification-filter-row button','.notification-filter-row button.active','.notification-empty'])assert.ok(css.includes(`.ui-theme ${selector}`),selector);
  assert.match(css,/\.ui-theme \.notification-panel\{background:#fff;color:var\(--ui-text\)/);
});

test('fixed viewport layers are excluded from application shell width',()=>{
  assert.match(css,/\.ui-theme>\.public-menu-toggle,[^}]*\.ui-theme>\.modal-overlay\{max-width:none;margin:0}/);
  assert.doesNotMatch(css,/\.ui-theme>\*\{max-width:1480px/);
});

test('admin and vendor active menu colors are solid rather than gradients',()=>{
  const admin=css.match(/\.ui-admin-page \.admin-sidebar a\.active\{([^}]*)}/)?.[1]||'';
  const vendor=css.match(/\.ui-vendor-dashboard-page \.menu-btn\.active[^\{]*\{([^}]*)}/)?.[1]||'';
  assert.match(admin,/background:var\(--ui-nav-active\)/);assert.doesNotMatch(admin,/gradient/);
  assert.match(vendor,/background:var\(--ui-nav-active\)/);assert.doesNotMatch(vendor,/gradient/);
});

test('vendor application shell connects header and main without vertical gaps',()=>{
  const block=css.match(/\.ui-vendor-dashboard-page>main\.wrap\{([^}]*)margin-top:0!important;([^}]*)margin-bottom:0!important([^}]*)}/)?.[0]||'';
  assert.match(block,/margin-top:0!important/);assert.match(block,/margin-bottom:0!important/);
});

test('vendor form and action buttons end with important solid primary styles',()=>{
  const block=css.match(/\.ui-vendor-dashboard-page \.form button,\.ui-vendor-dashboard-page \.actions button\{([^}]*)}/)?.[1]||'';
  assert.match(block,/background:var\(--ui-primary\)!important/);assert.match(block,/border:1px solid var\(--ui-primary\)!important/);assert.match(block,/color:#fff!important/);assert.doesNotMatch(block,/gradient/);
});

test('vendor address action is an important light secondary button',()=>{
  const block=css.match(/\.ui-vendor-dashboard-page \.addr button\{([^}]*)}/)?.[1]||'';
  assert.match(block,/background:#fff!important/);assert.match(block,/color:var\(--ui-text-soft\)!important/);assert.match(block,/border:1px solid var\(--ui-line-strong\)!important/);assert.doesNotMatch(block,/gradient/);
});

test('all six vendor status selectors receive pastel backgrounds',()=>{
  const contracts={'.status-waiting':'#fff7df','.vendor-status-unpaid':'#eef0f3','.vendor-status-waiting':'#fff7df','.vendor-status-approved':'#e8f8f1','.vendor-status-rejected':'#fff1f0','.vendor-status-cancelled':'#fff1f0'};
  for(const [selector,color] of Object.entries(contracts)){const index=css.lastIndexOf(`.ui-vendor-dashboard-page ${selector}`);assert.notEqual(index,-1,selector);assert.match(css.slice(index,index+220),new RegExp(`background:${color.replace('#','\\#')}`),selector);}
});

test('admin pending labels and statistics have dark-card-safe colors',()=>{
  const label=css.match(/\.ui-admin-page \.admin-pending-card b,[^}]*\{([^}]*)}/)?.[1]||'';
  const strong=css.match(/\.ui-admin-page \.admin-pending-card strong,[^}]*\{([^}]*)}/)?.[1]||'';
  assert.match(label,/color:var\(--ui-text-soft\)/);assert.match(strong,/color:var\(--ui-primary\)/);
});

test('data scope lists and their children use dark readable text',()=>{
  const block=css.match(/\.ui-admin-page \.data-scope-list,\.ui-admin-page \.data-scope-list li\{([^}]*)}/)?.[1]||'';
  assert.match(block,/color:var\(--ui-text-soft\)/);
});

test('board operation tabs end with important white and solid active blocks',()=>{
  const normal=css.match(/\.ui-admin-page \.admin-content \.board-operation-tabs button\{([^}]*)}/)?.[1]||'';
  const active=css.match(/\.ui-admin-page \.admin-content \.board-operation-tabs button\.active\{([^}]*)}/)?.[1]||'';
  assert.match(normal,/background:#fff!important/);assert.match(normal,/color:var\(--ui-text-soft\)!important/);assert.match(normal,/border:1px solid var\(--ui-line-strong\)!important/);
  assert.match(active,/background:var\(--ui-nav-active\)!important/);assert.match(active,/color:#fff!important/);assert.doesNotMatch(active,/gradient/);
});

test('admin sub-filter settings and payment active states contain no gradients',()=>{
  const block=css.match(/\.ui-admin-page \.admin-content \.admin-sub-filter button\.on,[^}]*ad-payment-summary-grid>button\.active\{([^}]*)}/)?.[1]||'';
  assert.match(block,/background:var\(--ui-nav-active\)!important/);assert.match(block,/border-color:var\(--ui-nav-active\)!important/);assert.doesNotMatch(block,/gradient/);
});

test('important admin action buttons preserve semantic final colors',()=>{
  const approve=css.match(/\.ui-admin-page \.admin-content \.approve-btn,\.ui-admin-page \.admin-content \.done-btn\{([^}]*)}/)?.[1]||'';
  const banner=css.match(/\.ui-admin-page \.admin-content \.banner-btn\{([^}]*)}/)?.[1]||'';
  const reject=css.match(/\.ui-admin-page \.admin-content \.reject-btn,[^}]*danger-box button\{([^}]*)}/)?.[1]||'';
  assert.match(approve,/background:var\(--ui-accent\)!important/);assert.match(banner,/background:var\(--ui-primary\)!important/);assert.match(reject,/background:var\(--ui-danger\)!important/);
});

test('date picker cancel and close controls end as important secondary buttons',()=>{
  const block=css.match(/\.ui-admin-page \.admin-content \.admin-date-pick-btn,[^}]*\[class\*=close\]\{([^}]*)}/)?.[1]||'';
  assert.match(block,/background:#fff!important/);assert.match(block,/border-color:var\(--ui-line-strong\)!important/);assert.match(block,/color:var\(--ui-text-soft\)!important/);assert.doesNotMatch(block,/gradient/);
});

test('ordinary login markup exposes the real authentication structure',()=>{
  const source=fs.readFileSync(path.join(viewRoot,'login.ejs'),'utf8');
  for(const name of ['auth-wrap','auth-card','auth-form'])assert.match(source,new RegExp(`class="[^"]*\\b${name}\\b`),name);
});

test('ordinary authentication wrapper owns the responsive split layout',()=>{
  const block=css.match(/\.ui-auth-page \.auth-wrap\{([^}]*)}/)?.[1]||'';
  assert.match(block,/display:grid/);assert.match(block,/grid-template-columns:minmax\(300px,46%\) minmax\(360px,54%\)/);assert.match(block,/width:min\(1080px,100%\)/);assert.match(block,/min-height:620px/);
  assert.match(css,/@media\(max-width:800px\)\{\.ui-auth-page \.auth-wrap\{[^}]*grid-template-columns:1fr/);
});

test('ordinary auth card controls and action end in important light contracts',()=>{
  assert.match(css,/\.ui-auth-page \.auth-wrap>\.auth-card\{[^}]*background:#fff!important[^}]*color:var\(--ui-text\)!important[^}]*box-shadow:none!important/);
  assert.match(css,/\.ui-auth-page \.auth-wrap \.auth-form input\{[^}]*background:#fff!important[^}]*color:var\(--ui-text\)!important/);
  const button=css.match(/\.ui-auth-page \.auth-wrap \.auth-form button\{([^}]*)}/)?.[1]||'';assert.match(button,/background:var\(--ui-primary\)!important/);assert.doesNotMatch(button,/gradient/);
});

test('ordinary auth selectors outrank the later dark auth polish selectors',()=>{
  const late=fs.readFileSync(path.join(root,'public/css/auth-polish.css'),'utf8');assert.match(late,/\.auth-card\{[^}]*gradient[^}]*!important/);assert.match(late,/\.auth-form input\{[^}]*background:#080d18!important/);
  assert.match(css,/\.ui-auth-page \.auth-wrap>\.auth-card\{[^}]*background:#fff!important/);assert.match(css,/\.ui-auth-page \.auth-wrap \.auth-form input\{[^}]*background:#fff!important/);
});

test('public inquiry and vendor application forms have scoped important light controls',()=>{
  assert.match(css,/\.ui-form-page \.box\{[^}]*background:#fff!important[^}]*color:var\(--ui-text\)!important/);
  assert.match(css,/\.ui-form-page \.form input,[^}]*textarea\{[^}]*background:#fff!important[^}]*color:var\(--ui-text\)!important/);
  const button=css.match(/\.ui-form-page \.form button\{([^}]*)}/)?.[1]||'';assert.match(button,/background:var\(--ui-primary\)!important/);assert.doesNotMatch(button,/gradient/);
});

test('application guidance preview success and error surfaces are light',()=>{
  for(const selector of ['.inquiry-image-field','.image-guide','.image-guide-grid span','.apply-preview-row'])assert.ok(css.includes(`.ui-form-page ${selector}`),selector);
  assert.match(css,/\.ui-form-page \.done,[^}]*\.done-box\{[^}]*background:#e8f8f1!important/);assert.match(css,/\.ui-form-page \.err\{[^}]*background:#fff1f0!important/);
});

test('mypage cards guidance and table retain scoped light readability',()=>{
  const scope='body.ui-public-page.ui-detail-page:has(.apply-hero)';
  for(const selector of [' .box',' .apply-hero p',' .apply-guide span',' table',' th',' td',' td a',' td button'])assert.ok(css.includes(scope+selector),selector);
  assert.match(css,/body\.ui-public-page\.ui-detail-page:has\(\.apply-hero\) th\{[^}]*background:#f8f9fb!important[^}]*color:var\(--ui-text\)!important/);
});

test('vendor detail hero boxes text and form controls defeat dark polish',()=>{
  assert.match(css,/\.ui-public-page\.ui-detail-page \.hero-detail\{[^}]*background:#fff!important[^}]*border-color:var\(--ui-line\)!important/);
  assert.match(css,/\.ui-public-page\.ui-detail-page \.info h1\{color:var\(--ui-text\)!important/);assert.match(css,/\.ui-public-page\.ui-detail-page \.info p\{color:var\(--ui-muted\)!important/);
  assert.match(css,/\.ui-public-page\.ui-detail-page \.box form input,[^}]*textarea\{[^}]*background:#fff!important[^}]*color:var\(--ui-text\)!important/);
});

test('public vendor modal panel directly ends in important white',()=>{
  const block=css.match(/\.ui-public-page #vendorModal>div:nth-child\(2\)\{([^}]*)}/)?.[1]||'';
  assert.match(block,/background:#fff!important/);assert.match(block,/color:var\(--ui-text\)!important/);assert.match(block,/border-color:var\(--ui-line\)!important/);
});

test('public vendor modal boxes and child text all have light contracts',()=>{
  assert.match(css,/\.ui-public-page #vendorModal \.modal-intro-box,[^}]*\.modal-desc-box\{[^}]*background:var\(--ui-surface-soft\)!important[^}]*color:var\(--ui-text\)!important/);
  for(const selector of ['.modal-vendor-info h2','.modal-vendor-info p','.modal-intro-box .vendor-desc','.modal-info-box b','.modal-info-row span','.modal-section h3'])assert.ok(css.includes(`.ui-public-page #vendorModal ${selector}`),selector);
});

test('all five late public polish styles have dark rules and scoped overrides',()=>{
  const files=['auth-polish.css','inquiry-polish.css','mypage-polish.css','vendor-detail-polish.css','vendor-popup-layout-v50.css'];
  for(const name of files){const source=fs.readFileSync(path.join(root,'public/css',name),'utf8');assert.match(source,/(?:#080d18|#101525|linear-gradient)[^}]*!important/s,name);}
  for(const scope of ['.ui-auth-page .auth-wrap','.ui-form-page .box','body.ui-public-page.ui-detail-page:has(.apply-hero)','.ui-public-page.ui-detail-page .hero-detail','.ui-public-page #vendorModal>div:nth-child(2)'])assert.ok(css.includes(scope),scope);
});

test('the public vendor modal partial is included by the exact top-level page set',()=>{
  const names=pages.filter(file=>/include\(\s*['"]partials\/vendor-modal['"]\s*\)/.test(fs.readFileSync(file,'utf8'))).map(file=>path.basename(file));
  assert.deepEqual(names.sort(),['board-list.ejs','board-post.ejs','board-write.ejs','index.ejs','inquiry.ejs']);
});

test('every page containing the public vendor modal has the public body scope',()=>{
  for(const name of ['index.ejs','board-list.ejs','board-post.ejs','board-write.ejs','inquiry.ejs']){const source=fs.readFileSync(path.join(viewRoot,name),'utf8');assert.match(source,/<body\b[^>]*class="[^"]*\bui-public-page\b/,name);}
});

test('vendor modal theme uses the public scope everywhere and never the home-only scope',()=>{
  const modalTheme=css.slice(css.indexOf('/* Phase 9 UI theme v4:'));
  assert.match(modalTheme,/\.ui-public-page #vendorModal>div:first-child/);assert.match(modalTheme,/\.ui-public-page #vendorModal \.review-write-btn/);assert.doesNotMatch(modalTheme,/\.ui-home-page #vendorModal/);
});

test('public vendor modal review children have explicit readable colors',()=>{
  assert.match(css,/\.ui-public-page #vendorModal \.review b\{color:var\(--ui-text\)!important}/);
  assert.match(css,/\.ui-public-page #vendorModal \.review p\{color:var\(--ui-text-soft\)!important}/);
  assert.match(css,/\.ui-public-page #vendorModal \.review small,\.ui-public-page #vendorModal \.empty-text\{color:var\(--ui-muted\)!important}/);
  assert.match(css,/\.ui-public-page #vendorModal \.review\{border-color:var\(--ui-line\)!important}/);
});

test('form helper children directly override legacy light text colors',()=>{
  assert.match(css,/\.ui-form-page \.inquiry-image-field small\{color:var\(--ui-muted\)!important;line-height:1\.5}/);
  assert.match(css,/\.ui-form-page \.apply-preview-row p\{color:var\(--ui-text-soft\)!important}/);
});

test('native checkbox and radio controls reset text-input dimensions',()=>{
  assert.match(css,/\.ui-theme input[^}]*min-height:44px/);
  const block=css.match(/\.ui-theme input\[type="checkbox"\],\.ui-theme input\[type="radio"\]\{([^}]*)}/)?.[1]||'';
  for(const declaration of ['width:18px!important','height:18px!important','min-width:18px!important','min-height:18px!important','padding:0!important','accent-color:var(--ui-primary)'])assert.ok(block.includes(declaration),declaration);
});

test('choice-control reset follows generic inputs without hiding native interaction',()=>{
  const genericIndex=css.indexOf('.ui-theme input,.ui-theme select,.ui-theme textarea{');
  const selector='.ui-theme input[type="checkbox"],.ui-theme input[type="radio"]{';
  const resetIndex=css.lastIndexOf(selector);const block=css.slice(resetIndex+selector.length,css.indexOf('}',resetIndex));
  assert.notEqual(genericIndex,-1);assert.ok(resetIndex>genericIndex);
  assert.doesNotMatch(block,/(?:appearance\s*:\s*none|display\s*:\s*none|opacity\s*:\s*0(?:\D|$)|pointer-events\s*:\s*none)/i);
});
