document.addEventListener('click', async function(e){
  const btn=e.target.closest('.review-write-btn');
  if(!btn) return;
  const href=btn.getAttribute('href')||'';
  const m=href.match(/\/vendor\/(\d+)/);
  if(!m) return;
  e.preventDefault();
  const vendorId=m[1];
  let old=document.getElementById('popupReviewForm');
  if(old){old.remove(); return;}
  const box=document.createElement('form');
  box.id='popupReviewForm';
  box.innerHTML='<div style="display:grid;grid-template-columns:1fr 120px;gap:10px;margin-bottom:10px"><input name="title" placeholder="후기 제목" required style="background:#070b15;color:#fff;border:1px solid #29324f;border-radius:10px;padding:12px"><select name="rating" style="background:#070b15;color:#fff;border:1px solid #29324f;border-radius:10px;padding:12px"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></div><textarea name="content" placeholder="후기 내용을 입력하세요" required style="width:100%;min-height:90px;background:#070b15;color:#fff;border:1px solid #29324f;border-radius:10px;padding:12px;resize:vertical"></textarea><button type="submit" style="margin-top:10px;width:140px;height:42px;border:0;border-radius:12px;background:linear-gradient(90deg,#ff3fb4,#10d9ff);color:#fff;font-weight:900">등록하기</button>';
  box.style.cssText='margin:14px 0 18px;background:#080d18;border:1px solid #29324f;border-radius:16px;padding:16px';
  const section=btn.closest('.review-section');
  section.querySelector('.review-title').after(box);
  box.addEventListener('submit',async function(ev){
    ev.preventDefault();
    const fd=new FormData(box);
    const data={vendor_id:vendorId,title:fd.get('title'),content:fd.get('content'),rating:fd.get('rating')};
    const res=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.status===401){alert('로그인 후 후기를 작성할 수 있습니다.'); location.href='/login'; return;}
    if(!res.ok){alert('후기 등록에 실패했습니다.'); return;}
    alert('후기가 등록되었습니다.');
    if(typeof openVendor==='function') openVendor(vendorId);
  });
});