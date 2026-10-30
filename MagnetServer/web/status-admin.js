'use strict';
const statusAdmin={node:'',pages:[],services:[],incidents:[],page:'',loaded:false,error:'',pending:null,version:0,drafts:new Map(),filter:''};
const statusNames={operational:'Operational',outage:'Outage',unknown:'Awaiting data',degraded:'Degraded',maintenance:'Maintenance',scheduled:'Scheduled',in_progress:'In progress',verifying:'Verifying',completed:'Completed',investigating:'Investigating',identified:'Identified',monitoring:'Monitoring recovery',resolved:'Resolved'};
function statusBase(node=state.node){return '/nodes/'+encodeURIComponent(node);}
function statusPageBase(page=statusAdmin.page){return '/monitorings/'+encodeURIComponent(page);}
function statusPageURL(id='',section='general'){return '#status-pages'+(id?'/'+encodeURIComponent(id)+'/'+section:'');}
function ensureStatusContext(){
 const page=state.page==='monitorings'?(state.statusPage||''):'';
 if(statusAdmin.node!==state.node||statusAdmin.page!==page){Object.assign(statusAdmin,{node:state.node,services:[],incidents:[],page,loaded:false,error:'',pending:null,version:statusAdmin.version+1});}
}
function statusOwnerName(service){return service.node_id?(state.nodes.find(n=>n.id===service.node_id)?.hostname||magnetI18n.text('Server')):magnetI18n.text('Custom service');}
function statusServiceBase(node=state.node,page=statusAdmin.page){return node?statusBase(node)+'/status-services':statusPageBase(page)+'/services';}
function statusServiceTable(services){
 return `<section class="panel status-admin-panel"><div class="panel-heading"><h3>${state.node?'Services':'Custom services'}</h3><span class="hint">${state.node?'Owned by this server; reusable in workspace status pages':'Owned by this status page; no server required'}</span></div><div class="table-scroll"><table><thead><tr><th>Service</th><th>Status</th><th>Interval</th><th>Last check</th><th>Actions</th></tr></thead><tbody>${services.map(s=>`<tr><td><strong data-i18n-skip>${esc(s.name)}</strong><div class="hint" data-i18n-skip>${esc(s.description)}</div></td><td>${badge(s.state==='operational'?'online':s.state==='outage'?'offline':'unknown',!s.enabled?'Paused':statusNames[s.state]||s.state)}</td><td>${s.interval}s</td><td>${s.checked?esc(ago(s.checked))+' · '+s.latency_ms+' ms':'Not checked yet'}</td><td><div class="inline-controls">${button('Edit','status-edit-service','',`data-id="${esc(s.id)}"`)}${button('Delete','status-delete-service','danger',`data-id="${esc(s.id)}"`)}</div></td></tr>`).join('')||'<tr><td colspan="5">No services yet. Add an HTTP, Minecraft Java, or custom HTTP check.</td></tr>'}</tbody></table></div></section>`;
}
function statusServerServicesPage(){
 ensureStatusContext();
 return `<div class="page-actions">${button('New service','status-new-service','primary')}</div>${statusAdmin.error?'<p class="error" role="status">'+esc(statusAdmin.error)+' · Retrying automatically.</p>':''}${statusAdmin.loaded?statusServiceTable(statusAdmin.services):'<p class="hint" role="status">Loading services…</p>'}`;
}
function statusMonitoringsPage(){
 ensureStatusContext();
 if(!statusAdmin.loaded)return '<p class="hint" role="status">Loading status pages…</p>';
 const page=statusAdmin.pages.find(p=>p.id===statusAdmin.page);
 const error=statusAdmin.error?`<p class="error" role="status">${esc(statusAdmin.error)} · Retrying automatically.</p>`:'';
 if(!statusAdmin.page)return error+statusPagesTable();
 if(!page)return error+`<section class="panel"><div class="section-body"><p class="hint">This status page is no longer available.</p><a href="#status-pages">All status pages →</a></div></section>`;
 const section=state.statusTab||'general',draft=statusAdmin.drafts.get(page.id)||page,manage=canAccess('monitoring',page.id,true);
 const tabs=[['general','General'],['appearance','Appearance'],['services','Services'],['incidents','Incidents & maintenance'],['installation','Installation']];
 return error+`<div class="page-actions status-detail-actions"><a class="context-link" href="#status-pages">← All status pages</a><span class="status-page-name" data-i18n-skip>${esc(page.name)}</span>${button('Preview','status-preview')}</div><div class="status-workspace"><nav class="status-section-nav inner-section-nav" aria-label="Status page settings">${tabs.map(([key,label])=>`<a href="${esc(statusPageURL(page.id,key))}" data-status-tab="${key}" ${section===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="status-detail-content">${!manage?'<p class="notice">You have view access. A page manager can change these settings.</p>':''}${statusSettingsForm(draft,manage,section)}<section data-status-section="incidents" ${section!=='incidents'?'hidden':''}>${statusIncidentsPanel()}</section><section data-status-section="installation" ${section!=='installation'?'hidden':''}><section class="panel"><div class="settings-section"><h3>Host your status page</h3><p>Install MagnetStatus on a host with access to MagnetServer. It displays this page using a read-only API key.</p><ol class="status-install-steps"><li>Copy the MagnetStatus executable to your host.</li><li>Generate an install command and run it on that host.</li><li>Point your public domain to the renderer with HTTPS.</li></ol>${manage?button('Generate install command','status-install','primary'):''}<p class="hint">Generating a new command revokes the previous renderer key.</p></div></section>${manage?`<section class="panel editor-panel"><div class="settings-section"><h3>Delete status page</h3><p>This removes the page, its custom services, incidents and history. Server services remain.</p>${button('Delete status page','status-delete-page','danger')}</div></section>`:''}</section></div></div>`;
}
function statusPagesTable(){
 const pages=statusAdmin.pages,filter=statusAdmin.filter.toLowerCase();
 return `<div class="page-actions">${button('New status page','status-new-page','primary')}</div><section class="panel"><div class="toolbar"><div><h3>Status pages <span class="text-muted">${pages.length}</span></h3><p>Open a page to manage its services, appearance and updates.</p></div><div class="toolbar-actions"><input id="status-page-search" aria-label="Search status pages" placeholder="Search status pages…" value="${esc(statusAdmin.filter)}"></div></div>${pages.length?`<div class="table-scroll"><table><thead><tr><th>Status page</th><th>Servers</th><th>Published services</th><th>Access</th><th></th></tr></thead><tbody>${pages.map(p=>`<tr class="server-row" data-status-row="${esc(p.id)}" data-search="${esc((p.name+' '+p.settings.title).toLowerCase())}" tabindex="0" ${!(p.name+' '+p.settings.title).toLowerCase().includes(filter)?'hidden':''}><td><div class="server-name"><span class="server-glyph">${icon('globe',18)}</span><div><a class="server-link" data-i18n-skip href="${esc(statusPageURL(p.id))}">${esc(p.name)}</a><small data-i18n-skip>${esc(p.settings.title)}</small></div></div></td><td>${p.nodes.length}</td><td>${p.services.length}</td><td>${badge('neutral',canAccess('monitoring',p.id,true)?'Can manage':'View only')}</td><td><a class="context-link" href="${esc(statusPageURL(p.id))}" aria-label="Open status page">${icon('arrow',18)}</a></td></tr>`).join('')}<tr id="status-no-match" ${pages.some(p=>(p.name+' '+p.settings.title).toLowerCase().includes(filter))?'hidden':''}><td colspan="5">No matching status pages.</td></tr></tbody></table></div>`:empty('globe','No status pages yet','Create a page, choose its services and install MagnetStatus.','status-new-page','Create status page')}<div class="table-foot"><span>Status pages update automatically.</span></div></section>`;
}
function statusSettingsForm(p,manage,section){
 const s=p.settings,ordered=[...p.services,...statusAdmin.services.filter(service=>service.node_id||service.page_id===p.id).map(service=>service.id).filter(id=>!p.services.includes(id))];
 const servers=[...state.nodes,...p.nodes.filter(id=>!state.nodes.some(n=>n.id===id)).map(id=>({id,hostname:magnetI18n.text('Linked server (restricted)')}))];
 return `<form id="status-page-form" data-inline="true" data-id="${esc(p.id)}" data-node=""><fieldset class="status-settings-fields" ${!manage?'disabled':''}><section class="panel" data-status-section="general" ${section!=='general'?'hidden':''}><div class="settings-section"><h3>Page details</h3><p>Choose how this page is identified in your workspace and on the public website.</p><div class="form-grid"><label>Internal name<input name="name" value="${esc(p.name)}" maxlength="120" required></label><label>Public title<input name="title" value="${esc(s.title)}" maxlength="120" required></label></div><label>Description<textarea name="description" maxlength="1000">${esc(s.description)}</textarea></label></div></section><section class="panel" data-status-section="appearance" ${section!=='appearance'?'hidden':''}><div class="settings-section"><h3>Brand & appearance</h3><p>Match the public page to your website.</p><div class="form-grid"><label>Accent color<input type="color" name="accent" value="${esc(s.accent)}"></label><label>Default theme<select name="theme">${[['auto','Automatic'],['light','Light'],['dark','Dark']].map(([value,label])=>`<option value="${value}" ${s.theme===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Website (HTTPS)<input name="website" type="url" value="${esc(s.website)}" maxlength="2000"></label><label>Logo URL (HTTPS)<input name="logo" type="url" value="${esc(s.logo)}" maxlength="2000"></label></div><label>Footer<input name="footer" value="${esc(s.footer)}" maxlength="300"></label></div></section><section data-status-section="services" ${section!=='services'?'hidden':''}><section class="panel"><div class="settings-section"><h3>Linked servers</h3><p>Choose servers whose services this status page can publish.</p><label class="check"><input type="checkbox" name="show_server_status" ${s.show_server_status?'checked':''}><span>Self server status</span></label><p class="hint">Publish online/offline availability for each linked server, using its Link heartbeat. Server names will be public. This does not measure external reachability or historical uptime.</p><div id="status-server-list" class="status-server-list">${servers.map(n=>`<label class="status-server-choice"><input type="checkbox" name="nodes" value="${esc(n.id)}" ${p.nodes.includes(n.id)?'checked':''}><span data-i18n-skip>${esc(n.hostname)}</span>${canAccess('server',n.id)?`<a href="${esc(pageURL('services',n.id))}" aria-label="Manage server services">${icon('arrow',16)}</a>`:''}</label>`).join('')||'<p class="hint">No servers available. You can create custom services below.</p>'}</div></div><div class="settings-section"><h3>Published services & order</h3><p>Check services to publish. Drag rows or use the arrows to change their order.</p><div id="status-order-list">${ordered.map(id=>{const service=statusAdmin.services.find(service=>service.id===id);return service?`<div class="status-order-row" draggable="${manage}" data-service="${esc(id)}" data-node="${esc(service.node_id||'')}"><span class="text-muted" aria-hidden="true">⠿</span><label class="check"><input type="checkbox" name="services" value="${esc(id)}" ${p.services.includes(id)?'checked':''}><span><strong data-i18n-skip>${esc(service.name)}</strong><small class="text-muted" data-i18n-skip>${esc(statusOwnerName(service))}</small></span></label><button type="button" data-status-move="-1" aria-label="Move service up">↑</button><button type="button" data-status-move="1" aria-label="Move service down">↓</button></div>`:'';}).join('')||'<p class="hint">Create a service to get started.</p>'}</div></div></section><div class="page-actions">${manage?button('New custom service','status-new-service','primary'):''}</div>${statusServiceTable(statusAdmin.services.filter(service=>service.page_id===p.id))}</section></fieldset>${manage?`<div class="status-savebar" data-status-savebar ${!['general','appearance','services'].includes(section)?'hidden':''}><span id="status-save-state" class="hint" role="status">${statusAdmin.drafts.has(p.id)?'Unsaved changes':'All changes saved'}</span><p class="error" id="status-form-error" role="alert"></p><button type="submit" class="primary">Save changes</button></div>`:''}</form>`;
}
function statusIncidentsPanel(){
 return `<section class="panel"><div class="toolbar"><h3>Incidents & maintenance</h3><div class="inline-controls">${button('Report incident','status-new-incident')}${button('Schedule maintenance','status-new-maintenance')}</div></div>${statusAdmin.incidents.length?`<div class="table-scroll"><table><thead><tr><th>Title</th><th>Type</th><th>Lifecycle</th><th>Last update</th><th>Actions</th></tr></thead><tbody>${statusAdmin.incidents.map(i=>`<tr><td><strong data-i18n-skip>${esc(i.title)}</strong></td><td>${i.kind==='maintenance'?'Maintenance':'Incident'}</td><td>${badge(['resolved','completed'].includes(i.status)?'online':'neutral',statusNames[i.status]||i.status)}</td><td data-i18n-skip>${esc(new Date(i.updated*1000).toLocaleString(magnetI18n.locale))}</td><td><div class="inline-controls">${!['resolved','completed'].includes(i.status)?button('Post update','status-edit-incident','',`data-id="${esc(i.id)}"`):''}${button('History','status-incident-history','',`data-id="${esc(i.id)}"`)}${button('Delete','status-delete-incident','danger',`data-id="${esc(i.id)}"`)}</div></td></tr>`).join('')}</tbody></table></div>`:'<div class="section-body"><p class="hint">No incidents or maintenance reported.</p></div>'}</section>`;
}
function statusCaptureDraft(){
 const form=$('#status-page-form[data-inline]');if(!form||!canAccess('monitoring',form.dataset.id,true))return;
 const data=new FormData(form),page=statusAdmin.pages.find(page=>page.id===form.dataset.id);if(!page)return;
 const draft={...page,name:data.get('name'),settings:{...page.settings,show_server_status:data.has('show_server_status'),...Object.fromEntries(['title','description','accent','theme','website','logo','footer'].map(key=>[key,data.get(key)]))},nodes:data.getAll('nodes'),services:data.getAll('services')};
 const comparable=value=>JSON.stringify([value.name,['title','description','accent','theme','website','logo','footer'].map(key=>value.settings[key]||''),Boolean(value.settings.show_server_status),[...value.nodes].sort(),value.services]);
 const dirty=comparable(draft)!==comparable(page);if(dirty)statusAdmin.drafts.set(page.id,draft);else statusAdmin.drafts.delete(page.id);
 const notice=$('#status-save-state');if(notice)notice.textContent=dirty?'Unsaved changes':'All changes saved';
}
async function switchStatusInnerSection(route,version){
 const content=$('.status-detail-content');if(!content)return;
 statusCaptureDraft();state.statusTab=route.statusTab||'general';
 for(const link of $$('[data-status-tab]')){if(link.dataset.statusTab===state.statusTab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 const section=state.statusTab;
 await transitionInnerSection(content,()=>{
  for(const panel of $$('[data-status-section]',content))panel.hidden=panel.dataset.statusSection!==section;
  const savebar=$('[data-status-savebar]',content);if(savebar)savebar.hidden=!['general','appearance','services'].includes(section);
 },()=>version===navigationVersion);
}
async function loadStatusMonitorings(force=false){
 if(!['monitorings','services'].includes(state.page)||!state.authenticated)return;
 ensureStatusContext();
 if(force){statusAdmin.version++;statusAdmin.pending=null;}
 const node=state.node,screen=state.page,version=statusAdmin.version,page=statusAdmin.page;
 if(statusAdmin.pending)return statusAdmin.pending;
 const current=()=>state.node===node&&state.page===screen&&statusAdmin.version===version&&statusAdmin.page===page;
 const task=(async()=>{try{
  if(node){const services=await api(statusServiceBase(node));if(!current())return;Object.assign(statusAdmin,{services,loaded:true,error:''});return;}
  const [pages,serverServices]=await Promise.all([api('/monitorings'),api('/status-services')]);if(!current())return;
  const selected=pages.some(p=>p.id===page)?page:'';
  const [customServices,incidents]=selected?await Promise.all([api(statusPageBase(selected)+'/services'),api(statusPageBase(selected)+'/incidents')]):[[],[]];if(!current())return;
  Object.assign(statusAdmin,{pages,services:[...serverServices,...customServices],incidents,loaded:true,error:''});
 }catch(error){if(current())statusAdmin.error=error.message;}finally{
  if(statusAdmin.pending===task)statusAdmin.pending=null;
  if(state.page===screen&&state.node===node&&statusAdmin.version===version)paintStatusMonitorings();
 }})();statusAdmin.pending=task;return task;
}
function paintStatusMonitorings(){
 const content=$('.status-detail-content');if(content&&innerSectionMotions.has(content))return;
 statusCaptureDraft();
 const focused=document.activeElement,inside=$('#main').contains(focused),action=focused?.dataset.action,id=focused?.dataset.id,focusedTab=focused?.dataset.statusTab;
 if(inside&&focused.matches('input,textarea,select'))return;
 render();
 if(inside&&focusedTab)$$('[data-status-tab]').find(link=>link.dataset.statusTab===focusedTab)?.focus({preventScroll:true});
 if(inside&&action){const replacement=$$('#main [data-action]').find(el=>el.dataset.action===action&&el.dataset.id===id);replacement?.focus({preventScroll:true});}
}
function statusPageForm(id=''){
 if(id){location.hash=statusPageURL(id);return;}
 modal('Create status page',`<form id="status-page-form" data-id="" data-node=""><label>Internal name<input name="name" maxlength="120" required autofocus></label><label>Public title<input name="title" maxlength="120" required></label><p class="hint">You can choose servers, add custom services and customize the page after creating it.</p><p class="error" id="status-form-error" role="alert"></p><div class="form-actions"><button type="submit" class="primary">Create status page</button></div></form>`,'status-form');
}
async function statusServiceForm(id=''){
 const node=state.node,page=statusAdmin.page,screen=state.page,version=modalVersion;
 if(!node&&!page){toast('Create a status page first.');return;}
 let service={id:'',name:'',description:'',enabled:true,interval:60,config:{kind:'http',target:'',method:'GET',headers:{},body:'',expected_status:0,match:'',value:'',json_path:''}};
 if(id){service=await api(statusServiceBase(node,page)+'/'+encodeURIComponent(id));if(state.node!==node||state.page!==screen||statusAdmin.page!==page||modalVersion!==version)return;}
 const c=service.config;
 modal(id?'Edit service':node?'Create server service':'Create custom service',`<form id="status-service-form" data-id="${esc(id)}" data-node="${esc(node)}" data-page="${esc(page)}"><div class="form-grid"><label>Name<input name="name" value="${esc(service.name)}" maxlength="120" required></label><label>Check type<select name="kind" id="status-check-kind">${[['http','Website HTTP(S)'],['minecraft','Minecraft Java'],['custom','Custom HTTP request']].map(([value,label])=>`<option value="${value}" ${c.kind===value?'selected':''}>${label}</option>`).join('')}</select></label></div><label>Public description<input name="description" value="${esc(service.description)}" maxlength="500"></label><label>Target<input name="target" value="${esc(c.target)}" maxlength="2000" placeholder="https://example.com/health or mc.example.com[:port]" required></label><p class="hint">Checks run from MagnetServer, with a 10-second timeout. Redirects are disabled. Minecraft Java uses the default port and _minecraft._tcp SRV record when available; append :port for a custom port.</p><div class="form-grid"><label>Interval (seconds)<input name="interval" type="number" min="30" max="3600" value="${service.interval}" required></label><label class="check"><input name="enabled" type="checkbox" ${service.enabled?'checked':''}>Enable check</label></div><div id="status-http-options"><label>Expected HTTP status<input name="expected_status" type="number" min="0" max="599" value="${c.expected_status||0}"></label><p class="hint">0 accepts any 2xx response.</p></div><div id="status-custom-options"><div class="form-grid"><label>Method<select name="method">${['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].map(m=>`<option ${c.method===m?'selected':''}>${m}</option>`).join('')}</select></label><label>Response validation<select name="match">${[['','Status code only'],['equal','Equals'],['not_equal','Does not equal'],['contains','Contains'],['not_contains','Does not contain'],['starts_with','Starts with'],['ends_with','Ends with']].map(([value,label])=>`<option value="${value}" ${c.match===value?'selected':''}>${label}</option>`).join('')}</select></label></div><label>Request headers (JSON object)<textarea name="headers" spellcheck="false">${esc(JSON.stringify(c.headers||{},null,2))}</textarea></label><label>Request body<textarea name="body" maxlength="65536" spellcheck="false">${esc(c.body)}</textarea></label><label>JSON pointer (optional)<input name="json_path" value="${esc(c.json_path)}" placeholder="/data/healthy" maxlength="512"></label><p class="hint">Leave empty to validate raw text. Use /data/items/0/status for JSON. Escape / as ~1 and ~ as ~0 in property names. Strings match as text; other values match their JSON form.</p><label>Expected value<textarea name="value" maxlength="16384">${esc(c.value)}</textarea></label></div><p class="hint">Targets, request bodies, headers and validation values are encrypted at rest and never published on the status page. Only enter trusted destinations.</p><p class="error" id="status-form-error" role="alert"></p><div class="form-actions"><button type="submit" class="primary">Save service</button></div></form>`,'status-form');statusCheckFields();
}
function statusCheckFields(){const kind=$('#status-check-kind')?.value;if($('#status-custom-options'))$('#status-custom-options').hidden=kind!=='custom';if($('#status-http-options'))$('#status-http-options').hidden=kind==='minecraft';}
function statusIncidentForm(id='',kind='incident'){
 const item=statusAdmin.incidents.find(i=>i.id===id)||{id:'',kind,title:'',status:kind==='maintenance'?'scheduled':'investigating',impact:'degraded',services:[],start:Math.floor(Date.now()/1000)+3600,end:Math.floor(Date.now()/1000)+7200};
 const page=statusAdmin.pages.find(p=>p.id===statusAdmin.page);if(!page?.services.length){toast('Select published services before creating an incident.');return;}
 const stages=item.kind==='maintenance'?['scheduled','in_progress','verifying','completed']:['investigating','identified','monitoring','resolved'];
 const local=n=>{const d=new Date(n*1000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 modal(id?'Post lifecycle update':item.kind==='maintenance'?'Schedule maintenance':'Report incident',`<form id="status-incident-form" data-id="${esc(id)}" data-page="${esc(page.id)}" data-node="${esc(state.node)}" data-kind="${esc(item.kind)}"><label>Title<input name="title" value="${esc(item.title)}" maxlength="200" required></label><div class="form-grid"><label>Lifecycle<select name="status">${stages.map((s,n)=>`<option value="${s}" ${s===item.status?'selected':''} ${n<stages.indexOf(item.status)?'disabled':''}>${esc(statusNames[s])}</option>`).join('')}</select></label><label>Impact<select name="impact"><option value="degraded" ${item.impact==='degraded'?'selected':''}>Degraded performance</option><option value="outage" ${item.impact==='outage'?'selected':''}>Major outage</option></select></label></div>${item.kind==='maintenance'?`<div class="form-grid"><label>Starts (your local time)<input type="datetime-local" name="start" value="${local(item.start)}" required></label><label>Ends (your local time)<input type="datetime-local" name="end" value="${local(item.end)}" required></label></div><p class="hint">Scheduled maintenance starts and completes automatically at these times. You can post updates or finish it early.</p>`:''}<h3>Affected services</h3>${page.services.map(id=>{const s=statusAdmin.services.find(s=>s.id===id);return s?`<label class="check"><input type="checkbox" name="services" value="${esc(id)}" ${item.services.includes(id)?'checked':''}>${esc(s.name)} · ${esc(statusOwnerName(s))}</label>`:'';}).join('')}<label>Public update<textarea name="message" maxlength="5000" required></textarea></label><p class="hint">Updates append to the public timeline. Lifecycle stages only move forwards.</p><p class="error" id="status-form-error" role="alert"></p><div class="form-actions"><button type="submit" class="primary">Publish update</button></div></form>`,'status-form');
}
async function statusInstall(){
 const page=statusAdmin.page,node=state.node,version=modalVersion;
 const result=await post(statusPageBase(page,node)+'/key',{});
 if(state.node!==node||state.page!=='monitorings'||statusAdmin.page!==page||modalVersion!==version)return;
 modal('Install MagnetStatus',`<p class="hint">Place the MagnetStatus Linux executable on the host for this page, then run this command. The renderer listens on port 8081; put it behind your HTTPS reverse proxy or configure its own certificate.</p><pre class="code-box" id="status-install-command"></pre><p class="notice">Save this command now. The API key is only shown here. It can read this status page’s public data. Any previous renderer key has been revoked.</p><div class="form-actions">${button('Copy command','status-copy-command','primary')}</div>`,'status-install');$('#status-install-command').textContent=result.command;
}
function registerStatusActions(){Object.assign(actions,{
 'status-new-page':()=>statusPageForm(),
 'status-edit-page':el=>statusPageForm(el.dataset.id),
 'status-new-service':()=>statusServiceForm(),
 'status-edit-service':el=>statusServiceForm(el.dataset.id),
 'status-open-page':el=>{location.hash=statusPageURL(el.dataset.id);},
 'status-install':()=>modal('Generate a renderer install command?',`<p class="hint">This creates a new read-only API key and immediately revokes any previous renderer key for this status page.</p><div class="form-actions">${button('Generate command','status-generate-command','primary')}</div>`),
 'status-generate-command':statusInstall,
 'status-copy-command':()=>navigator.clipboard.writeText($('#status-install-command').textContent).then(()=>toast('Command copied')),
 'status-delete-page':()=>{const node=state.node,id=statusAdmin.page;confirmAction('Delete status page?','Its API key, custom services, their history, incidents and maintenance will be removed. Server-owned service checks remain.',async()=>{await api(statusPageBase(id,node),{method:'DELETE'});if(state.node===node){statusAdmin.drafts.delete(id);location.hash=statusPageURL();}});},
 'status-delete-service':el=>{const node=state.node,page=statusAdmin.page,id=el.dataset.id;confirmAction('Delete service?',node?'This removes the server check and its uptime history from every status page that uses it.':'This removes this status page’s custom check and its uptime history.',async()=>{await api(statusServiceBase(node,page)+'/'+encodeURIComponent(id),{method:'DELETE'});if(state.node===node&&statusAdmin.page===page)await loadStatusMonitorings(true);});},
 'status-new-incident':()=>statusIncidentForm(),
 'status-new-maintenance':()=>statusIncidentForm('','maintenance'),
 'status-edit-incident':el=>statusIncidentForm(el.dataset.id),
 'status-incident-history':el=>{const i=statusAdmin.incidents.find(i=>i.id===el.dataset.id);if(i)modal(i.title,i.updates.slice().reverse().map(u=>`<div class="status-timeline ${esc(u.status)}"><strong>${esc(statusNames[u.status]||u.status)}</strong><small>${esc(new Date(u.time*1000).toLocaleString(magnetI18n.locale))}</small><p data-i18n-skip>${esc(u.message)}</p></div>`).join(''),'',true);},
 'status-delete-incident':el=>{const node=state.node,page=statusAdmin.page,id=el.dataset.id;confirmAction('Delete this record?','This permanently removes this incident or maintenance and its public timeline.',async()=>{await api(statusPageBase(page,node)+'/incidents/'+encodeURIComponent(id),{method:'DELETE'});if(state.node===node)await loadStatusMonitorings(true);});},
 'status-preview':async()=>{const node=state.node,page=statusAdmin.page,version=modalVersion;const data=await api(statusPageBase(page,node)+'/preview');if(state.node!==node||statusAdmin.page!==page||version!==modalVersion)return;modal(data.title,`<p class="hint" data-i18n-skip>${esc(data.description)}</p>${data.services.map(s=>`<div class="health-row"><strong data-i18n-skip>${esc(s.name)}</strong>${badge(s.status==='operational'?'online':s.status==='outage'?'offline':'unknown',statusNames[s.status]||s.status)}</div>`).join('')||'<p class="hint">No published services.</p>'}<p class="hint">${esc(data.footer)}</p><p class="hint">The installed MagnetStatus renderer shows hourly history by default, with a daily view and incident timelines.</p>`,'',true);}
 });}
function statusFilterServices(capture=true){
 const form=$('#status-page-form');if(!form)return;const nodes=new Set(new FormData(form).getAll('nodes'));
 for(const row of $$('#status-order-list .status-order-row')){row.hidden=Boolean(row.dataset.node)&&!nodes.has(row.dataset.node);if(row.hidden)row.querySelector('input').checked=false;}
 if(capture&&form.dataset.inline)statusCaptureDraft();
}
document.addEventListener('change',event=>{if(event.target.id==='status-check-kind')statusCheckFields();if(event.target.matches('#status-server-list input'))statusFilterServices();if(event.target.closest('#status-page-form[data-inline]'))statusCaptureDraft();});
document.addEventListener('click',event=>{const b=event.target.closest('[data-status-move]');if(!b)return;const row=b.closest('.status-order-row');let adjacent=Number(b.dataset.statusMove)<0?row.previousElementSibling:row.nextElementSibling;while(adjacent?.hidden)adjacent=Number(b.dataset.statusMove)<0?adjacent.previousElementSibling:adjacent.nextElementSibling;if(adjacent){if(Number(b.dataset.statusMove)<0)adjacent.before(row);else adjacent.after(row);statusCaptureDraft();b.focus();}});
let statusDragged;
document.addEventListener('dragstart',event=>{const row=event.target.closest('.status-order-row');if(!row||!row.draggable)return;statusDragged=row;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',row.dataset.service);});
document.addEventListener('dragover',event=>{const row=event.target.closest('.status-order-row');if(row&&statusDragged&&row.parentElement===statusDragged.parentElement){event.preventDefault();event.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',event=>{const row=event.target.closest('.status-order-row');if(row&&statusDragged&&row.parentElement===statusDragged.parentElement){event.preventDefault();if(event.clientY<row.getBoundingClientRect().top+row.offsetHeight/2)row.before(statusDragged);else row.after(statusDragged);statusCaptureDraft();}statusDragged=null;});
document.addEventListener('dragend',()=>{statusDragged=null;});
document.addEventListener('submit',async event=>{
 if(!['status-page-form','status-service-form','status-incident-form'].includes(event.target.id))return;
 event.preventDefault();const form=event.target,node=form.dataset.node,id=form.dataset.id,data=Object.fromEntries(new FormData(form)),submit=form.querySelector('[type=submit]'),version=modalVersion;
 const submittedDraft=statusAdmin.drafts.get(id);
 setButtonBusy(submit,true);const inline=form.dataset.inline==='true';const current=()=>state.node===node&&form.isConnected&&(!form.dataset.page||statusAdmin.page===form.dataset.page)&&(inline?statusAdmin.page===id:modalVersion===version&&$('#modal').open);
 try{
  if(form.id==='status-page-form'){
   const defaults={title:'',description:'',accent:'#2563eb',theme:'auto',website:'',logo:'',footer:'',...statusAdmin.pages.find(page=>page.id===id)?.settings};const settings={...Object.fromEntries(Object.keys(defaults).map(k=>[k,data[k]??defaults[k]])),show_server_status:Boolean(data.show_server_status)};
   const result=await api('/monitorings'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:{name:data.name,settings,nodes:new FormData(form).getAll('nodes'),services:new FormData(form).getAll('services')}});
   if(!current())return;if(!inline||statusAdmin.drafts.get(id)===submittedDraft)statusAdmin.drafts.delete(result.id);if(inline){await loadStatusMonitorings(true);}else{closeModal(true);location.hash=statusPageURL(result.id);}
  }else if(form.id==='status-service-form'){
   const kind=data.kind;const config={kind,target:data.target,method:kind==='custom'?data.method:'GET',headers:kind==='custom'?JSON.parse(data.headers):{},body:kind==='custom'?data.body:'',expected_status:kind==='minecraft'?0:Number(data.expected_status),match:kind==='custom'?data.match:'',value:kind==='custom'?data.value:'',json_path:kind==='custom'?data.json_path:''};
   if(typeof config.headers!=='object'||!config.headers||Array.isArray(config.headers)||Object.values(config.headers).some(v=>typeof v!=='string'))throw Error('Headers must be a JSON object with string values.');
   await api(statusServiceBase(node,form.dataset.page)+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:{name:data.name,description:data.description,enabled:data.enabled==='on',interval:Number(data.interval),config}});
   if(!current())return;closeModal();await loadStatusMonitorings(true);
  }else{
   await api(statusPageBase(form.dataset.page,node)+'/incidents'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:{kind:form.dataset.kind,title:data.title,status:data.status,impact:data.impact,services:new FormData(form).getAll('services'),start:data.start?Math.floor(new Date(data.start).getTime()/1000):0,end:data.end?Math.floor(new Date(data.end).getTime()/1000):0,message:data.message}});
   if(!current())return;closeModal();await loadStatusMonitorings(true);
  }
  toast('Saved');
 }catch(error){if(current())form.querySelector('#status-form-error').textContent=error.message;else toast(error.message);}
 finally{setButtonBusy(submit,false);}
});

document.addEventListener('input',event=>{
 if(event.target.closest('#status-page-form[data-inline]'))statusCaptureDraft();
 if(event.target.id==='status-page-search'){statusAdmin.filter=event.target.value;const filter=event.target.value.toLowerCase();let count=0;for(const row of $$('[data-status-row]')){row.hidden=!row.dataset.search.includes(filter);if(!row.hidden)count++;}$('#status-no-match')?.toggleAttribute('hidden',count>0);}
});
document.addEventListener('click',event=>{
 const tab=event.target.closest('[data-status-tab]');if(tab){if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();statusShowSection(tab.dataset.statusTab);return;}
 const row=event.target.closest('[data-status-row]');if(!row||event.target.closest('a,button,input,select,textarea')||getSelection()?.toString())return;
 if(event.ctrlKey||event.metaKey)window.open(statusPageURL(row.dataset.statusRow),'_blank','noopener');else location.hash=statusPageURL(row.dataset.statusRow);
});
document.addEventListener('keydown',event=>{const row=event.target.closest('[data-status-row]');if(row&&event.target===row&&['Enter',' '].includes(event.key)){event.preventDefault();location.hash=statusPageURL(row.dataset.statusRow);}});

function statusShowSection(name,animate=true){
 if(!['general','appearance','services','incidents','installation'].includes(name))return;
 history.replaceState(null,'',statusPageURL(statusAdmin.page,name));
 if(animate){switchStatusInnerSection({statusTab:name},++navigationVersion);return;}
 ++navigationVersion;cancelInnerSectionMotion($('.status-detail-content'));state.statusTab=name;
 for(const section of $$('[data-status-section]'))section.hidden=section.dataset.statusSection!==name;
 for(const link of $$('[data-status-tab]')){if(link.dataset.statusTab===name)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 const bar=$('[data-status-savebar]');if(bar)bar.hidden=!['general','appearance','services'].includes(name);
}
const statusInvalidForms=new WeakSet();
document.addEventListener('invalid',event=>{const form=event.target.closest('#status-page-form[data-inline]');if(!form)return;if(statusInvalidForms.has(form)){event.preventDefault();return;}statusInvalidForms.add(form);queueMicrotask(()=>statusInvalidForms.delete(form));const section=event.target.closest('[data-status-section]');if(section)statusShowSection(section.dataset.statusSection,false);},true);
document.addEventListener('auxclick',event=>{if(event.button!==1||event.target.closest('a,button,input'))return;const row=event.target.closest('[data-status-row]');if(row){event.preventDefault();window.open(statusPageURL(row.dataset.statusRow),'_blank','noopener');}});
