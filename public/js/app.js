let i=0;

function isPublicUserAuthenticated(){
  const menu=document.getElementById('publicSideMenu');
  if(menu)return menu.dataset.publicAuthenticated==='true';
  return Boolean(document.querySelector('a[href="/logout"]'));
}

function notificationGroup(type){
  const t=String(type||'').toLowerCase();
  if(t.startsWith('ad_inquiry'))return {key:'ad-inquiry',label:'광고문의'};
  if(t.includes('payment'))return {key:'payment',label:'결제'};
  if(t.includes('vendor_update'))return {key:'vendor-update',label:'업체수정'};
  if(t.includes('flag')||t.includes('report'))return {key:'report',label:'신고'};
  if(t.includes('apply')||t.includes('inquiry'))return {key:'apply',label:'입점신청'};
  return {key:'system',label:'시스템'};
}

function initMemberNotificationCenter(){
  if(!isPublicUserAuthenticated())return;
  if(document.getElementById('adminNotificationCenter')||document.getElementById('memberNotificationCenter'))return;
  const root=document.createElement('div');
  root.id='memberNotificationCenter';root.className='notification-center';
  root.innerHTML='<button type="button" class="notification-float-btn">알림 <span class="notification-count-badge"></span></button><section class="notification-panel"><header><b>알림센터</b><button type="button" class="notification-read-all">전체 읽음</button></header><div class="notification-filter-row"><button type="button" class="active" data-filter="all">전체</button><button type="button" data-filter="unread">안읽음</button><button type="button" data-filter="ad-inquiry">광고문의</button><button type="button" data-filter="apply">입점신청</button><button type="button" data-filter="payment">결제</button><button type="button" data-filter="vendor-update">업체수정</button><button type="button" data-filter="report">신고</button><button type="button" data-filter="system">시스템</button></div><div class="notification-list"><div class="notification-empty">알림을 불러오는 중...</div></div></section>';
  document.body.appendChild(root);
  const button=root.querySelector('.notification-float-btn'),count=root.querySelector('.notification-count-badge'),list=root.querySelector('.notification-list'),filters=root.querySelector('.notification-filter-row');
  let items=[],filter='all';
  const htmlEscape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const render=()=>{const shown=items.filter(x=>filter==='all'||(filter==='unread'&&!x.is_read)||notificationGroup(x.type).key===filter);list.innerHTML=shown.length?shown.map(x=>{const g=notificationGroup(x.type);return `<a class="notification-item ${x.is_read?'':'unread'}" href="${htmlEscape(x.link_url||'#')}" data-id="${Number(x.id||0)}"><div class="notification-row"><span class="notification-type-badge ${g.key}">${g.label}</span><span class="notification-read-badge">${x.is_read?'읽음':'안읽음'}</span></div><b>${htmlEscape(x.title||'알림')}</b><p>${htmlEscape(x.message||'')}</p><small>${htmlEscape(new Date(x.created_at).toLocaleString('ko-KR',{hour12:false}))}</small><span class="notification-link-label">이동</span></a>`;}).join(''):'<div class="notification-empty">해당 알림이 없습니다.</div>';};
  const load=async()=>{try{const response=await fetch('/api/notifications',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'});if(response.status===401){root.remove();return;}const data=await response.json();if(!data.ok)throw new Error('load failed');items=data.items||[];const unread=Number(data.unread||0);count.textContent=unread>99?'99+':unread;count.hidden=unread===0;render();}catch(e){list.innerHTML='<div class="notification-empty">알림을 불러오지 못했습니다.</div>';}};
  button.addEventListener('click',()=>{root.classList.toggle('open');if(root.classList.contains('open'))load();});
  filters.addEventListener('click',e=>{const target=e.target.closest('[data-filter]');if(!target)return;filter=target.dataset.filter;filters.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===target));render();});
  list.addEventListener('click',e=>{const link=e.target.closest('.notification-item');if(link)fetch(`/api/notifications/${link.dataset.id}/read`,{method:'POST',credentials:'same-origin'}).catch(()=>{});});
  root.querySelector('.notification-read-all').addEventListener('click',async()=>{await fetch('/api/notifications/read-all',{method:'POST',credentials:'same-origin'}).catch(()=>{});load();});
  document.addEventListener('click',e=>{if(!root.contains(e.target))root.classList.remove('open');});
  load();
}
document.addEventListener('DOMContentLoaded',initMemberNotificationCenter);

const slides=[...document.querySelectorAll('.promo-slide')];
if(slides.length>1){
  setInterval(()=>{
    slides[i].classList.remove('on');
    i=(i+1)%slides.length;
    slides[i].classList.add('on');
  },2800);
}

// 상단 메뉴는 각 EJS 템플릿에서 권한별로 직접 렌더링합니다.
// 광고문의/입점신청 링크는 마이페이지/업체관리 내부 동선으로 통합했으므로
// 공통 JS에서 임의로 추가하지 않습니다.

const modal=document.getElementById('vendorModal');
const modalContent=document.getElementById('vendorModalContent');
function esc(s=''){
  return String(s||'').replace(/[&<>"]/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
function submitFlag(type,targetId){
  const safeType=type==='review'?'review':type==='vendor'?'vendor':'';
  const id=Number(targetId);
  if(!safeType||!Number.isInteger(id)||id<=0)return;
  location.href=`/boards/reports/write?type=${safeType}&target_id=${id}`;
}
let favoriteIds=[];
let favoriteAuthed=isPublicUserAuthenticated();
let favoriteOnly=false;
let favoriteLoaded=!favoriteAuthed;
let favoriteLoadPromise=null;
function getFavs(){return favoriteIds}
function setFavs(list){favoriteIds=[...new Set((list||[]).map(x=>String(x)))]}
function isFav(id){return favoriteIds.includes(String(id))}
async function loadFavs(){
  if(!isPublicUserAuthenticated()){favoriteAuthed=false;favoriteLoaded=true;setFavs([]);return false;}
  try{
    const res=await fetch('/api/favorites',{headers:{'Accept':'application/json'}});
    if(res.status===401){favoriteAuthed=false;setFavs([]);favoriteLoaded=true;return false;}
    if(!res.ok)throw new Error('favorite_load_failed');
    const data=await res.json();
    favoriteAuthed=!!data.ok;
    setFavs(data.ids||[]);
    favoriteLoaded=true;
    return favoriteAuthed;
  }catch(e){
    favoriteAuthed=false;
    setFavs([]);
    favoriteLoaded=true;
    return false;
  }
}
function ensureFavsLoaded(){
  if(!isPublicUserAuthenticated()){favoriteAuthed=false;favoriteLoaded=true;setFavs([]);return Promise.resolve(false);}
  if(favoriteLoaded)return Promise.resolve(favoriteAuthed);
  if(!favoriteLoadPromise)favoriteLoadPromise=loadFavs();
  return favoriteLoadPromise;
}
function applyFavFilter(onlyFav){
  favoriteOnly=!!onlyFav;
  const favs=getFavs();
  document.querySelectorAll('.vendor-open.card, .mini-row.vendor-open').forEach(card=>{
    const id=String(card.dataset.vendorId||'');
    card.style.display=favoriteOnly&&favoriteAuthed&&!favs.includes(id)?'none':'';
  });
  document.querySelectorAll('.fav-filter-status').forEach(el=>{
    el.textContent=favoriteOnly?(favoriteAuthed?`찜한 업체 ${favs.length}개를 보고 있습니다.`:'로그인 후 찜한 업체를 볼 수 있습니다.'):'';
  });
}
async function toggleFavFilter(){
  await ensureFavsLoaded();
  if(!favoriteAuthed){
    alert('로그인 후 찜한 업체를 볼 수 있습니다.');
    location.href='/login';
    return;
  }
  const on=favoriteOnly;
  applyFavFilter(!on);
  refreshFavFilterButton();
}
function refreshFavFilterButton(){
  const btn=document.getElementById('favFilterBtn');
  if(btn) btn.textContent=favoriteOnly?'전체보기':'찜한업체';
}
async function toggleFav(id){
  await ensureFavsLoaded();
  if(!favoriteAuthed){
    alert('로그인 후 찜할 수 있습니다.');
    location.href='/login';
    return;
  }
  try{
    const res=await fetch('/api/favorite/'+encodeURIComponent(id)+'/toggle',{method:'POST',headers:{'Accept':'application/json'}});
    if(res.status===401){favoriteAuthed=false;alert('로그인 후 찜할 수 있습니다.');location.href='/login';return;}
    if(!res.ok)throw new Error('favorite_toggle_failed');
    const data=await res.json();
    setFavs(data.ids||[]);
    favoriteLoaded=true;
    refreshFavFilterButton();
    applyFavFilter(favoriteOnly);
    openVendor(id);
  }catch(e){
    alert('찜 처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}
function openModal(){
  if(!modal) return;
  modal.style.display='block';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
}
function closeModal(){
  if(!modal) return;
  modal.classList.remove('show');
  modal.style.display='none';
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
async function openVendor(id){
  if(!modal || !modalContent){
    location.href='/vendor/'+encodeURIComponent(id);
    return;
  }
  openModal();
  modalContent.innerHTML='<div class="modal-loading">불러오는 중...</div>';
  try{
    const res=await fetch('/api/vendor/'+id);
    if(!res.ok) throw new Error('load failed');
    const data=await res.json();
    const v=data.vendor;
    const reviews=data.reviews||[];
    const badge=v.is_premium?'PREMIUM':v.is_recommended?'RECOMMEND':'NORMAL';
    const ratingText=v.review_count>0?`⭐ ${esc(v.avg_rating)} · 후기 ${esc(v.review_count)}개`:'⭐ 평점 없음';
    const kakaoBtn=v.kakao_url?`<a href="${esc(v.kakao_url)}" target="_blank" rel="noopener" class="modal-kakao-btn">카카오톡 문의</a>`:'';
    const tagItems=(Array.isArray(v.tags)?v.tags:String(v.tags||'').split(/[,\s#]+/))
      .map(t=>String(t||'').trim())
      .filter(Boolean)
      .filter((t,idx,arr)=>arr.indexOf(t)===idx)
      .slice(0,12);
    const tagHtml=tagItems.length
      ? `<div class="modal-vendor-tags" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">${tagItems.map(t=>`<span style="display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;border:1px solid #39466c;background:#080d18;color:#c8d0e8;font-size:13px;font-weight:800;">#${esc(t)}</span>`).join('')}</div>`
      : '';
    await ensureFavsLoaded();
    const favOn=isFav(v.id);
    const favBtn=`<button type="button" onclick="toggleFav(${esc(v.id)})" style="height:38px;padding:0 14px;border-radius:999px;border:1px solid ${favOn?'#ffdc4d':'#39466c'};background:${favOn?'#ffdc4d':'#080d18'};color:${favOn?'#111':'#dfe9ff'};font-weight:900;cursor:pointer;">${favOn?'♥ 찜완료':'♡ 찜하기'}</button>`;
    const flagBtn=`<button type="button" onclick="submitFlag('vendor',${esc(v.id)})" style="height:38px;padding:0 14px;border-radius:999px;border:1px solid #39466c;background:#080d18;color:#c8d0e8;font-weight:900;cursor:pointer;">업체 신고</button>`;
    const reviewHtml=reviews.length
      ? reviews.map(r=>`<article class="review"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><b>★${esc(r.rating)} ${esc(r.title)}</b><button type="button" onclick="submitFlag('review',${esc(r.id)})" style="height:30px;padding:0 10px;border-radius:999px;border:1px solid #39466c;background:#080d18;color:#c8d0e8;font-weight:800;cursor:pointer;">신고</button></div><p>${esc(r.content)}</p><small>${esc(r.nickname||'탈퇴회원')}</small></article>`).join('')
      : '<p class="empty-text">등록된 후기가 없습니다.</p>';
    modalContent.innerHTML=`
      <div class="modal-vendor-info">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
          <em>${badge}</em>
          <span style="display:flex;gap:8px;align-items:center;">${flagBtn}${favBtn}</span>
        </div>
        <h2>${esc(v.name)}</h2>
        <p>📍 ${esc(v.region)} · ${esc(v.category)} · 👁 조회 ${esc(v.views)} · ${ratingText}</p>
      </div>
      <div class="modal-vendor-head">
        <div class="modal-vendor-photo">${v.image_data?`<img src="${v.image_data}" alt="${esc(v.name)}">`:'<div class="noimg">IMAGE</div>'}</div>
        <section class="modal-intro-box">
          <h3>업체소개</h3>
          <p class="vendor-desc">${esc(v.description||'등록된 업체소개가 없습니다.')}</p>
          ${tagHtml}
        </section>
      </div>
      <div class="modal-contact-grid">
        <div class="modal-info-box">
          <b>영업시간</b>
          <div class="modal-info-row">
            <span>${esc(v.business_hours||'등록된 영업시간이 없습니다.')}</span>
            ${kakaoBtn}
          </div>
        </div>
        <div class="modal-info-box contact-box">
          <b>연락처</b>
          <div class="modal-info-row">
            <span class="modal-phone-text">${esc(v.phone||'등록된 연락처가 없습니다.')}</span>
            ${v.phone?`<a class="call-btn" href="tel:${esc(v.phone)}">전화하기</a>`:''}
          </div>
        </div>
      </div>
      <section class="modal-section review-section"><div class="review-title"><h3>⭐⭐⭐⭐⭐ 후기</h3></div>${reviewHtml}</section>
    `;
  }catch(e){
    modalContent.innerHTML='<div class="modal-loading">업체 정보를 불러오지 못했습니다.</div>';
  }
}

document.addEventListener('click',(e)=>{
  const el=e.target&&e.target.closest?e.target.closest('.vendor-open'):null;
  if(!el)return;
  const href=String(el.getAttribute('href')||'');
  const hrefMatch=href.match(/^\/vendor\/(\d+)/);
  const id=el.dataset.vendorId||(hrefMatch?hrefMatch[1]:'');
  if(!id)return;
  e.preventDefault();
  openVendor(id);
});

function buildSortUrl(sort){
  if(sort==='all') return '/';
  const params=new URLSearchParams(window.location.search);
  if(sort==='default') params.delete('sort');
  else params.set('sort',sort);
  const q=params.toString();
  return q?`/?${q}`:'/';
}
function sortButton(label,sort,current){
  const active=(sort==='default'&&(!current||current==='default'))||current===sort;
  const style=active
    ? 'background:linear-gradient(90deg,#ff3fb4,#10d9ff);color:#fff;border-color:transparent;'
    : 'background:#080d18;color:#dfe9ff;border-color:#39466c;';
  return `<a href="${buildSortUrl(sort)}" style="height:42px;padding:0 16px;border-radius:999px;border:1px solid;display:inline-flex;align-items:center;text-decoration:none;font-weight:900;white-space:nowrap;${style}">${label}</a>`;
}

const oldSortSelect=document.querySelector('.side-search select[name="sort"]');
if(oldSortSelect) oldSortSelect.remove();

const contentArea=document.querySelector('.content-area');
if(contentArea){
  const params=new URLSearchParams(window.location.search);
  const currentSort=params.get('sort')||'default';
  const bar=document.createElement('div');
  bar.style.cssText='display:flex;align-items:center;gap:10px;margin:0 0 20px;flex-wrap:wrap;';
  bar.innerHTML=`
    <button id="favFilterBtn" type="button" style="height:42px;padding:0 18px;border-radius:999px;border:1px solid #ffdc4d;background:#080d18;color:#ffdc4d;font-weight:900;cursor:pointer;white-space:nowrap;">찜한업체</button>
    ${sortButton('전체','all',currentSort)}
    ${sortButton('기본순','default',currentSort)}
    ${sortButton('조회수순','views',currentSort)}
    ${sortButton('평점순','rating',currentSort)}
    ${sortButton('후기순','reviews',currentSort)}
    ${sortButton('최신등록순','latest',currentSort)}
    <span class="fav-filter-status" style="color:#c8d0e8;font-size:14px;"></span>
  `;
  contentArea.prepend(bar);
  document.getElementById('favFilterBtn').addEventListener('click',toggleFavFilter);
  refreshFavFilterButton();
  ensureFavsLoaded().then(()=>{refreshFavFilterButton();applyFavFilter(favoriteOnly);});
}

document.addEventListener('click',(e)=>{
  if(e.target?.dataset?.close) closeModal();
});
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape') closeModal();
});

// 2026-06 사용성 보강: 필터 상태 표시, 이미지 로딩 최적화, 중복 클릭 방지
(function(){
  const params=new URLSearchParams(window.location.search);
  const currentCategory=params.get('category')||'';
  const currentRegion=params.get('region')||'';
  document.querySelectorAll('.selector-wrap').forEach((wrap,idx)=>{
    const key=idx===0?'category':'region';
    const value=key==='category'?currentCategory:currentRegion;
    wrap.querySelectorAll('a').forEach(a=>{
      try{
        const u=new URL(a.href,location.origin);
        const target=u.searchParams.get(key)||'';
        if(value&&target===value){
          a.classList.add('active');
          a.setAttribute('aria-current','page');
        }
      }catch(e){}
    });
  });
  document.querySelectorAll('img').forEach(img=>{
    if(!img.hasAttribute('loading')) img.loading='lazy';
    if(!img.hasAttribute('decoding')) img.decoding='async';
  });
  document.querySelectorAll('form').forEach(form=>{
    form.addEventListener('submit',()=>{
      const btn=form.querySelector('button[type="submit"],button:not([type])');
      if(btn&&!btn.dataset.keepActive){
        btn.disabled=true;
        btn.dataset.originalText=btn.textContent;
        btn.textContent='처리중...';
      }
    });
  });
})();

(function(){
  if(window.__boardUiV1)return;
  window.__boardUiV1=true;
  document.addEventListener('click',function(e){
    var faq=e.target&&e.target.closest&&e.target.closest('.faq-question');
    if(faq){e.preventDefault();var item=faq.closest('.faq-item'),answer=item&&item.querySelector('.faq-answer'),open=!!item&&!item.classList.contains('open');if(item)item.classList.toggle('open',open);faq.setAttribute('aria-expanded',open?'true':'false');if(answer)answer.hidden=!open;return;}
    var toggle=e.target&&e.target.closest&&e.target.closest('[data-board-menu-toggle]');
    if(toggle){e.preventDefault();toggle.closest('.board-ui-group')?.classList.toggle('open');return;}
    var row=e.target&&e.target.closest&&e.target.closest('tr[data-board-href]');
    if(row&&!e.target.closest('a,button,input,select,textarea'))location.href=row.dataset.boardHref;
  });
  var file=document.querySelector('.board-form input[type="file"][name="image"]');
  if(file)file.addEventListener('change',function(){
    var preview=document.querySelector('.board-image-preview'),image=preview&&preview.querySelector('img'),selected=file.files&&file.files[0];
    if(!preview||!image||!selected)return;
    if(image.dataset.objectUrl)URL.revokeObjectURL(image.dataset.objectUrl);
    image.dataset.objectUrl=URL.createObjectURL(selected);image.src=image.dataset.objectUrl;preview.style.display='block';
  });
})();

(function(){
  if(window.__publicMenuFallbackButtonV1)return;
  window.__publicMenuFallbackButtonV1=true;
  function ensurePublicMenuButton(){
    var menu=document.getElementById('publicSideMenu');
    if(!menu||document.querySelector('.public-menu-toggle'))return;
    var btn=document.createElement('button');
    btn.type='button';
    btn.className='public-menu-toggle';
    btn.setAttribute('data-public-menu-open','');
    btn.setAttribute('aria-label','메뉴 열기');
    btn.setAttribute('aria-controls','publicSideMenu');
    btn.setAttribute('aria-expanded','false');
    btn.innerHTML='<span></span><span></span><span></span>';
    document.body.insertBefore(btn,document.body.firstChild);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensurePublicMenuButton);
  else ensurePublicMenuButton();
})();

(function(){
  if(window.__publicSideMenuV1)return;
  window.__publicSideMenuV1=true;
  function qs(s,root){return (root||document).querySelector(s);}
  function qsa(s,root){return Array.prototype.slice.call((root||document).querySelectorAll(s));}
  var menu=qs('#publicSideMenu'),overlay=qs('.public-menu-overlay'),openButton=qs('[data-public-menu-open]');
  if(!menu)return;
  function focusWithoutScroll(element){if(!element)return;try{element.focus({preventScroll:true});}catch(e){element.focus();}}
  function openMenu(){
    if(menu.classList.contains('open'))return;
    menu.removeAttribute('inert');
    menu.setAttribute('aria-hidden','false');
    menu.classList.add('open');
    if(overlay){overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');}
    if(openButton)openButton.setAttribute('aria-expanded','true');
    document.body.classList.add('public-menu-open');
    focusWithoutScroll(qs('[data-public-menu-close]',menu));
  }
  function closeMenu(){
    var wasOpen=menu.classList.contains('open');
    if(!wasOpen)return;
    var focusWasInside=menu.contains(document.activeElement);
    menu.classList.remove('open');
    if(overlay){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');}
    document.body.classList.remove('public-menu-open');
    if(focusWasInside)focusWithoutScroll(openButton);
    menu.setAttribute('inert','');
    menu.setAttribute('aria-hidden','true');
    if(openButton)openButton.setAttribute('aria-expanded','false');
  }
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-public-menu-open]')){e.preventDefault();openMenu();return;}
    if(e.target.closest('[data-public-menu-close]')){e.preventDefault();closeMenu();return;}
    var groupButton=e.target.closest('[data-public-submenu-toggle]');
    if(groupButton){e.preventDefault();var group=groupButton.closest('.public-menu-group');if(group){group.classList.toggle('open');groupButton.setAttribute('aria-expanded',group.classList.contains('open')?'true':'false');}return;}
    if(e.target.closest('.public-side-menu a'))closeMenu();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu();});
  var path=location.pathname.replace(/\/$/,'')||'/';
  if(path.indexOf('/boards')===0&&path.indexOf('/boards/ad-inquiry')!==0){var community=qs('[data-public-menu-community]');if(community){community.classList.add('open');var communityButton=qs('[data-public-submenu-toggle]',community);if(communityButton)communityButton.setAttribute('aria-expanded','true');}}
  var best=null,bestLength=-1;
  qsa('.public-side-menu a').forEach(function(a){
    var linkPath=a.pathname.replace(/\/$/,'')||'/';
    var exact=linkPath===path;
    var boardParent=linkPath.indexOf('/boards/')===0&&path.indexOf(linkPath+'/')===0;
    if((exact||boardParent)&&linkPath.length>bestLength){best=a;bestLength=linkPath.length;}
  });
  if(best){best.classList.add('active');best.setAttribute('aria-current','page');var parent=best.closest('.public-menu-group');if(parent){parent.classList.add('open');var parentButton=qs('[data-public-submenu-toggle]',parent);if(parentButton)parentButton.setAttribute('aria-expanded','true');}}
})();
