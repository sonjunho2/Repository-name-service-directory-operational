'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'public/css/style.css'),'utf8');
const homeCardCss=fs.readFileSync(path.join(root,'public/css/home-card-layout-v48.css'),'utf8');
const mobileBrandingCss=fs.readFileSync(path.join(root,'public/css/mobile-branding-v55.css'),'utf8');
const viewRoot=path.join(root,'views');
const views=[];
function collect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())collect(target);else if(entry.name.endsWith('.ejs'))views.push(target);}}
collect(viewRoot);views.sort();
const pages=views.filter(file=>/<body\b/i.test(fs.readFileSync(file,'utf8')));
const partials=views.filter(file=>!pages.includes(file));
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const finalBlock=selector=>{const index=css.lastIndexOf(`${selector}{`);assert.notEqual(index,-1,selector);return css.slice(index+selector.length+1,css.indexOf('}',index));};
const phase9HomeCss=css.slice(css.indexOf('/* Phase 9-UI-2:'));
const desktopHomeCss=phase9HomeCss.slice(0,phase9HomeCss.indexOf('@media(max-width:760px)'));
const desktopBlock=selector=>{const index=desktopHomeCss.indexOf(`${selector}{`);assert.notEqual(index,-1,selector);return desktopHomeCss.slice(index+selector.length+1,desktopHomeCss.indexOf('}',index));};
const mobileHomeCss=phase9HomeCss.slice(phase9HomeCss.indexOf('@media(max-width:760px)'));
const mobileBlock=selector=>{const index=mobileHomeCss.indexOf(`${selector}{`);assert.notEqual(index,-1,selector);return mobileHomeCss.slice(index+selector.length+1,mobileHomeCss.indexOf('}',index));};
const specificity=selector=>[(selector.match(/#[\w-]+/g)||[]).length,(selector.match(/\.[\w-]+/g)||[]).length,(selector.match(/(?:^|\s|>)[a-z][\w-]*/gi)||[]).length];
const phase9Ui4Css=css.slice(css.indexOf('/* Phase 9-UI-4:'));
const phase9Ui4DesktopCss=phase9Ui4Css.slice(0,phase9Ui4Css.indexOf('@media(max-width:760px)'));
const phase9Ui4DesktopBlock=selector=>{const index=phase9Ui4DesktopCss.indexOf(`${selector}{`);assert.notEqual(index,-1,selector);return phase9Ui4DesktopCss.slice(index+selector.length+1,phase9Ui4DesktopCss.indexOf('}',index));};

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

test('package lock remains content-identical across platform line endings and no UI dependency was added',()=>{
  const normalizeEol=value=>value.replace(/\r\n?/g,'\n');
  const before=execFileSync('git',['show','HEAD:package-lock.json'],{cwd:root,encoding:'utf8'});const after=fs.readFileSync(path.join(root,'package-lock.json'),'utf8');assert.equal(normalizeEol(after),normalizeEol(before));assert.deepEqual(JSON.parse(after),JSON.parse(before));
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
  assert.match(finalBlock('.ui-theme input[type="checkbox"]'),/border-radius:4px/);assert.match(finalBlock('.ui-theme input[type="radio"]'),/border-radius:50%/);
  const phase=css.slice(css.indexOf('/* Phase 9-UI-4:'));for(const selector of ['body.ui-public-page:not(.ui-home-page) input:not([type="checkbox"]):not([type="radio"]),','.ui-admin-page .admin-content input:not([type="checkbox"]):not([type="radio"]),','body.ui-public-page:not(.ui-home-page) input:not([type="checkbox"]):not([type="radio"]):focus,','.ui-admin-page .admin-content input:not([type="checkbox"]):not([type="radio"]):focus,'])assert.ok(phase.includes(selector),selector);
  assert.doesNotMatch(phase,/body\.ui-public-page:not\(\.ui-home-page\) input,|\.ui-admin-page \.admin-content input,/);assert.doesNotMatch(phase,/input\[type="radio"\][^{]*\{[^}]*border-radius:4px!important/);
});

test('choice-control reset follows generic inputs without hiding native interaction',()=>{
  const genericIndex=css.indexOf('.ui-theme input,.ui-theme select,.ui-theme textarea{');
  const selector='.ui-theme input[type="checkbox"],.ui-theme input[type="radio"]{';
  const resetIndex=css.lastIndexOf(selector);const block=css.slice(resetIndex+selector.length,css.indexOf('}',resetIndex));
  assert.notEqual(genericIndex,-1);assert.ok(resetIndex>genericIndex);
  assert.doesNotMatch(block,/(?:appearance\s*:\s*none|display\s*:\s*none|opacity\s*:\s*0(?:\D|$)|pointer-events\s*:\s*none)/i);
});

test('home index owns the dedicated home page scope',()=>{
  assert.match(fs.readFileSync(path.join(viewRoot,'index.ejs'),'utf8'),/<body\b[^>]*class="[^"]*\bui-home-page\b/);
});

test('home body ends with an important neutral non-gradient background',()=>{
  for(const block of [desktopBlock('.ui-home-page'),mobileBlock('.ui-home-page')]){assert.match(block,/background:#f4f5f7!important/);assert.doesNotMatch(block,/(?:linear|radial)-gradient/);}
});

test('home header joins the neutral canvas without radius or shadow',()=>{
  const block=finalBlock('.ui-home-page > .top');assert.match(block,/background:#f4f5f7!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);
});

test('home brand title ends as opaque dark text without text shadow',()=>{
  const block=finalBlock('.ui-home-page > .top .site-brand-center span');assert.match(block,/color:var\(--ui-text\)!important/);assert.match(block,/text-shadow:none!important/);assert.match(block,/opacity:1!important/);
});

test('home search shells are square light and shadowless',()=>{
  for(const selector of ['.ui-home-page > .main-hero','.ui-home-page .hero-filter'])for(const block of [desktopBlock(selector),mobileBlock(selector)]){assert.match(block,/background:(?:transparent|#f4f5f7)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);assert.doesNotMatch(block,/#(?:070b15|080d18|101525)|gradient/);}
});

test('home advertising cards use one neutral square contract',()=>{
  const block=finalBlock('.ui-home-page .card.vendor-open');assert.match(block,/background:#fff!important/);assert.match(block,/border:1px solid var\(--ui-line-strong\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);
});

test('home premium recommend and general card variants remove decorative tiers',()=>{
  const block=finalBlock('.ui-home-page .card.vendor-open.premium,.ui-home-page .card.vendor-open.recommend,.ui-home-page .card.vendor-open.normal-card');assert.match(block,/background:#fff!important/);assert.match(block,/border:1px solid var\(--ui-line-strong\)!important/);assert.match(block,/border-radius:0!important/);assert.doesNotMatch(block,/(?:gold|cyan|gradient)/i);
});

test('home advertising thumbnails end with square corners',()=>{
  const block=finalBlock('.ui-home-page .card.vendor-open .thumb,.ui-home-page .card.vendor-open .thumb.small');assert.match(block,/border-radius:0!important/);
});

test('home side boxes use a square neutral surface',()=>{
  const block=finalBlock('.ui-home-page .side-box');assert.match(block,/background:#fff!important/);assert.match(block,/border:1px solid var\(--ui-line\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);
});

test('home advertising hover cannot float or cast a shadow',()=>{
  const block=finalBlock('.ui-home-page .card.vendor-open:hover');assert.match(block,/transform:none!important/);assert.match(block,/box-shadow:none!important/);assert.doesNotMatch(block,/translateY/);
});

test('premium slider markup includes vendor-linked and direct-admin card classes',()=>{
  const source=fs.readFileSync(path.join(viewRoot,'index.ejs'),'utf8');assert.match(source,/'vendor-open premium'/);assert.match(source,/'premium banner-direct-open'/);
});

test('direct-admin premium banners end with the neutral square card contract',()=>{
  const selector='.ui-home-page .premium-row-slider.unified-premium-slider .card.vendor-open,.ui-home-page .premium-row-slider.unified-premium-slider .card.premium,.ui-home-page .premium-row-slider.unified-premium-slider .card.banner-direct-open';
  const block=finalBlock(selector);assert.match(block,/background:#fff!important/);assert.match(block,/border:1px solid var\(--ui-line-strong\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);assert.doesNotMatch(block,/(?:gradient|gold|cyan)/i);
});

test('direct-banner radius override outranks the later home card stylesheet',()=>{
  const later='.premium-row-slider.unified-premium-slider .card.premium';const direct='.ui-home-page .premium-row-slider.unified-premium-slider .card.banner-direct-open';
  assert.match(homeCardCss,/\.premium-row-slider\.unified-premium-slider \.card\.premium\{[^}]*border-radius:var\(--home-card-radius\)!important/s);
  assert.ok(specificity(direct)[1]>specificity(later)[1],`${direct} must outrank ${later}`);assert.match(css,new RegExp(direct.replaceAll('.','\\.')+'[^\\{]*\\{[^}]*border-radius:0!important'));
});

test('premium slider hover thumbnails and badges keep the flat contract',()=>{
  const hover=finalBlock('.ui-home-page .premium-row-slider.unified-premium-slider .card.vendor-open:hover,.ui-home-page .premium-row-slider.unified-premium-slider .card.premium:hover,.ui-home-page .premium-row-slider.unified-premium-slider .card.banner-direct-open:hover');assert.match(hover,/transform:none!important/);assert.match(hover,/box-shadow:none!important/);
  assert.match(finalBlock('.ui-home-page .premium-row-slider.unified-premium-slider .card.vendor-open .thumb,.ui-home-page .premium-row-slider.unified-premium-slider .card.premium .thumb,.ui-home-page .premium-row-slider.unified-premium-slider .card.banner-direct-open .thumb'),/border-radius:0!important/);
  assert.match(finalBlock('.ui-home-page .premium-row-slider.unified-premium-slider .card.vendor-open .ad-card-meta em,.ui-home-page .premium-row-slider.unified-premium-slider .card.premium .ad-card-meta em,.ui-home-page .premium-row-slider.unified-premium-slider .card.banner-direct-open .ad-card-meta em'),/border-radius:4px!important/);
});

test('public menu partial retains its accessibility and interaction hooks',()=>{
  const source=fs.readFileSync(path.join(viewRoot,'partials/public-mobile-menu.ejs'),'utf8');
  for(const value of ['public-menu-toggle','public-side-menu','data-public-menu-open','data-public-menu-close','aria-controls','aria-expanded','aria-hidden','inert'])assert.match(source,new RegExp(value),value);
});

test('public menu closed state enters from the right edge',()=>{
  const block=finalBlock('.ui-public-page > .public-side-menu');assert.match(block,/left:auto!important/);assert.match(block,/right:0!important/);assert.match(block,/transform:translateX\(100%\)!important/);assert.match(block,/border-left:1px solid var\(--ui-line\)!important/);assert.match(block,/border-right:0!important/);assert.match(block,/box-shadow:none!important/);
});

test('public menu open state rests at zero without left-drawer rules',()=>{
  const block=finalBlock('.ui-public-page > .public-side-menu.open');assert.match(block,/transform:translateX\(0\)!important/);assert.match(block,/box-shadow:-18px 0 50px rgba\(0,0,0,\.28\)!important/);assert.doesNotMatch(block,/box-shadow:none|translateX\(-100%\)|left:0/);
});

test('premium showcase starts with the slider and retains premium cards',()=>{
  const source=fs.readFileSync(path.join(viewRoot,'index.ejs'),'utf8');const section=source.match(/<section class="premium-showcase">([\s\S]*?)<\/section>/)[1];
  assert.doesNotMatch(section,/showcase-title|<h2>프리미엄<\/h2>/);assert.match(section,/^\s*<div class="premium-row-slider unified-premium-slider">/);assert.match(section,/<em>PREMIUM<\/em>/);
});

test('premium showcase removes only title spacing from the final CSS',()=>{
  const showcase=finalBlock('.ui-home-page .premium-showcase');const slider=finalBlock('.ui-home-page .premium-showcase > .premium-row-slider');
  assert.match(showcase,/margin-top:0!important/);assert.match(showcase,/padding-top:0!important/);assert.match(slider,/margin-top:0!important/);assert.doesNotMatch(`${showcase}${slider}`,/(?:height|animation)\s*:/);
});

test('home vendor headings use compact desktop and mobile sizes with stronger specificity',()=>{
  const selector='.ui-home-page .content-area > .section-title h2';const ui3=css.slice(css.indexOf('/* Phase 9-UI-3:'));const mediaIndex=ui3.indexOf('@media(max-width:760px)');const desktop=ui3.slice(0,mediaIndex);const mobile=ui3.slice(mediaIndex);const index=fs.readFileSync(path.join(viewRoot,'index.ejs'),'utf8');
  assert.match(desktop,new RegExp(selector.replaceAll('.','\\.')+'\\{[^}]*font-size:22px!important[^}]*line-height:1\\.25!important'));assert.match(mobile,new RegExp(selector.replaceAll('.','\\.')+'\\{[^}]*font-size:20px!important[^}]*line-height:1\\.25!important'));assert.match(index,/<h2>추천업체<\/h2>/);assert.match(index,/<h2>일반업체<\/h2>/);assert.ok(specificity(selector)[1]>specificity('.section-title h2')[1]);assert.match(mobileBrandingCss,/\.section-title h2\s*\{[^}]*font-size:(?:28|26)px!important/s);
});

test('non-home public body ends on a neutral non-gradient canvas',()=>{
  const block=phase9Ui4DesktopBlock('body.ui-public-page:not(.ui-home-page)');assert.match(block,/background:#f4f5f7!important/);assert.match(block,/padding:24px 0 48px!important/);assert.match(block,/overflow-x:hidden!important/);assert.doesNotMatch(block,/(?:linear|radial)-gradient/);
});

test('non-home public header is flat with dark branding',()=>{
  const header=finalBlock('body.ui-public-page:not(.ui-home-page) > .top');const brand=finalBlock('body.ui-public-page:not(.ui-home-page) > .top .site-brand-center,body.ui-public-page:not(.ui-home-page) > .top .site-brand-center span');assert.match(header,/background:#f4f5f7!important/);assert.match(header,/border-radius:0!important/);assert.match(header,/box-shadow:none!important/);assert.match(header,/border-bottom:1px solid var\(--ui-line\)!important/);assert.match(brand,/color:var\(--ui-text\)!important/);assert.match(brand,/text-shadow:none!important/);
});

test('non-home public outer wrappers stay bounded but lose card chrome',()=>{
  const selector='body.ui-public-page:not(.ui-home-page) > .board-wrap,body.ui-public-page:not(.ui-home-page) > .detail,body.ui-public-page:not(.ui-home-page) > .wrap,body.ui-public-page:not(.ui-home-page) > .layout';const block=finalBlock(selector);assert.match(block,/background:#f4f5f7!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);assert.doesNotMatch(block,/max-width:none/);assert.match(css,/\.board-wrap\{width:min\(1180px,calc\(100% - 32px\)\)/);
});

test('public board top banner is a white square non-gradient surface',()=>{
  const block=finalBlock('body.ui-public-page:not(.ui-home-page) .board-top-banner');assert.match(block,/background:#fff!important/);assert.match(block,/border:1px solid var\(--ui-line\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);assert.doesNotMatch(block,/(?:linear|radial)-gradient/);
});

test('public cards posts comments and forms share the final flat contract',()=>{
  const selector='body.ui-public-page:not(.ui-home-page) .board-top-banner,body.ui-public-page:not(.ui-home-page) .board-category-card,body.ui-public-page:not(.ui-home-page) .board-gallery-card,body.ui-public-page:not(.ui-home-page) .board-webzine-item,body.ui-public-page:not(.ui-home-page) .faq-item,body.ui-public-page:not(.ui-home-page) .board-table-wrap,body.ui-public-page:not(.ui-home-page) .board-post-view,body.ui-public-page:not(.ui-home-page) .board-comments,body.ui-public-page:not(.ui-home-page) .board-form,body.ui-public-page:not(.ui-home-page) .box,body.ui-public-page:not(.ui-home-page) .hero-detail,body.ui-public-page:not(.ui-home-page) .vendor-hero,body.ui-public-page:not(.ui-home-page) .vendor-section,body.ui-public-page:not(.ui-home-page) .private-board-note,body.ui-public-page:not(.ui-home-page) .ad-inquiry-summary > div,body.ui-public-page:not(.ui-home-page) .panel';const block=finalBlock(selector);assert.match(block,/background:#fff!important/);assert.match(block,/border:1px solid var\(--ui-line\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);
});

test('public tables remain full-width and horizontally scrollable',()=>{
  const wrappers=finalBlock('body.ui-public-page:not(.ui-home-page) .board-table-wrap,body.ui-public-page:not(.ui-home-page) .table-wrap');const table=finalBlock('body.ui-public-page:not(.ui-home-page) table');assert.match(wrappers,/width:100%!important/);assert.match(wrappers,/overflow-x:auto!important/);assert.match(wrappers,/border-radius:0!important/);assert.match(wrappers,/background:#fff!important/);assert.match(table,/width:100%!important/);assert.match(table,/border-collapse:collapse/);
});

test('public form controls end with compact corners and a primary focus ring',()=>{
  const selector='body.ui-public-page:not(.ui-home-page) input:not([type="checkbox"]):not([type="radio"]),body.ui-public-page:not(.ui-home-page) select,body.ui-public-page:not(.ui-home-page) textarea';const focusSelector='body.ui-public-page:not(.ui-home-page) input:not([type="checkbox"]):not([type="radio"]):focus,body.ui-public-page:not(.ui-home-page) select:focus,body.ui-public-page:not(.ui-home-page) textarea:focus';const controls=finalBlock(selector);const focus=finalBlock(focusSelector);assert.match(controls,/background:#fff!important/);assert.match(controls,/border:1px solid var\(--ui-line-strong\)!important/);assert.match(controls,/border-radius:4px!important/);assert.match(focus,/border-color:var\(--ui-primary\)!important/);assert.match(focus,/box-shadow:0 0 0 3px rgba\(99,72,154,\.16\)!important/);const phase=css.slice(css.indexOf('/* Phase 9-UI-4:'));assert.doesNotMatch(phase,/body\.ui-public-page:not\(\.ui-home-page\) input,/);assert.doesNotMatch(phase,/body\.ui-public-page:not\(\.ui-home-page\) input:focus,/);
});

test('public page titles use bounded desktop and mobile scales',()=>{
  const phase=css.slice(css.indexOf('/* Phase 9-UI-4:'));const media=phase.indexOf('@media(max-width:760px)');const desktop=phase.slice(0,media);const mobile=phase.slice(media,phase.indexOf('@media(max-width:800px)'));assert.match(desktop,/\.board-head h1[^\{]*\{font-size:26px!important;line-height:1\.25!important}/);assert.match(desktop,/\.box > h2[^\{]*\{font-size:21px!important;line-height:1\.3!important}/);assert.match(mobile,/\.board-head h1[^\{]*\{font-size:22px!important;line-height:1\.25!important}/);assert.match(mobile,/\.box > h2[^\{]*\{font-size:19px!important;line-height:1\.3!important}/);
});

test('admin body fills the neutral viewport without outer padding',()=>{
  const block=phase9Ui4DesktopBlock('body.ui-admin-page');assert.match(block,/margin:0!important/);assert.match(block,/padding:0!important/);assert.match(block,/width:100%!important/);assert.match(block,/min-height:100vh!important/);assert.match(block,/background:#f4f5f7!important/);assert.match(block,/overflow-x:hidden!important/);assert.doesNotMatch(block,/(?:linear|radial)-gradient/);
});

test('admin header spans the viewport with flat dark branding',()=>{
  const header=phase9Ui4DesktopBlock('.ui-admin-page > .top');const brand=phase9Ui4DesktopBlock('.ui-admin-page > .top .site-brand-center,.ui-admin-page > .top .site-brand-center span');assert.match(header,/width:100%!important/);assert.match(header,/max-width:none!important/);assert.match(header,/margin:0!important/);assert.match(header,/background:#f4f5f7!important/);assert.match(header,/border-radius:0!important/);assert.match(header,/box-shadow:none!important/);assert.match(brand,/color:var\(--ui-text\)!important/);
});

test('admin shell is an unrestricted full-width 260px grid',()=>{
  const block=phase9Ui4DesktopBlock('.ui-admin-page > .admin-shell');assert.match(block,/width:100%!important/);assert.match(block,/max-width:none!important/);assert.match(block,/margin:0!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);assert.match(block,/grid-template-columns:260px minmax\(0,1fr\)!important/);
});

test('admin sidebar uses the remaining viewport height and keeps active navigation',()=>{
  const sidebar=phase9Ui4DesktopBlock('.ui-admin-page .admin-sidebar');const active=phase9Ui4DesktopBlock('.ui-admin-page .admin-sidebar a.active');assert.match(sidebar,/width:260px!important/);assert.match(sidebar,/min-height:calc\(100vh - 68px\)!important/);assert.match(sidebar,/background:#eef0f3!important/);assert.match(sidebar,/border-right:1px solid var\(--ui-line\)!important/);assert.match(sidebar,/border-radius:0!important/);assert.match(active,/background:var\(--ui-nav-active\)!important/);assert.match(active,/color:#fff!important/);
});

test('admin content and major cards consume full width with flat surfaces',()=>{
  const content=finalBlock('.ui-admin-page .admin-content');const cards=finalBlock('.ui-admin-page .admin-content .panel,.ui-admin-page .admin-home-box,.ui-admin-page .admin-pending-card,.ui-admin-page .admin-today-card,.ui-admin-page .admin-summary-card,.ui-admin-page .request-summary-card,.ui-admin-page .revenue-card,.ui-admin-page .vendor-summary-card,.ui-admin-page .vendor-request-summary-card,.ui-admin-page .data-management-card,.ui-admin-page .settings-box,.ui-admin-page .admin-account-summary > div,.ui-admin-page .vendor-form-box,.ui-admin-page .integrated-card,.ui-admin-page .admin-dashboard-card,.ui-admin-page .admin-dashboard-recent');const hover=finalBlock('.ui-admin-page .admin-dashboard-card:hover,.ui-admin-page .integrated-card:hover');assert.match(content,/width:100%!important/);assert.match(content,/max-width:none!important/);assert.match(cards,/width:100%!important/);assert.match(cards,/max-width:none!important/);assert.match(cards,/border-radius:0!important/);assert.match(cards,/box-shadow:none!important/);assert.match(hover,/transform:none!important/);
});

test('admin desktop and mobile contracts prevent a bounded outer frame',()=>{
  const phase=css.slice(css.indexOf('/* Phase 9-UI-4:'));const mobile=phase.slice(phase.indexOf('@media(max-width:800px)'));assert.match(phase,/body\.ui-admin-page\{[^}]*padding:0!important[^}]*overflow-x:hidden!important/);assert.match(phase,/\.ui-admin-page > \.admin-shell\{[^}]*grid-template-columns:260px minmax\(0,1fr\)!important/);assert.match(mobile,/\.ui-admin-page > \.admin-shell\{[^}]*width:100%!important[^}]*grid-template-columns:1fr!important/);assert.match(mobile,/\.ui-admin-page \.admin-sidebar\{[^}]*position:static!important[^}]*width:100%!important[^}]*min-height:auto!important/);assert.match(mobile,/\.ui-admin-page \.admin-content\{[^}]*width:100%!important[^}]*padding:16px!important/);
});

test('real admin summary cards and containers receive the final flat contract',()=>{
  const admin=fs.readFileSync(path.join(viewRoot,'admin.ejs'),'utf8');for(const value of ['dashboard-pending-card','dashboard-metric','ad-payment-summary-grid','ad-payment-table-wrap','board-operation-tabs'])assert.match(admin,new RegExp(`\\b${value}\\b`),value);
  const cards=finalBlock('.ui-admin-page .dashboard-pending-card,.ui-admin-page .dashboard-metric,.ui-admin-page #adCenter .ad-payment-summary-grid > button,.ui-admin-page .ad-payment-table-wrap,.ui-admin-page .board-operation-tabs');const containers=finalBlock('.ui-admin-page .ad-payment-table-wrap,.ui-admin-page .board-operation-tabs');const hover=finalBlock('.ui-admin-page .dashboard-pending-card:hover,.ui-admin-page #adCenter .ad-payment-summary-grid > button:hover');assert.match(cards,/background:#fff!important/);assert.match(cards,/color:var\(--ui-text\)!important/);assert.match(cards,/border:1px solid var\(--ui-line\)!important/);assert.match(cards,/border-radius:0!important/);assert.match(cards,/box-shadow:none!important/);assert.match(containers,/width:100%!important/);assert.match(containers,/max-width:none!important/);assert.match(hover,/transform:none!important/);assert.match(hover,/box-shadow:none!important/);
});

test('advertising payment active summary is solid and motionless',()=>{
  const block=finalBlock('.ui-admin-page .admin-content #adCenter .ad-payment-summary-grid > button.active');assert.match(block,/background:var\(--ui-nav-active\)!important/);assert.match(block,/color:#fff!important/);assert.match(block,/border-color:var\(--ui-nav-active\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:none!important/);assert.match(block,/transform:none!important/);assert.doesNotMatch(block,/(?:linear|radial)-gradient|translate/);
});

test('real administrator modal cards end with explicit square light surfaces',()=>{
  const admin=fs.readFileSync(path.join(viewRoot,'admin.ejs'),'utf8');for(const value of ['vendor-modal-box','vendor-request-review-modal-card','admin-account-modal-card','admin-password-result-card'])assert.match(admin,new RegExp(`class="[^"]*\\b${value}\\b`),value);
  const selector='.ui-admin-page .vendor-modal-box,.ui-admin-page .vendor-request-review-modal-card,.ui-admin-page .admin-account-modal-card,.ui-admin-page .admin-password-result-card';const block=finalBlock(selector);assert.match(block,/background:#fff!important/);assert.match(block,/color:var\(--ui-text\)!important/);assert.match(block,/border:1px solid var\(--ui-line\)!important/);assert.match(block,/border-radius:0!important/);assert.match(block,/box-shadow:0 18px 50px rgba\(17,24,39,\.18\)!important/);assert.doesNotMatch(block,/border-radius:(?:16|18)px/);assert.ok(css.lastIndexOf(`${selector}{`)>css.lastIndexOf('.ui-admin-page .vendor-modal-box,.ui-admin-page .vendor-request-review-modal-card,.ui-admin-page .admin-account-modal-card,.ui-admin-page .admin-password-result-card,.ui-admin-page .detail-modal'));
});

test('dashboard metric child colors override the real dark-theme inventory',()=>{
  const admin=fs.readFileSync(path.join(viewRoot,'admin.ejs'),'utf8');assert.match(admin,/\.dashboard-metric b\{[^}]*color:#8d98b8/);assert.match(admin,/\.dashboard-metric strong\{[^}]*color:#fff/);
  const label=finalBlock('.ui-admin-page .dashboard-metric b');const value=finalBlock('.ui-admin-page .dashboard-metric strong');assert.match(label,/color:var\(--ui-muted\)!important/);assert.match(value,/color:var\(--ui-text\)!important/);assert.doesNotMatch(value,/(?:#fff|#dfe9ff)/);assert.ok(specificity('.ui-admin-page .dashboard-metric strong')[1]>specificity('.dashboard-metric strong')[1]);assert.doesNotMatch(admin.match(/\.dashboard-metric strong\{[^}]*}/)[0],/!important/);
});

test('dashboard pending child colors override the real dark-theme inventory',()=>{
  const admin=fs.readFileSync(path.join(viewRoot,'admin.ejs'),'utf8');assert.match(admin,/\.dashboard-pending-card b\{[^}]*color:#dfe9ff/);assert.match(admin,/\.dashboard-pending-card strong\{[^}]*color:#10d9ff/);
  const label=finalBlock('.ui-admin-page .dashboard-pending-card b');const value=finalBlock('.ui-admin-page .dashboard-pending-card strong');assert.match(label,/color:var\(--ui-text-soft\)!important/);assert.doesNotMatch(label,/#dfe9ff/);assert.match(value,/color:var\(--ui-primary\)!important/);assert.doesNotMatch(value,/#10d9ff/);assert.ok(specificity('.ui-admin-page .dashboard-pending-card strong')[1]>specificity('.dashboard-pending-card strong')[1]);assert.doesNotMatch(admin.match(/\.dashboard-pending-card strong\{[^}]*}/)[0],/!important/);
});
