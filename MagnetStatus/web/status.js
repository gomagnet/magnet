'use strict';
const root=document.querySelector('#status');
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={operational:'Operational',outage:'Major outage',degraded:'Degraded performance',maintenance:'Under maintenance',unknown:'Awaiting data',investigating:'Investigating',identified:'Identified',monitoring:'Monitoring recovery',resolved:'Resolved',scheduled:'Scheduled',in_progress:'In progress',verifying:'Verifying',completed:'Completed'};
const time=n=>new Date(n*1000).toLocaleString(magnetI18n.locale,{dateStyle:'medium',timeStyle:'short'});
const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
let lastData,loading=false,themeOverride='',historyMode='hours',lastFetchError=false;
try{themeOverride=localStorage.getItem('magnet-status-theme')||'';}catch{}
document.querySelector('#theme').addEventListener('click',()=>{const list=['auto','light','dark'];themeOverride=list[(list.indexOf(document.documentElement.dataset.theme)+1)%3];document.documentElement.dataset.theme=themeOverride;try{localStorage.setItem('magnet-status-theme',themeOverride);}catch{}});
function updateHTML(update){return `<div class="update ${escapeHTML(update.status)}"><h4>${escapeHTML(labels[update.status]||update.status)}</h4><p data-i18n-skip>${escapeHTML(update.message)}</p><time datetime="${new Date(update.time*1000).toISOString()}">${escapeHTML(time(update.time))}</time></div>`;}
function eventHTML(item,services){
 const names=item.services.map(id=>services.find(s=>s.id===id)?.name).filter(Boolean);
 const updates=[...item.updates].reverse();
 return `<article class="event ${escapeHTML(item.kind)} ${escapeHTML(item.status)}"><div class="event-state">${escapeHTML(labels[item.status]||item.status)}</div><h3 data-i18n-skip>${escapeHTML(item.title)}</h3><p class="event-meta" data-i18n-skip>${escapeHTML(names.join(' · '))}${item.kind==='maintenance'?`<br>${escapeHTML(time(item.start))} – ${escapeHTML(time(item.end))}`:''}</p><div class="timeline">${updates[0]?updateHTML(updates[0]):''}</div>${updates.length>1?`<details id="event-${escapeHTML(item.id)}"><summary>${updates.length-1} earlier updates</summary><div class="timeline">${updates.slice(1).map(updateHTML).join('')}</div></details>`:''}</article>`;
}
function serviceHTML(service,stale){
 if(service.kind==='server'){
  const status=stale?'unknown':service.status;
  return `<article class="service"><div class="service-title"><h3 data-i18n-skip>${escapeHTML(service.name)}</h3><span class="state ${escapeHTML(status)}">${escapeHTML(labels[status]||'Unknown')}</span></div><p class="service-description">Live server availability · Link heartbeat</p><div class="history-labels"><span>${service.last_seen?magnetI18n.text('Last heartbeat')+': '+escapeHTML(time(service.last_seen)):'Awaiting first heartbeat'}</span><span>${stale?'Status data is outdated':'Current availability; uptime history is not collected'}</span></div></article>`;
 }

 const hourly=historyMode==='hours',resolution=hourly?3600:86400,current=Math.floor(Date.now()/1000/resolution)*resolution;
 const history=new Map((hourly?service.hourly_history||[]:service.history||[]).map(bucket=>[hourly?bucket.hour:bucket.day,bucket]));let checks=0,failures=0;
 const bars=Array.from({length:90},(_,i)=>{
  const timestamp=current-(89-i)*resolution,item=history.get(timestamp);let status='unknown',text='No checks';
  if(item?.checks){checks+=item.checks;failures+=item.failures;status=item.failures===0?'operational':item.failures===item.checks?'outage':'degraded';text=`${((item.checks-item.failures)/item.checks*100).toFixed(2)}% uptime · ${item.checks} checks · ${Math.round(item.latency_ms/item.checks)} ms average`;}
  const date=new Date(timestamp*1000),label=hourly?date.toLocaleString(magnetI18n.locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}):date.toLocaleDateString(magnetI18n.locale);
  const title=`${label}: ${magnetI18n.text(text)}`;
  return `<span class="history-bucket ${status}" title="${escapeHTML(title)}" aria-label="${escapeHTML(title)}"></span>`;
 }).join('');
 const status=stale?'unknown':service.status;
 return `<article class="service"><div class="service-title"><h3 data-i18n-skip>${escapeHTML(service.name)}</h3><span class="state ${escapeHTML(status)}">${escapeHTML(labels[status]||'Unknown')}</span></div>${service.description?`<p class="service-description" data-i18n-skip>${escapeHTML(service.description)}</p>`:''}<div class="history" role="img" aria-label="${hourly?'90-hour check history; hover over each hour for details':'90-day check history; hover over each day for details'}">${bars}</div><div class="history-labels"><span>${hourly?'90 hours ago':'90 days ago'}</span><span>${checks?((checks-failures)/checks*100).toFixed(2)+'% uptime':'No check history'} · ${service.checked&&!stale?service.latency_ms+' ms':'Awaiting checks'}</span><span>${hourly?'Now':'Today'}</span></div></article>`;
}
function render(data,fetchError=false){
 lastFetchError=fetchError;
 const focusedMode=root.contains(document.activeElement)?document.activeElement.dataset.historyMode:null;
 const opened=[...root.querySelectorAll('details[open]')].map(el=>el.id);
 const stale=Date.now()/1000-data.generated>90;
 const severity={operational:0,unknown:1,degraded:2,maintenance:3,outage:4};
 const overall=stale||!data.services.length?'unknown':data.services.reduce((status,s)=>severity[s.status]>severity[status]?s.status:status,'operational');
 const overallLabels={operational:'All systems operational',outage:'Some systems are experiencing an outage',degraded:'Some systems are experiencing issues',maintenance:'Scheduled maintenance in progress',unknown:'Status information is incomplete'};
 const active=data.incidents.filter(i=>!['resolved','completed','scheduled'].includes(i.status));
 const scheduled=data.incidents.filter(i=>i.status==='scheduled');
 const past=data.incidents.filter(i=>['resolved','completed'].includes(i.status));
 document.title=data.title+' · '+magnetI18n.text('Status');document.documentElement.dataset.theme=themeOverride||data.theme;
 if(/^#[0-9a-f]{6}$/i.test(data.accent))document.documentElement.style.setProperty('--accent',data.accent);
 const events=`<section aria-label="Incidents & maintenance"><div class="section-label"><h2>Incidents & maintenance</h2></div>${active.map(i=>eventHTML(i,data.services)).join('')}${scheduled.length?'<div class="section-label"><h2>Upcoming maintenance</h2></div>'+scheduled.map(i=>eventHTML(i,data.services)).join(''):''}${past.length?'<div class="section-label"><h2>Past incidents & maintenance</h2></div>'+past.map(i=>eventHTML(i,data.services)).join(''):''}${!data.incidents.length?'<p class="empty">No incidents or maintenance reported.</p>':''}</section>`;
 const controls=`<div class="history-controls"><span>${historyMode==='hours'?'Uptime over the past 90 hours':'Uptime over the past 90 days'}</span><div class="history-switch" role="group" aria-label="History view"><button type="button" data-history-mode="hours" aria-pressed="${historyMode==='hours'}">Hours</button><button type="button" data-history-mode="days" aria-pressed="${historyMode==='days'}">Days</button></div></div>`;
 root.innerHTML=`<header>${safeURL(data.logo)?`<img src="${escapeHTML(safeURL(data.logo))}" alt="" referrerpolicy="no-referrer">`:''}<div><h1 data-i18n-skip>${escapeHTML(data.title)}</h1>${data.description?`<p class="description" data-i18n-skip>${escapeHTML(data.description)}</p>`:''}</div>${safeURL(data.website)?`<a href="${escapeHTML(safeURL(data.website))}" rel="noreferrer">Visit website ↗</a>`:''}</header><section class="overall ${overall}" aria-live="polite"><span class="signal" aria-hidden="true">${overall==='operational'?'✓':overall==='maintenance'?'◷':'!'}</span><div><h2>${overallLabels[overall]}</h2><p>Last checked ${escapeHTML(time(data.generated))}</p></div></section>${stale||fetchError?'<p class="delayed" role="status">Updates are delayed. Retrying automatically. Historical results and notices below were last received at '+escapeHTML(time(data.generated))+'.</p>':''}${events}<div class="section-label"><h2>Services</h2>${controls}</div><section class="services">${data.services.length?data.services.map(s=>serviceHTML(s,stale)).join(''):'<p class="empty">No services have been published yet.</p>'}</section>`;

 for(const id of opened){const el=document.getElementById(id);if(el)el.open=true;}
 if(focusedMode)root.querySelector(`[data-history-mode="${focusedMode}"]`)?.focus({preventScroll:true});
 document.querySelector('#footer-text').textContent=data.footer||'';
}
async function refresh(){
 if(loading)return;loading=true;
 try{const response=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Unavailable');const data=await response.json();if(data.version!==1)throw Error('Unsupported status version');lastData=data;render(data);}
 catch{if(lastData)render(lastData,true);else root.innerHTML='<section class="notice" role="status"><h1>Status temporarily unavailable</h1><p>We cannot retrieve service status right now. This page will retry automatically.</p></section>';}
 finally{loading=false;}
}
refresh();setInterval(refresh,15000);

root.addEventListener('click',event=>{const button=event.target.closest('[data-history-mode]');if(!button||!['hours','days'].includes(button.dataset.historyMode)||!lastData)return;historyMode=button.dataset.historyMode;render(lastData,lastFetchError);root.querySelector(`[data-history-mode="${historyMode}"]`)?.focus({preventScroll:true});});
document.addEventListener('magnetlanguagechange',()=>{if(lastData)render(lastData,lastFetchError);});
