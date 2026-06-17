let i=0;
const slides=[...document.querySelectorAll('.promo-slide')];
if(slides.length>1){
  setInterval(()=>{
    slides[i].classList.remove('on');
    i=(i+1)%slides.length;
    slides[i].classList.add('on');
  },2800);
}

const topNav=document.querySelector('.top nav');
if(topNav&&!topNav.querySelector('a[href="/advertise"]')){
  const ad=document.createElement('a'); ad.href='/advertise'; ad.textContent='광고문의';
  const ap=document.createElement('a'); ap.href='/apply'; ap.textContent='입점신청';
  const first=topNav.querySelector('a[href="/"]');
  if(first&&first.nextSibling){topNav.insertBefore(ap,first.nextSibling);topNav.insertBefore(ad,ap)}else{topNav.prepend(ap);topNav.prepend(ad)}
}

const modal=document.getElementById('vendorModal');
const modalContent=document.getElementById('vendorModalContent');
function esc(s=''){
  return String(s||'').replace(/[&<>"]/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
function getFavs(){try{return JSON.parse(localStorage.getItem('favoriteVendors')||'[]')}catch(e){return[]}}
function setFavs(list){localStorage.setItem('favoriteVendors',JSON.stringify(list))}
function isFav(id){return getFavs().includes(String(id))}
function applyFavFilter(onlyFav){
  const favs=getFavs();
  document.querySelectorAll('.vendor-open.card').forEach(card=>{
    const id=String(card.dataset.vendorId||'');
    card.style.display=onlyFav&&!favs.includes(id)?'none':'';
  });
  document.querySelectorAll('.fav-filter-status').forEach(el=>{
    el.textContent=onlyFav?`찜한 업체 ${favs.length}개를 보고 있습니다.`:'';
  });
}
function toggleFavFilter(){
  const on=localStorage.getItem('showOnlyFavs')==='1';
  localStorage.setItem('showOnlyFavs',on?'0':'1');
  refreshFavFilterButton();
  applyFavFilter(!on);
}
function refreshFavFilterButton(){
  const on=localStorage.getItem('showOnlyFavs')==='1';
  const btn=document.getElementById('favFilterBtn');
  if(btn) btn.textContent=on?'전체보기':'찜한업체';
}
function toggleFav(id){let list=getFavs();id=String(id);if(list.includes(id)){list=list.filter(x=>x!==id)}else{list.push(id)}setFavs(list);refreshFavFilterButton();applyFavFilter(localStorage.getItem('showOnlyFavs')==='1');openVendor(id)}
function openModal(){
  if(!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
}
function closeModal(){
  if(!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
async function openVendor(id){
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
    const kakaoBtn=v.kakao_url?`<a href="${esc(v.kakao_url)}" target="_blank" rel="noopener" style="width:130px;min-width:130px;height:44px;margin:0;display:inline-flex;align-items:center;justify-content:center;border-radius:13px;background:#fee500;color:#111;text-decoration:none;font-weight:900;">카카오톡 문의</a>`:'';
    const favOn=isFav(v.id);
    const favBtn=`<button type="button" onclick="toggleFav(${esc(v.id)})" style="height:38px;padding:0 14px;border-radius:999px;border:1px solid ${favOn?'#ffdc4d':'#39466c'};background:${favOn?'#ffdc4d':'#080d18'};color:${favOn?'#111':'#dfe9ff'};font-weight:900;cursor:pointer;">${favOn?'♥ 찜완료':'♡ 찜하기'}</button>`;
    const reviewHtml=reviews.length
      ? reviews.map(r=>`<article class="review"><b>★${esc(r.rating)} ${esc(r.title)}</b><p>${esc(r.content)}</p><small>${esc(r.nickname||'탈퇴회원')}</small></article>`).join('')
      : '<p class="empty-text">첫 번째 후기를 작성해보세요.</p>';
    modalContent.innerHTML=`
      <div class="modal-vendor-info">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
          <em>${badge}</em>
          ${favBtn}
        </div>
        <h2>${esc(v.name)}</h2>
        <p>📍 ${esc(v.region)} · ${esc(v.category)} · 👁 조회 ${esc(v.views)} · ${ratingText}</p>
      </div>
      <div class="modal-vendor-head">
        <div class="modal-vendor-photo">${v.image_data?`<img src="${v.image_data}" alt="${esc(v.name)}">`:'<div class="noimg">IMAGE</div>'}</div>
        <div class="info-list modal-info-list">
          <div class="modal-info-box" style="display:block!important;">
            <b>영업시간</b>
            <span style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:20px;margin-top:14px;">
              <span style="font-size:17px;color:#fff;line-height:1.45;">${esc(v.business_hours||'등록된 영업시간이 없습니다.')}</span>
              ${kakaoBtn}
            </span>
          </div>
          <div class="modal-info-box contact-box" style="display:block!important;">
            <b>연락처</b>
            <span style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:20px;margin-top:14px;">
              <span style="font-size:18px;font-weight:800;color:#fff;">${esc(v.phone||'등록된 연락처가 없습니다.')}</span>
              ${v.phone?`<a class="call-btn" href="tel:${esc(v.phone)}" style="width:130px;min-width:130px;height:44px;margin:0;display:inline-flex;align-items:center;justify-content:center;border-radius:13px;">전화하기</a>`:''}
            </span>
          </div>
        </div>
      </div>
      <section class="modal-section"><h3>업체소개</h3><p class="vendor-desc" style="background:transparent!important;border:0!important;padding:0!important;line-height:1.8;">${esc(v.description||'등록된 업체소개가 없습니다.')}</p></section>
      <section class="modal-section review-section"><div class="review-title"><h3>⭐⭐⭐⭐⭐ 후기</h3><a href="/vendor/${esc(v.id)}#review" class="review-write-btn" style="display:inline-flex;align-items:center;text-decoration:none;">후기 작성하기</a></div>${reviewHtml}</section>
    `;
  }catch(e){
    modalContent.innerHTML='<div class="modal-loading">업체 정보를 불러오지 못했습니다.</div>';
  }
}

document.querySelectorAll('.vendor-open').forEach((el)=>{
  el.addEventListener('click',(e)=>{
    e.preventDefault();
    const id=el.dataset.vendorId;
    if(id) openVendor(id);
  });
});

const contentArea=document.querySelector('.content-area');
if(contentArea){
  const bar=document.createElement('div');
  bar.style.cssText='display:flex;align-items:center;gap:10px;margin:0 0 20px;';
  bar.innerHTML='<button id="favFilterBtn" type="button" style="height:42px;padding:0 18px;border-radius:999px;border:1px solid #ffdc4d;background:#080d18;color:#ffdc4d;font-weight:900;cursor:pointer;">찜한업체</button><span class="fav-filter-status" style="color:#c8d0e8;font-size:14px;"></span>';
  contentArea.prepend(bar);
  document.getElementById('favFilterBtn').addEventListener('click',toggleFavFilter);
  refreshFavFilterButton();
  applyFavFilter(localStorage.getItem('showOnlyFavs')==='1');
}

document.addEventListener('click',(e)=>{
  if(e.target?.dataset?.close) closeModal();
});
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape') closeModal();
});

const reviewPopupScript=document.createElement('script');
reviewPopupScript.src='/public/js/review-popup.js';
document.body.appendChild(reviewPopupScript);