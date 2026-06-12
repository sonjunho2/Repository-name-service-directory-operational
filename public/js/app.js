let i=0;
const slides=[...document.querySelectorAll('.promo-slide')];
if(slides.length>1){
  setInterval(()=>{
    slides[i].classList.remove('on');
    i=(i+1)%slides.length;
    slides[i].classList.add('on');
  },2800);
}