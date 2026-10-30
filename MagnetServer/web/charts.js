'use strict';
let chartResizeObserver,chartObservedRoot,chartResizeFrame;
function chartPanel(){
 if(!['cpu','ram','network'].includes(state.chart))state.chart='cpu';
 return `<section class="panel"><div class="panel-heading"><div><h3>Resource overview</h3><p>${state.node?esc(selectedNode()?.hostname||'')+' · ':''}Last hour · 10 second intervals</p></div><div class="segmented">${[['cpu','CPU'],['ram','Memory'],['network','Network']].map(([key,label])=>button(label,'chart',state.chart===key?'active':'',`data-metric="${key}" aria-pressed="${state.chart===key}"`)).join('')}</div></div><div class="chart-wrap" id="chart"></div><div class="chart-legend" id="chart-legend"></div></section>`;
}
function drawChart(){
 const root=$('#chart');if(!root){chartResizeObserver?.disconnect();chartObservedRoot=null;return;}
 if(chartObservedRoot!==root){chartResizeObserver??=new ResizeObserver(()=>{cancelAnimationFrame(chartResizeFrame);chartResizeFrame=requestAnimationFrame(drawChart);});chartResizeObserver.disconnect();chartResizeObserver.observe(root);chartObservedRoot=root;}
 const network=state.chart==='network',styles=getComputedStyle(root),width=Math.max(120,root.clientWidth-parseFloat(styles.paddingLeft)-parseFloat(styles.paddingRight)),height=parseFloat(styles.getPropertyValue('--chart-height'))||260;
 const left=Math.min(network?90:50,width*.35),right=width-12,top=12,bottom=height-42,plotWidth=right-left,plotHeight=bottom-top,now=Date.now()/1000,start=now-3600;
 const samples=state.history.filter(sample=>Number.isFinite(sample.time)&&sample.time>=start&&sample.time<=now).sort((a,b)=>a.time-b.time);
 const value=(sample,key)=>{const metrics=sample.metrics||{};if(network&&(metrics.network_scope!=='internet-uplink-v1'||!metrics.network_ready))return null;const number=metrics[key];return typeof number==='number'&&Number.isFinite(number)&&number>=0?number:null;};
 const series=(network?[['rx','Inbound','inbound'],['tx','Outbound','outbound']]:[[state.chart,state.chart==='ram'?'Memory utilization':'CPU utilization','inbound']]).map(([key,label,color])=>({key,label,color,values:samples.map(sample=>value(sample,key))}));
 const max=network?Math.max(1,...series.flatMap(series=>series.values.filter(value=>value!==null)))*1.15:100;
 const x=time=>left+(time-start)/3600*plotWidth,y=value=>bottom-Math.max(0,Math.min(max,value))/max*plotHeight;
 const labels=[0,.25,.5,.75,1].map(f=>`<line x1="${left}" x2="${right}" y1="${bottom-f*plotHeight}" y2="${bottom-f*plotHeight}" class="chart-grid"/><text x="${left-10}" y="${bottom-f*plotHeight+4}" text-anchor="end" class="chart-label">${esc(network?bytes(max*f)+'/s':Math.round(max*f)+'%')}</text>`).join('');
 const lines=series.map(item=>{
  let path='',previous=null;
  for(let index=0;index<samples.length;index++){const v=item.values[index];if(v===null){previous=null;continue;}const gap=previous===null||samples[index].time-samples[previous].time>35;path+=(gap?'M':'L')+x(samples[index].time)+','+y(v)+' ';previous=index;}
  return `<path d="${path}" class="chart-line chart-series-${item.color}"/>`;
 }).join('');
 const ticks=Math.max(2,Math.min(5,Math.floor(plotWidth/125)+1)),times=Array.from({length:ticks},(_,index)=>{const fraction=index/(ticks-1);return `<text x="${left+fraction*plotWidth}" y="${bottom+28}" text-anchor="${index===0?'start':index===ticks-1?'end':'middle'}" class="chart-label">${esc(new Date((start+fraction*3600)*1000).toLocaleTimeString(magnetI18n.locale,{hour:'2-digit',minute:'2-digit'}))}</text>`;}).join('');
 const measured=samples.map((sample,index)=>index).filter(index=>series.some(series=>series.values[index]!==null));
 const label=magnetI18n.text(network?'Network traffic':state.chart==='ram'?'Memory utilization':'CPU utilization');
 root.innerHTML=`<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" tabindex="0" role="img" aria-label="${esc(label+'. '+magnetI18n.text('Use arrow keys to inspect recorded samples.'))}" aria-describedby="chart-tooltip">${labels}${lines}${times}<g class="chart-crosshair" hidden><line x1="0" x2="0" y1="${top}" y2="${bottom}"/>${series.map(item=>`<circle r="4" class="chart-point-${item.color}"/>`).join('')}</g></svg><div id="chart-tooltip" class="chart-tooltip" role="tooltip" hidden></div>${!measured.length?`<div class="chart-empty">${network?'Network history requires ready uplink samples from MagnetLink 0.4.9 or newer.':'Collecting resource history…'}</div>`:''}`;
 const legend=$('#chart-legend');if(legend)legend.innerHTML=series.map(item=>`<span><i class="legend-dot chart-dot-${item.color}"></i>${item.label}</span>`).join('')+'<span>Live node telemetry</span>';
 const svg=$('svg',root),crosshair=$('.chart-crosshair',root),tooltip=$('.chart-tooltip',root);let selected=-1;
 const hide=()=>{crosshair.setAttribute('hidden','');tooltip.hidden=true;selected=-1;};
 const show=(index,clientY)=>{
  if(index<0||!samples[index]){hide();return;}selected=index;const sample=samples[index],position=x(sample.time);crosshair.removeAttribute('hidden');const line=$('line',crosshair);line.setAttribute('x1',position);line.setAttribute('x2',position);
  const circles=$$('circle',crosshair);series.forEach((item,i)=>{const value=item.values[index];circles[i].toggleAttribute('hidden',value===null);if(value!==null){circles[i].setAttribute('cx',position);circles[i].setAttribute('cy',y(value));}});
  tooltip.innerHTML=`<time data-i18n-skip>${esc(new Date(sample.time*1000).toLocaleTimeString(magnetI18n.locale,{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}</time>${series.map(item=>{const v=item.values[index],text=v===null?'—':network?bytes(v)+'/s ('+v.toLocaleString(magnetI18n.locale)+' B/s)':v.toLocaleString(magnetI18n.locale,{maximumFractionDigits:12})+'%';return `<div><span>${magnetI18n.text(item.label)}</span><strong data-i18n-skip>${esc(text)}</strong></div>`;}).join('')}`;
  tooltip.hidden=false;const point=svg.createSVGPoint();point.x=position;point.y=top;const screen=point.matrixTransform(svg.getScreenCTM()),rect=root.getBoundingClientRect(),tipWidth=tooltip.offsetWidth,tipHeight=tooltip.offsetHeight;
  const preferred=screen.x-rect.left+12;tooltip.style.left=Math.max(4,Math.min(rect.width-tipWidth-4,preferred+tipWidth>rect.width-4?screen.x-rect.left-tipWidth-12:preferred))+'px';tooltip.style.top=Math.max(4,Math.min(rect.height-tipHeight-4,(clientY||rect.top+24)-rect.top+12))+'px';
 };
 root.onpointermove=event=>{if(!measured.length)return;const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;const local=point.matrixTransform(matrix.inverse());if(local.x<left||local.x>right||local.y<top||local.y>bottom){hide();return;}const nearest=measured.reduce((best,index)=>Math.abs(x(samples[index].time)-local.x)<Math.abs(x(samples[best].time)-local.x)?index:best,measured[0]);show(nearest,event.clientY);};
 root.onpointerleave=hide;svg.onblur=hide;
 svg.onkeydown=event=>{if(!measured.length||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape'){hide();return;}const current=measured.indexOf(selected),next=event.key==='Home'?0:event.key==='End'?measured.length-1:current<0?measured.length-1:Math.max(0,Math.min(measured.length-1,current+(event.key==='ArrowLeft'?-1:1)));show(measured[next]);};
}
