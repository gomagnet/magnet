'use strict';
const innerSectionMotions=new WeakMap();
function cancelInnerSectionMotion(container){
 const previous=innerSectionMotions.get(container);if(previous){previous.motion?.cancel();innerSectionMotions.delete(container);}if(container)container.inert=false;
}
async function transitionInnerSection(container,update,isCurrent=()=>true){
 if(!container)return false;
 cancelInnerSectionMotion(container);
 const operation={motion:null};innerSectionMotions.set(container,operation);
 const current=()=>innerSectionMotions.get(container)===operation&&container.isConnected&&(!container.closest('dialog')||container.closest('dialog').open)&&isCurrent();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||typeof container.animate!=='function';
 try{
  if(!current())return false;
  container.inert=true;
  if(!reduced){operation.motion=container.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(-6px)'}],{duration:110,easing:'ease-in',fill:'forwards'});await operation.motion.finished.catch(()=>{});}
  if(!current())return false;
  operation.motion?.cancel();update();container.scrollTop=0;
  // Inputs are available as soon as the incoming section appears.
  container.inert=false;
  if(!reduced){operation.motion=container.animate([{opacity:0,transform:'translateX(8px)'},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'});await operation.motion.finished.catch(()=>{});}
  return current();
 }finally{if(innerSectionMotions.get(container)===operation){operation.motion?.cancel();innerSectionMotions.delete(container);container.inert=false;}}
}

document.addEventListener('keydown',event=>{
 const button=event.target.closest('.workspace-tabs.inner-section-nav button');if(!button||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const buttons=[...button.parentElement.querySelectorAll('button')].filter(item=>!item.disabled),index=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+buttons.length)%buttons.length;
 event.preventDefault();buttons[next].focus({preventScroll:true});buttons[next].click();
});
