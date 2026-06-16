document.addEventListener('click', async function(e){
  const btn=e.target.closest('.review-write-btn');
  if(!btn) return;
  const href=btn.getAttribute('href')||'';
  const m=href.match(/\/vendor\/(\d+)/);
  if(!m) return;
  e.preventDefault();
  const vendorId=m[1];
  const title=window.prompt('후기 제목을 입력하세요');
  if(!title) return;
  const content=window.prompt('후기 내용을 입력하세요');
  if(!content) return;
  let rating=window.prompt('별점 1~5를 입력하세요','5');
  rating=parseInt(rating||'5',10);
  if(!rating||rating<1||rating>5) rating=5;
  const res=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vendor_id:vendorId,title,content,rating})});
  if(res.status===401){alert('로그인 후 후기를 작성할 수 있습니다.'); location.href='/login'; return;}
  if(!res.ok){alert('후기 등록에 실패했습니다.'); return;}
  alert('후기가 등록되었습니다.');
  if(typeof openVendor==='function') openVendor(vendorId);
});