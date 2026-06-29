// Shared UI helper - 2026
(function(){
  function toast(message){
    if(!message) return;
    let box=document.getElementById('uiToast');
    if(!box){
      box=document.createElement('div');
      box.id='uiToast';
      box.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);z-index:9999;max-width:calc(100vw - 32px);padding:13px 18px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(8,13,24,.94);color:#fff;font-weight:900;box-shadow:0 18px 44px rgba(0,0,0,.38);opacity:0;transition:.22s opacity,.22s transform;backdrop-filter:blur(12px);';
      document.body.appendChild(box);
    }
    box.textContent=message;
    requestAnimationFrame(()=>{box.style.opacity='1';box.style.transform='translateX(-50%) translateY(0)';});
    clearTimeout(box._timer);
    box._timer=setTimeout(()=>{box.style.opacity='0';box.style.transform='translateX(-50%) translateY(20px)';},1800);
  }
  window.uiToast=toast;
  document.addEventListener('click',function(e){
    const copyBtn=e.target.closest('[data-copy-target]');
    if(copyBtn){
      const target=document.querySelector(copyBtn.dataset.copyTarget);
      if(target&&navigator.clipboard){
        navigator.clipboard.writeText(target.value||target.textContent||'').then(()=>toast('복사되었습니다.'));
      }
    }
  });
  document.querySelectorAll('form').forEach(function(form){
    form.addEventListener('submit',function(){
      const btn=form.querySelector('button[type="submit"],button:not([type])');
      if(btn&&!btn.dataset.keepActive&&!btn.disabled){
        btn.dataset.originalText=btn.textContent;
        btn.disabled=true;
        btn.textContent='처리중...';
      }
    });
  });
})();
