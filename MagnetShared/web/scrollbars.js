'use strict';
// Keep native scrolling/selection and paint only the controls in the top layer.
// Without Popover/ResizeObserver support, leave the styled native fallback alone.
(()=>{
 if(typeof HTMLElement.prototype.showPopover!=='function'||typeof ResizeObserver==='undefined')return;
 const areas=new Map(),layers=new Map();let frame=0,rescan=true,sequence=0,drag=null;
 const ignored=el=>el.closest('.magnet-scroll-layer,.monaco-editor,.code-editor-source');
 const schedule=(scan=false)=>{rescan||=scan;if(!frame)frame=requestAnimationFrame(paint);};
 const resize=new ResizeObserver(()=>schedule());
 function layerFor(dialog){
  const owner=dialog||document.body;let layer=layers.get(owner);
  if(!layer){layer=document.createElement('div');layer.className='magnet-scroll-layer';layer.setAttribute('popover','manual');owner.append(layer);layers.set(owner,layer);}
  if(!layer.matches(':popover-open'))layer.showPopover();return layer;
 }
 function offset(area,axis){if(axis==='y')return area.el.scrollTop;return area.rtl?area.el.scrollWidth-area.el.clientWidth+area.el.scrollLeft:area.el.scrollLeft;}
 function scroll(area,axis,value){const max=axis==='y'?area.el.scrollHeight-area.el.clientHeight:area.el.scrollWidth-area.el.clientWidth;value=Math.max(0,Math.min(max,value));const options={behavior:'instant'};if(axis==='y')options.top=value;else options.left=area.rtl?value-max:value;area.el.scrollTo(options);schedule();}
 function railFor(area,axis){
  const rail=document.createElement('div'),thumb=document.createElement('span');rail.className='magnet-scrollbar';rail.dataset.axis=axis;rail.tabIndex=0;rail.setAttribute('role','scrollbar');rail.setAttribute('aria-controls',area.el.id);rail.setAttribute('aria-orientation',axis==='y'?'vertical':'horizontal');rail.setAttribute('aria-valuemin','0');rail.setAttribute('aria-label',(area.el.getAttribute('aria-label')||(area.el.matches('.sidebar-scroll')?'Navigation':area.el===document.scrollingElement?'Page':'Content'))+(axis==='y'?' vertical scroll':' horizontal scroll'));thumb.className='magnet-scroll-thumb';rail.append(thumb);rail.hidden=true;
  rail.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;event.preventDefault();rail.focus({preventScroll:true});const metrics=area[axis];if(!metrics?.travel)return;
   const position=axis==='y'?event.clientY:event.clientX,rect=rail.getBoundingClientRect(),start=axis==='y'?rect.top:rect.left;
   const current=offset(area,axis),thumbStart=current/metrics.max*metrics.travel;
   if(position<start+thumbStart||position>start+thumbStart+metrics.thumb)scroll(area,axis,(position-start-metrics.thumb/2)/metrics.travel*metrics.max);
   drag={area,axis,rail,pointer:event.pointerId,position,offset:offset(area,axis)};rail.classList.add('is-dragging');rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener('pointermove',event=>{if(drag?.rail!==rail)return;const metrics=area[axis],position=axis==='y'?event.clientY:event.clientX;if(metrics?.travel)scroll(area,axis,drag.offset+(position-drag.position)*metrics.max/metrics.travel);});
  const finish=()=>{if(drag?.rail===rail){rail.classList.remove('is-dragging');drag=null;}};
  rail.addEventListener('pointerup',finish);rail.addEventListener('pointercancel',finish);rail.addEventListener('lostpointercapture',finish);
  rail.addEventListener('keydown',event=>{
   const viewport=axis==='y'?area.el.clientHeight:area.el.clientWidth,current=offset(area,axis),max=area[axis]?.max||0;
   const values={ArrowDown:current+40,ArrowUp:current-40,ArrowRight:current+40,ArrowLeft:current-40,PageDown:current+viewport*.9,PageUp:current-viewport*.9,Home:0,End:max};
   if(!(event.key in values))return;event.preventDefault();scroll(area,axis,values[event.key]);
  });
  rail.addEventListener('wheel',event=>{
   const before=offset(area,axis),unit=event.deltaMode===1?16:event.deltaMode===2?(axis==='y'?area.el.clientHeight:area.el.clientWidth):1;
   scroll(area,axis,before+(axis==='y'?event.deltaY:event.deltaX||event.deltaY)*unit);
   if(offset(area,axis)!==before||getComputedStyle(area.el).overscrollBehavior.includes('contain'))event.preventDefault();
  },{passive:false});
  return rail;
 }
 function register(el){
  if(areas.has(el)||ignored(el))return;const style=getComputedStyle(el),root=el===document.scrollingElement;
  if(!root&&!/(auto|scroll)/.test(style.overflowX+' '+style.overflowY))return;
  const generated=!el.id;if(generated)el.id='magnet-scroll-area-'+(++sequence);
  const area={el,generated,rtl:style.direction==='rtl',x:null,y:null};area.rails={x:railFor(area,'x'),y:railFor(area,'y')};areas.set(el,area);el.classList.add('magnet-overlay-scroller');resize.observe(el);
 }
 function scan(){
  register(document.scrollingElement);
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT,{acceptNode:el=>ignored(el)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  for(let el=walker.nextNode();el;el=walker.nextNode())register(el);
 }
 function remove(area){for(const rail of Object.values(area.rails)){if(drag?.rail===rail)drag=null;rail.remove();}resize.unobserve(area.el);area.el.classList.remove('magnet-overlay-scroller');if(area.generated&&area.el.id.startsWith('magnet-scroll-area-'))area.el.removeAttribute('id');areas.delete(area.el);}
 function clipping(el){
  const clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
  for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
   const style=getComputedStyle(parent),rect=parent.getBoundingClientRect();
   if(/(hidden|clip|auto|scroll)/.test(style.overflowX)){clip.left=Math.max(clip.left,rect.left+parent.clientLeft);clip.right=Math.min(clip.right,rect.left+parent.clientLeft+parent.clientWidth);}
   if(/(hidden|clip|auto|scroll)/.test(style.overflowY)){clip.top=Math.max(clip.top,rect.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,rect.top+parent.clientTop+parent.clientHeight);}
  }return clip;
 }
 function paint(){
  frame=0;if(rescan){rescan=false;scan();}
  const dialogs=[...document.querySelectorAll('dialog[open]')],modal=dialogs.find(el=>el.contains(document.activeElement))||dialogs.at(-1);
  for(const area of areas.values()){
   const el=area.el;if(!el.isConnected){remove(area);continue;}
   const root=el===document.scrollingElement,dialog=el.closest('dialog'),bounds=el.getBoundingClientRect(),style=getComputedStyle(el);area.rtl=style.direction==='rtl';
   const rect=root?{left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight}:{left:bounds.left+el.clientLeft,top:bounds.top+el.clientTop,right:bounds.left+el.clientLeft+el.clientWidth,bottom:bounds.top+el.clientTop+el.clientHeight,width:el.clientWidth,height:el.clientHeight};
   const visible=(!modal||dialog===modal)&&(!dialog||dialog.open)&&(root||bounds.width>0&&bounds.height>0)&&style.visibility!=='hidden';
   const overflow={x:visible&&(root||/auto|scroll/.test(style.overflowX))&&el.scrollWidth>el.clientWidth+1,y:visible&&(root||/auto|scroll/.test(style.overflowY))&&el.scrollHeight>el.clientHeight+1};
   const clip=clipping(el);
   for(const axis of ['x','y']){
    const rail=area.rails[axis];rail.hidden=!overflow[axis];if(rail.hidden)continue;
    const vertical=axis==='y',length=Math.max(0,(vertical?rect.height:rect.width)-4-(overflow[vertical?'x':'y']?10:0));
    const size=vertical?el.clientHeight:el.clientWidth,total=vertical?el.scrollHeight:el.scrollWidth,max=total-size,thumb=Math.min(length,Math.max(28,length*size/total)),travel=length-thumb;
    const left=vertical?rect.right-10:rect.left+2,top=vertical?rect.top+2:rect.bottom-10,width=vertical?10:length,height=vertical?length:10;
    if(length<12||left+width<=clip.left||left>=clip.right||top+height<=clip.top||top>=clip.bottom){rail.hidden=true;continue;}
    const layer=layerFor(dialog);if(rail.parentElement!==layer)layer.append(rail);
    Object.assign(rail.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px',clipPath:`inset(${Math.max(0,clip.top-top)}px ${Math.max(0,left+width-clip.right)}px ${Math.max(0,top+height-clip.bottom)}px ${Math.max(0,clip.left-left)}px)`});
    area[axis]={max,thumb,travel};const value=Math.max(0,Math.min(max,offset(area,axis)));rail.setAttribute('aria-valuemax',String(max));rail.setAttribute('aria-valuenow',String(Math.round(value)));
    Object.assign(rail.firstElementChild.style,vertical?{height:thumb+'px',transform:`translateY(${max?value/max*travel:0}px)`}:{width:thumb+'px',transform:`translateX(${max?value/max*travel:0}px)`});
   }
  }
  for(const [owner,layer] of layers){if(!owner.isConnected){layer.remove();layers.delete(owner);}else if(owner.matches('dialog')&&!owner.open&&layer.matches(':popover-open'))layer.hidePopover();}
 }
 new MutationObserver(records=>{if(records.some(record=>!ignored(record.target.nodeType===1?record.target:record.target.parentElement)))schedule(true);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','open','hidden']});
 document.addEventListener('scroll',()=>schedule(),true);document.addEventListener('input',()=>schedule(),true);
 document.addEventListener('load',()=>schedule(),true);document.addEventListener('focusin',()=>schedule(),true);
 document.addEventListener('animationend',()=>schedule(),true);document.addEventListener('transitionend',()=>schedule(),true);
 document.addEventListener('magnetlanguagechange',()=>schedule(true));window.addEventListener('resize',()=>schedule(true));window.visualViewport?.addEventListener('resize',()=>schedule());
 document.fonts?.ready.then(()=>schedule());schedule(true);
})();
