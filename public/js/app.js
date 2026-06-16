let i=0;
const slides=[...document.querySelectorAll('.promo-slide')];
if(slides.length>1){
  setInterval(()=>{
    slides[i].classList.remove('on');
    i=(i+1)%slides.length;
    slides[i].classList.add('on');
  },2800);
}

const modal=document.getElementById('vendorModal');
const modalContent=document.getElementById('vendorModalContent');
function esc(s=''){
  return String(s||'').replace(/[&<>"]/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
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
    const reviewHtml=reviews.length
      ? reviews.map(r=>`<article class="review"><b>★${esc(r.rating)} ${esc(r.title)}</b><p>${esc(r.content)}</p><small>${esc(r.nickname||'탈퇴회원')}</small></article>`).join('')
      : '<p class="empty-text">첫 번째 후기를 작성해보세요.</p>';
    modalContent.innerHTML=`
      <div class="modal-vendor-info">
        <em>${badge}</em>
        <h2>${esc(v.name)}</h2>
        <p>📍 ${esc(v.region)} · ${esc(v.category)} · 👁 조회 ${esc(v.views)} · ${ratingText}</p>
      </div>
      <div class="modal-vendor-head">
        <div class="modal-vendor-photo">${v.image_data?`<img src="${v.image_data}" alt="${esc(v.name)}">`:'<div class="noimg">IMAGE</div>'}</div>
        <div class="info-list modal-info-list">
          <div class="modal-info-box" style="display:block!important;">
            <b>영업시간</b>
            <span>${esc(v.business_hours||'등록된 영업시간이 없습니다.')}</span>
            <span style="display:flex;justify-content:flex-end;width:100%;margin-top:14px;">${kakaoBtn}</span>
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

document.addEventListener('click',(e)=>{
  if(e.target?.dataset?.close) closeModal();
});
document.addEventListener('keydown',(e)=>{
  if(e.key==='Escape') closeModal();
});

const reviewPopupScript=document.createElement('script');
reviewPopupScript.src='/public/js/review-popup.js';
document.body.appendChild(reviewPopupScript);