'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const busyButtons=new WeakMap();
function setButtonBusy(button,busy){
 if(!(button instanceof HTMLButtonElement))return;
 const saved=busyButtons.get(button);
 if(busy){if(saved)return;busyButtons.set(button,{html:button.innerHTML,disabled:button.disabled,label:button.getAttribute('aria-label'),width:button.style.minWidth,height:button.style.minHeight});const bounds=button.getBoundingClientRect();button.style.minWidth=bounds.width+'px';button.style.minHeight=bounds.height+'px';button.setAttribute('aria-label',button.getAttribute('aria-label')||button.textContent.trim()||'Working');button.setAttribute('aria-busy','true');button.classList.add('is-busy');button.disabled=true;button.innerHTML='<span class="button-spinner" aria-hidden="true"></span>';}
 else if(saved){button.innerHTML=saved.html;button.disabled=saved.disabled;button.style.minWidth=saved.width;button.style.minHeight=saved.height;button.removeAttribute('aria-busy');button.classList.remove('is-busy');if(saved.label===null)button.removeAttribute('aria-label');else button.setAttribute('aria-label',saved.label);busyButtons.delete(button);}
}
const paths = {
 users:'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M13 7a4 4 0 11-8 0 4 4 0 018 0 M20 21v-2a4 4 0 00-3-4 M17 3a4 4 0 010 8',database:'M4 6c0-4 16-4 16 0v12c0 4-16 4-16 0z M4 6c0 4 16 4 16 0 M4 12c0 4 16 4 16 0',
 overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 servers:'M4 3h16v7H4z M4 14h16v7H4z M7 6.5h.01 M7 17.5h.01 M11 6.5h6 M11 17.5h6',
 monitoring:'M3 19h18 M4 15l5-7 4 4 7-9',
 docker:'M3 12h18c0 6-4 8-9 8-5 0-9-2-9-8z M5 8h4v4H5z M10 8h4v4h-4z M10 3h4v4h-4z M15 8h4v4h-4z',
 apps:'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10 M8 5l8 4',
 startup:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M6 6l2 2 M16 16l2 2 M6 18l2-2 M16 8l2-2 M9 9h6v6H9z',
 jobs:'M8 3h8v4H8z M7 5H5v16h14V5h-2 M8 11h8 M8 15h6',
 alerts:'M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
 connect:'M4 5h16v14H4z M7 9l3 3-3 3 M12 15h5',
 settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 11-6 0 3 3 0 016 0',
 check:'M5 12l4 4L19 6', cpu:'M7 7h10v10H7z M9 1v4 M15 1v4 M9 19v4 M15 19v4 M1 9h4 M1 15h4 M19 9h4 M19 15h4',
 arrow:'M5 12h14 M14 7l5 5-5 5', plus:'M12 5v14 M5 12h14', clock:'M12 8v5l3 2 M21 12a9 9 0 11-18 0 9 9 0 0118 0',
 network:'M5 17l-3-3 3-3 M2 14h14 M19 7l3 3-3 3 M22 10H8', folder:'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3', globe:'M21 12a9 9 0 11-18 0 9 9 0 0118 0 M3 12h18 M12 3c-5 5-5 13 0 18 M12 3c5 5 5 13 0 18',
 disk:'M5 3h14l3 12v6H2v-6z M2 15h20 M6 18h.01 M10 18h.01', more:'M5 12h.01 M12 12h.01 M19 12h.01', search:'M10 3a7 7 0 110 14 7 7 0 010-14 M15 15l6 6', down:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4'
};
const icon = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.servers}"/></svg>`;
const state = {nodes:[], serverGroups:[], jobs:[], alerts:[], events:[], selected:new Set(), node:'', statusPage:'', statusTab:'general', nodesLoaded:false, page:'overview', publicURL:'', database:null, history:[], chart:'cpu', authenticated:false, filePath:'/', watched:new Map(), modalJob:null, modalKind:'', enrollmentNode:null, enrollmentExpires:0, filter:'', onlineFilter:'all'};
const titles = {performance:'Performance',cleanup:'Cleanup',server:'Overview',batch:'Batch operations',overview:'Overview',servers:'Servers',users:'Linux users',databases:'Databases',network:'DNS',monitorings:'Status pages',access:'Users & access',services:'Services',docker:'Containers',apps:'Apps & packages',startup:'Startup & cron',jobs:'Activity & jobs',alerts:'Alert rules',connect:'Terminal & files',settings:'Settings'};
let toastTimer, polling = false, modalVersion = 0, modalCloseTimer, modalCloseListener, enrollmentPollTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
async function api(path, options = {}, verified = false) {
 const headers = {'X-Magnet-Request':'1', ...options.headers};
 if (options.body && typeof options.body !== 'string' && !(options.body instanceof Blob) && !(options.body instanceof FormData)) { headers['Content-Type']='application/json'; options.body=JSON.stringify(options.body); }
 const response = await fetch('/api'+path, {...options, headers});
 if (response.status === 401) { state.authenticated=false;if(stepUpPromise)finishStepUp(new Error('Session expired'));managed.dbArgs=null;managed.dbConnected=false;managed.linkConnected=false; closeModal(true);closeFileEditor(true);closeComposeEditor(true);redirectToLogin();throw new Error('Session expired'); }
 if (!response.ok) { const body = await response.json().catch(() => ({}));if(response.status===403&&body.code==='totp_setup_required'){const previouslyEnabled=state.totpEnabled;state.totpEnabled=false;if(previouslyEnabled)lockSensitiveUI();}if(response.status===403&&body.code==='step_up_required'&&!verified){await requestStepUp();return api(path,{...options,headers},true);} throw new Error(body.error || (response.status===429?'Too many attempts. Please try later.':`Request failed (${response.status})`)); }
 return response.json();
}
function redirectToLogin(preservePage=true){
 state.authenticated=false;stopEnrollmentWatch();
 document.querySelector('.shell')?.setAttribute('hidden','');closeModal(true);closeFileEditor(true);closeComposeEditor(true);
 location.replace('/login'+(preservePage?location.hash:''));
}
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
const post = (path, body) => api(path, {method:'POST', body});
const pct = n => `${Number(n || 0).toFixed(1)}%`;
const bytes = n => { n=Number(n||0); if(n>=1073741824)return (n/1073741824).toFixed(1)+' GB'; if(n>=1048576)return (n/1048576).toFixed(1)+' MB'; if(n>=1024)return (n/1024).toFixed(1)+' KB'; return Math.round(n)+' B'; };
const ago = n => { const d=Math.max(0,Math.floor(Date.now()/1000-n)); return d<60?'Just now':d<3600?Math.floor(d/60)+'m ago':d<86400?Math.floor(d/3600)+'h ago':Math.floor(d/86400)+'d ago'; };
const statusLabels={online:'Online',offline:'Offline',succeeded:'Completed',running:'Running',queued:'Pending',failed:'Failed',unknown:'Needs review'};
const badge=(status,text=statusLabels[status]||status)=>`<span class="badge ${esc(status)}">${['online','offline'].includes(status)?'<i class="badge-dot" aria-hidden="true"></i>':''}<span class="badge-label">${esc(text)}</span></span>`;
function operationLabel(kind){
 const names={'cleanup.scan':'Scan disk usage','cleanup.execute':'Clean selected items','apt.sources.list':'List APT repositories','apt.sources.write':'Save APT repository file','apt.sources.delete':'Remove APT repository file','dns.read':'Read DNS configuration','dns.write':'Save DNS configuration','apt.install':'Install packages','apt.update':'Update packages','deb.install':'Install a Debian package','compose.list':'List Compose projects','docker.shell':'Container console','docker.files':'Browse container files','docker.file.read':'Read container file','docker.list':'List containers','docker.action':'Manage container','compose.read':'Open Compose file','compose.write':'Save Compose file','compose.up':'Deploy Compose project','service.list':'List services','service.action':'Manage service','service.read':'Open service override','service.write':'Save service override','service.create':'Create systemd service','service.preview':'Preview systemd service','cron.snapshot':'Read scheduled tasks','cron.replace':'Update scheduled tasks','cron.read':'Open crontab','cron.write':'Save crontab','shell':'Run command','link.shell':'Run command as Link user','link.files':'Browse files','link.file.read':'Open file','link.file.write':'Save file','link.file.mkdir':'Create folder','link.file.rename':'Rename file or folder','link.file.remove':'Delete file or folder','link.uninstall':'Uninstall Link','users.list':'List Linux users','users.create':'Create Linux user','users.edit':'Edit Linux user','users.delete':'Remove Linux user','database.status':'Find local databases','database.install':'Install MariaDB','database.ping':'Connect to database','database.schemas':'List databases','database.tables':'List tables','database.rows':'Open table','database.structure':'View table structure','database.row.insert':'Insert database row','database.row.update':'Edit database row','database.row.delete':'Delete database row','database.query':'Run SQL statement','database.users':'List database users','database.user.save':'Save database user','database.user.delete':'Delete database user'};
 return names[kind]||String(kind).replace(/[._]/g,' ').replace(/^./,letter=>letter.toUpperCase());
}
const button = (text, action, kind='', extra='') => `<button type="button" class="${kind}" data-action="${action}" ${extra}>${text}</button>`;
const empty = (name,title,text,action='add',label='Connect a server') => `<div class="empty-state"><div class="empty-icon">${icon(name,23)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action?button(label,action,'primary'):''}</div>`;
function heading(title,description,actions=''){return actions?`<div class="page-actions">${actions}</div>`:'';}
function linkVersionLabel(node){return node?.metrics?.link_version?'v'+node.metrics.link_version:'Not reported';}
function resetPageScroll(){window.scrollTo({top:0,left:0,behavior:'instant'});for(const element of [document.scrollingElement,$('.workspace'),$('#main')]){if(element){element.scrollTop=0;element.scrollLeft=0;}}}
if('scrollRestoration' in history)history.scrollRestoration='manual';

function stopEnrollmentWatch() {
 clearInterval(enrollmentPollTimer);enrollmentPollTimer=null;state.enrollmentNode=null;state.enrollmentExpires=0;
}
function resetModalClose() {
 const dialog=$('#modal');clearTimeout(modalCloseTimer);
 if(modalCloseListener)dialog.removeEventListener('animationend',modalCloseListener);
 modalCloseListener=null;dialog.classList.remove('is-closing');
}
function closeModal(immediate=false) {
 const dialog=$('#modal');stopEnrollmentWatch();
 if(!dialog.open)return;
 if(immediate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){resetModalClose();dialog.close();return;}
 if(dialog.classList.contains('is-closing'))return;
 const finish=()=>{resetModalClose();if(dialog.open)dialog.close();};
 modalCloseListener=event=>{if(event.target===dialog&&event.animationName==='modal-exit')finish();};
 dialog.addEventListener('animationend',modalCloseListener);dialog.classList.add('is-closing');
 modalCloseTimer=setTimeout(finish,240);
}
function modal(title,content,kind='',preserveTitle=false) {
 resetModalClose();stopEnrollmentWatch();modalVersion++;state.modalKind=kind;$('#modal').classList.toggle('wide-editor-dialog',['source-editor','service-creator','cron-task-editor'].includes(kind));$('#modal').classList.toggle('account-editor-dialog',['account-user-editor','account-group-editor','account-invite-editor','server-group-editor'].includes(kind));
 if(kind!=='job')state.modalJob=null;
 $('#modal-title').toggleAttribute('data-i18n-skip',preserveTitle);$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;
 if(!$('#modal').open)$('#modal').showModal();
}
const serverPages=new Set(['performance','cleanup','server','network','services','users','docker','databases','apps','startup','connect','jobs','alerts']);
const workspacePages=new Set(['overview','servers','monitorings','access','batch','jobs','alerts','settings']);
function pageURL(page,node=state.node){if(page==='monitorings')return '#status-pages';return node&&serverPages.has(page)?`#server/${encodeURIComponent(node)}/${page==='server'?'overview':page}`:'#'+page;}
function goPage(page,node=state.node){const hash=pageURL(page,node);closeModal(true);if(location.hash===hash)return navigation();location.hash=hash;}
function readRoute(){
 const parts=location.hash.slice(1).split('/');
 if(['status-pages','monitorings'].includes(parts[0])){let id;try{id=decodeURIComponent(parts[1]||'');}catch{id='';}const tab=['general','appearance','services','incidents','installation'].includes(parts[2])?parts[2]:'general';return {node:'',page:'monitorings',statusPage:id,statusTab:tab};}
 if(parts[0]==='server'){
  let node;try{node=decodeURIComponent(parts[1]||'');}catch{return {node:'',page:'servers'};}
  const page=!parts[2]||['overview','monitoring'].includes(parts[2])?'server':parts[2]==='mariadb'?'databases':parts[2];
  if(page==='monitorings'&&node&&parts.length===3){history.replaceState(null,'','#monitorings');return {node:'',page:'monitorings'};}
  if(!node||parts.length>3||!serverPages.has(page))return {node:'',page:'servers'};
  return {node,page};
 }
 const page=parts[0]||'overview';return {node:'',page:workspacePages.has(page)?page:serverPages.has(page)?'servers':'overview'};
}
const shellContent=new WeakMap();
function patchShellContent(element,value,html=false){
 if(!element)return;value=String(value??'');const saved=shellContent.get(element);
 if(saved?.value===value&&saved.html===html)return;
 if(html)element.innerHTML=value;else element.textContent=value;
 shellContent.set(element,{value,html});
}
function setShellHidden(element,hidden){if(element&&element.hidden!==hidden)element.hidden=hidden;}
function updateNavigationShell(){
 const node=selectedNode(),scoped=Boolean(state.node);
 setShellHidden($('#workspace-navigation'),scoped);setShellHidden($('#server-navigation'),!scoped);
 patchShellContent($('#context-server-name'),node?.hostname||magnetI18n.text('Server'));
 patchShellContent($('#context-server-address'),privateAddress(node?.address),true);
 patchShellContent($('.server-context>.server-glyph'),serverIcon(node),true);
 $$('[data-server-page]').forEach(link=>{const href=pageURL(link.dataset.serverPage);if(link.getAttribute('href')!==href)link.setAttribute('href',href);});
 $$('[data-page]').forEach(link=>{const active=link.dataset.page===state.page&&Boolean(link.dataset.serverPage)===scoped;if(link.classList.contains('active')!==active)link.classList.toggle('active',active);if(active){if(link.getAttribute('aria-current')!=='page')link.setAttribute('aria-current','page');}else if(link.hasAttribute('aria-current'))link.removeAttribute('aria-current');});
 patchShellContent($('#breadcrumbs'),`<a href="#overview">${esc(magnetI18n.text('Workspace'))}</a>${scoped?`<span>/</span><a data-i18n-skip href="${esc(pageURL('server'))}">${esc(node?.hostname||magnetI18n.text('Server'))}</a>`:''}<span>/</span><strong id="breadcrumb">${esc(magnetI18n.text(titles[state.page]))}</strong>`,true);
 const title=`${scoped?(node?.hostname||magnetI18n.text('Server'))+' · ':''}${magnetI18n.text(titles[state.page])} · Magnet`;if(document.title!==title)document.title=title;
 accessNavigation();patchShellContent($('#node-count'),state.nodes.length);patchShellContent($('#alert-count'),state.alerts.filter(alert=>!alert.node_id).length);
}

function operationTargets(){return state.node?[state.node]:[...state.selected].filter(id=>state.nodes.some(node=>node.id===id));}
function selectedNode() { return state.nodes.find(n=>n.id===state.node); }
let navigationVersion=0,pageMotion=null;
async function navigation() {
 const version=++navigationVersion,main=$('#main'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches||typeof main.animate!=='function';
 const innerRoute=readRoute();
 if(innerRoute.page==='monitorings'&&state.page==='monitorings'&&!state.node&&!innerRoute.node&&innerRoute.statusPage===state.statusPage&&state.statusPage&&$('.status-workspace')){pageMotion?.cancel();main.inert=false;await switchStatusInnerSection(innerRoute,version);return;}
 pageMotion?.cancel();resetPerformance();screenData.version++;
 if(!reduce&&main.childElementCount){main.inert=true;pageMotion=main.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-6px)'}],{duration:110,easing:'ease-in',fill:'forwards'});await pageMotion.finished.catch(()=>{});}
 if(version!==navigationVersion)return;
 pageMotion?.cancel();
 let {page,node,statusPage='',statusTab='general'}=readRoute();
 if(node&&state.nodesLoaded&&!state.nodes.some(server=>server.id===node)){page='servers';node='';history.replaceState(null,'','#servers');toast('This server is no longer available.');}
 if(page!=='connect'||node!==state.node)closeFileEditor(true);
 if(page!=='docker'||node!==state.node){closeComposeEditor(true);resetContainerTools();}
 if(state.page==='databases'&&(page!=='databases'||node!==state.node))clearDatabaseConnection();
 if(state.node!==node){resetCleanupView();state.history=[];state.jobs=[];state.events=[];closeModal(true);}
 state.node=node;state.page=page;state.statusPage=statusPage;state.statusTab=statusTab;state.filter='';state.onlineFilter='all';
 const fromMobileNavigation=$('.sidebar').classList.contains('open');ensureManagedNode();setNavigationOpen(false);
 render();resetPageScroll();main.inert=false;if(page==='performance')loadPerformance();if(fromMobileNavigation)main.focus({preventScroll:true});if(!state.node||!restrictedServerPages.has(page)||canAccess('server',state.node,true))loadManagedPage();if(page==='access')loadAccessPage();if(page==='monitorings'||(page==='services'&&state.totpEnabled))loadStatusMonitorings();if(['server'].includes(page))loadHistory().catch(error=>toast(error.message));
 if(!reduce){pageMotion=main.animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:190,easing:'cubic-bezier(.2,.7,.2,1)'});await pageMotion.finished.catch(()=>{});}
}
function render() {
 ensureScreenNode();updateNavigationShell();
 if(state.node&&!selectedNode()){$('#main').innerHTML='<p class="hint" role="status">Opening server…</p>';return;}
 if(state.authenticated&&!state.totpEnabled&&(restrictedServerPages.has(state.page)||['access','jobs','alerts','batch'].includes(state.page))){$('#main').innerHTML=totpSetupNotice();return;}
 const renderers={performance:performancePage,cleanup:cleanupPage,overview,servers,server:serverOverview,batch:apps,users:usersPage,databases:databasesPage,network:networkPage,monitorings:statusMonitoringsPage,services:statusServerServicesPage,docker,apps,startup,jobs,alerts,connect,settings:settingsPage,access:accessPage};
 $('#main').innerHTML=(state.authenticated&&!state.totpEnabled&&state.page!=='settings'?'<div class="notice">Set up an authenticator in Settings before accessing sensitive tools. <a href="#settings">Open Settings →</a></div>':'')+renderers[state.page]();if(state.page==='monitorings')statusFilterServices(false);applyAccessUI();if(['overview','servers'].includes(state.page))paintFleetSelection();
 if(['server'].includes(state.page))drawChart();
}
function meter(n,label='') {
 const numeric=Number(n),value=Number.isFinite(numeric)?Math.max(0,Math.min(100,numeric)):0;
 return `<span class="resource-usage"><span class="meter"><progress class="meter-track" max="100" value="${value}" aria-label="Resource utilization">${pct(value)}</progress><span>${pct(value)}</span></span>${label?resourceUsageWarning(n,label):''}</span>`;
}
function stats() {
 const scoped=state.node?state.nodes.filter(n=>n.id===state.node):state.nodes,online=scoped.filter(n=>n.online),average=k=>online.length?online.reduce((sum,n)=>sum+Number(n.metrics[k]||0),0)/online.length:0;
 const tiles=[(state.node?['disk','Root disk (/)',online.length?pct(average('disk')):'—','Root filesystem space used']:['servers','Connected servers',scoped.length,`<span class="positive">${online.length} online</span> ${scoped.length-online.length} offline`]),['cpu',state.node?'CPU usage':'Average CPU',online.length?pct(average('cpu')):'—',state.node?'Current server utilization':'Across online servers'],['monitoring','Memory usage',online.length?pct(average('ram')):'—','RAM currently in use'],['network','Network traffic','','Internet uplink · Inbound / outbound']];
 return `<div class="stats">${tiles.map(([i,t,v,b])=>`<div class="stat"><div class="stat-top">${t}<span class="stat-icon">${icon(i,15)}</span></div><div class="stat-value ${i==='network'?'network-stat-value':''}">${i==='network'?networkRates(scoped):esc(v)}${i==='cpu'&&online.length?resourceUsageWarning(average('cpu'),'CPU'):i==='monitoring'&&online.length?resourceUsageWarning(average('ram'),'Memory'):i==='disk'&&online.length?resourceUsageWarning(average('disk'),'Root disk (/)'):''}</div><div class="stat-bottom">${b}</div></div>`).join('')}</div>`;
}
function serverTable(compact=false) {
 const nodes=visibleFleetNodes(),visible=nodes.slice(0,compact?5:1000);
 return `<section class="panel"><div class="toolbar"><div><h3>Your servers <span class="text-muted">${state.nodes.length.toString().padStart(2,'0')}</span></h3>${fleetSelectionFeedback()}</div><div class="toolbar-actions">${button('Batch actions','fleet-batch-actions','',`id="fleet-batch-actions" ${state.selected.size&&state.totpEnabled?'':'disabled'}`)}<input id="server-search" aria-label="Search servers" placeholder="Search servers..." value="${esc(state.filter)}"><select id="status-filter" aria-label="Filter server status"><option value="all">All statuses</option><option value="online" ${state.onlineFilter==='online'?'selected':''}>Online</option><option value="offline" ${state.onlineFilter==='offline'?'selected':''}>Offline</option></select></div></div>${!state.nodes.length?empty('servers','A home for every server','Connect your first Debian or Ubuntu server. MagnetLink takes care of the rest.'):!nodes.length?empty('search','No matching servers','Try another name, address, or status.','',''):`<div class="table-scroll"><table class="fleet-table"><thead><tr><th><input type="checkbox" id="select-all" aria-label="Select all visible servers" ${visible.every(n=>state.selected.has(n.id))?'checked':''}></th><th>Server</th><th>Status</th><th>CPU</th><th>Memory</th><th>Root disk (/)</th><th>Network</th><th></th></tr></thead>${serverGroupTableBodies(visible)}</table></div>`}<div class="table-foot"><span>${visible.length} of ${state.nodes.length} servers · Updated every 10s</span>${compact?'<a href="#servers">View all servers →</a>':''}</div></section>`;
}
function fleetSelectionFeedback(){return `<div id="fleet-selection-feedback" class="fleet-selection-feedback ${state.selected.size?'has-selection':''}"><p class="fleet-selection-instructions" ${state.selected.size?'aria-hidden="true"':''}>Open a server to manage it. Use the checkboxes for batch actions.</p><p class="fleet-selection-status" role="status" aria-live="polite">${state.selected.size?`<span>Selected servers</span>: ${state.selected.size}`:''}</p></div>`;}
function paintFleetSelection(){
 const selected=state.selected.size,feedback=$('#fleet-selection-feedback');
 if(feedback){feedback.classList.toggle('has-selection',selected>0);const instructions=$('.fleet-selection-instructions',feedback),status=$('.fleet-selection-status',feedback);if(selected)instructions.setAttribute('aria-hidden','true');else instructions.removeAttribute('aria-hidden');status.innerHTML=selected?`<span>Selected servers</span>: ${selected}`:'';}
 for(const checkbox of $$('[data-select]')){checkbox.checked=state.selected.has(checkbox.dataset.select);checkbox.closest('tr')?.classList.toggle('is-selected',checkbox.checked);}
 const visible=$$('[data-select]'),all=$('#select-all'),checked=visible.filter(input=>input.checked).length;if(all){all.checked=visible.length>0&&checked===visible.length;all.indeterminate=checked>0&&checked<visible.length;}
 const batch=$('#fleet-batch-actions');if(batch)batch.disabled=!selected||!state.totpEnabled;
}

function activityRows() { const events=state.node?state.events.filter(event=>event.node_id===state.node):state.events;return events.length?`<div class="activity-list">${events.slice(0,4).map(e=>`<div class="activity-row"><span class="activity-icon">${icon('jobs',14)}</span><div><p>${esc(e.message)}</p><small>${esc(state.nodes.find(n=>n.id===e.node_id)?.hostname||'Workspace')}</small></div><time>${ago(e.time)}</time></div>`).join('')}</div>`:`<div class="activity-list"><div class="activity-row"><span class="activity-icon">${icon('check',14)}</span><div><p>${state.node?'No recent server activity':'Your workspace is ready'}</p><small>Connections and operations will appear here.</small></div></div></div>`; }
function overview(){return heading('','',button(icon('plus',14)+' Connect server','add','primary'))+stats()+serverTable(true)+`<section class="panel editor-panel"><div class="panel-heading"><h3>Recent workspace activity</h3><a href="#jobs" class="hint">View all ↗</a></div>${activityRows()}</section>`;}
function cpuCoresPanel(node){
 const cores=Array.isArray(node.metrics.cpu_cores)?node.metrics.cpu_cores:[];
 return `<section class="panel editor-panel"><div class="panel-heading"><div><h3>CPU usage per core</h3><p>${node.online?'Live utilization of each logical CPU':'Server offline · Live core usage unavailable'}</p></div></div>${node.online&&cores.length?`<div class="cpu-cores">${cores.map(core=>`<div class="cpu-core"><span data-i18n-skip>CPU ${esc(core.id)}</span>${core.usage===null||!Number.isFinite(Number(core.usage))?'<span class="hint">Sampling…</span>':meter(core.usage,'CPU '+core.id)}</div>`).join('')}</div>`:'<div class="section-body"><p class="hint">'+(node.online?'Per-core telemetry requires MagnetLink 0.4.7 or newer.':'Reconnect the server to see current utilization.')+'</p></div>'}</section>`;
}
function serverOverview(){
 const node=selectedNode();if(!node)return '';
 return `<div class="page-actions">${badge(node.online?'online':'offline')}${button('Edit node','edit-node','',`data-id="${esc(node.id)}"`)}${button(icon('connect',18)+' Terminal & files','node-connect','primary',`data-id="${esc(node.id)}"`)}</div>`+stats()+`<div class="overview-grid">${chartPanel()}<section class="panel"><div class="panel-heading"><h3>Server details</h3></div><dl class="node-details">${[['Public IPv4',node.address],['Operating system',node.os],['Architecture',node.arch],['Link version',linkVersionLabel(node)],['Link user',node.metrics.link_user||'Not reported'],['Uptime',Math.floor((node.metrics.uptime||0)/86400)+'d '+Math.floor((node.metrics.uptime||0)%86400/3600)+'h'],['Root disk (/)',pct(node.metrics.disk)],['System load (1m)',Number(node.metrics.load||0).toFixed(2)]].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd data-i18n-skip>${label==='Public IPv4'?privateAddress(value):esc(value)}</dd></div>`).join('')}</dl></section></div>${cpuCoresPanel(node)}<section class="panel editor-panel"><div class="panel-heading"><h3>Recent server activity</h3><a href="${esc(pageURL('jobs'))}" class="hint">View all ↗</a></div>${activityRows()}</section>`;
}
function servers() { return heading('Your fleet, in focus.','Connect, inspect, and manage every server from one workspace.',(state.user?.admin?button('Server groups','server-groups'):'')+button(icon('plus',14)+' Connect server','add','primary'))+serverTable(); }
function requireNodes(name,description) { return `<section class="panel">${empty(name,'Connect a server to get started',description)}</section>`; }
function docker() {
 let html=heading('A little order for your containers.','Inspect containers, manage their lifecycle, and edit Docker Compose.');if(!state.nodes.length)return html+requireNodes('docker','Connect a Docker host to manage its containers.');
 const last=screenData.containers!==null,containers=screenData.containers||[];
 html+=`<section class="panel" id="container-panel"><div class="toolbar"><div><h3>Containers</h3><p>${last?containers.length+' container(s)':'Loading the current inventory…'}</p></div>${screenStatus('containers')}</div>`;
 html+=containers.length?`<div class="table-scroll"><table><thead><tr><th>Container</th><th>Image</th><th>Status</th><th>Ports</th><th>Actions</th></tr></thead><tbody>${containers.map(c=>`<tr><td data-i18n-skip>${esc(c.Names)}<small>${esc(c.ID)}</small></td><td data-i18n-skip>${esc(c.Image)}</td><td>${badge(String(c.State).toLowerCase()==='running'?'online':'offline',c.Status)}</td><td data-i18n-skip>${esc(c.Ports)}</td><td><div class="container-actions">${button('Console','container-tools','',`data-container="${esc(c.ID)}" data-name="${esc(c.Names)}" data-tab="console" ${String(c.State).toLowerCase()==='running'?'':'disabled'}`)}${button('Files','container-tools','',`data-container="${esc(c.ID)}" data-name="${esc(c.Names)}" data-tab="files" ${String(c.State).toLowerCase()==='running'?'':'disabled'}`)}${['start','restart','stop','rm','update'].map(a=>button(a==='rm'?'Delete':a==='update'?'Edit':a[0].toUpperCase()+a.slice(1),'container-action',a==='rm'?'danger':'',`data-container="${esc(c.Names)}" data-kind="${a}"`)).join(' ')}</div></td></tr>`).join('')}</tbody></table></div>`:empty('docker',last?'No containers yet':'Loading containers…',last?'Compose projects and their configuration files appear below.':'The inventory loads automatically.','','');
 return html+'</section><div id="container-tools">'+containerToolsHTML()+'</div>'+composeProjectsHTML();
}
function apps() {
 let html=heading('Good tools. Everywhere you need them.','Install packages or update your fleet in a single operation.');if(!state.nodes.length)return html+requireNodes('apps','Connect a Debian or Ubuntu server to manage packages.');
 const targets=operationTargets();
 if(!targets.length)return html+`<section class="panel"><div class="section-body"><p class="hint">Select servers in the server list to run a batch operation.</p><a class="context-link" href="#servers">Choose servers →</a></div></section>`;
 return html+`<div class="notice">${state.node?esc(selectedNode()?.hostname):targets.length+' selected server(s)'} · Package operations run with Link’s system privileges.${!state.node?' <a href="#servers">Change selection →</a>':''}</div><div class="operation-grid editor-panel"><section class="panel"><div class="panel-heading"><h3>Install from APT</h3>${icon('apps',18)}</div><div class="section-body"><p class="hint">Install packages from your configured repositories.</p><label>Package names<input id="apt-packages" placeholder="nginx curl htop" spellcheck="false"></label>${button(state.node?'Install packages →':'Install on selected servers →','apt-install','primary')}</div></section><section class="panel"><div class="panel-heading"><h3>Install a .deb package</h3>${icon('down',18)}</div><div class="section-body"><p class="hint">Use a package URL, or upload a .deb for the selected Links to download and install.</p><label>Package URL<input id="deb-url" type="url" placeholder="https://example.com/package.deb"></label><div class="form-actions">${button('Download & install →','deb-install','primary')}${button('Upload .deb…','deb-upload')}</div><input id="deb-upload-file" type="file" accept=".deb,application/vnd.debian.binary-package" hidden><p id="deb-upload-status" class="hint" role="status"></p></div></section><section class="panel full-width"><div class="section-body"><h3>Package updates</h3><p class="hint">Refresh package indexes and upgrade installed packages with apt-get update and apt-get upgrade -y.</p>${button(state.node?'Update packages →':'Update selected servers →','batch-update','primary')}</div></section></div>`+(state.node?aptSourcesPanel():'');
}
function serviceRows(){
 const filter=(screenData.serviceFilter||'').toLowerCase(),items=(screenData.services||[]).filter(s=>(s.unit+' '+s.description+' '+s.active+' '+s.state).toLowerCase().includes(filter));
 if(!items.length)return `<tr><td colspan="4" class="hint">${screenData.services===null?(screenData.loading.has('services')?'<span class="button-spinner" aria-label="Loading services" role="status"></span>':'Services unavailable.'):'No matching services.'}</td></tr>`;
 return items.map(s=>{const attrs=`data-unit="${esc(s.unit)}"`,running=s.active==='active',masked=s.state.startsWith('masked'),boot=s.state.startsWith('enabled');return `<tr><td><strong>${esc(s.unit)}</strong><small>${esc(s.description)}</small></td><td>${badge(running?'online':s.active==='failed'?'failed':'offline',running?'Running':s.active==='failed'?'Failed':s.active==='inactive'?'Stopped':s.active||'Unknown')}<small>${esc(s.sub)}</small></td><td>${esc(s.state.replaceAll('-',' '))}</td><td><div class="service-row-actions">${button(running?'Stop':'Start','service-action','',`${attrs} data-kind="${running?'stop':'start'}" ${masked?'disabled':''}`)}${button('Restart','service-action','',`${attrs} data-kind="restart" ${masked?'disabled':''}`)}${['enabled','enabled-runtime','disabled','linked','linked-runtime','indirect'].includes(s.state)?button(boot?'Disable auto-start':'Enable auto-start','service-action','',`${attrs} data-kind="${boot?'disable':'enable'}"`):''}${button('Edit','service-edit','',attrs)}</div></td></tr>`;}).join('');
}
function startup() {
 if(!state.nodes.length)return requireNodes('startup','Connect a server to manage startup services and cron.');
 return `<section class="panel services-panel"><div class="toolbar"><h3>Services & auto-start</h3>${button('Create service','service-create','primary')}<input id="service-search" type="search" placeholder="Search services…" aria-label="Search services" value="${esc(screenData.serviceFilter)}"></div><div class="section-body" id="services-status">${screenStatus('services')}</div><div class="table-scroll"><table class="services-table"><thead><tr><th>Service</th><th>Status</th><th>Start at boot</th><th>Actions</th></tr></thead><tbody id="service-rows">${serviceRows()}</tbody></table></div></section>
 ${cronManagerHTML()}`;
}
async function editService(unit){
 const node=state.node,version=modalVersion,data=await managedJSON('service.read',{unit});if(state.node!==node||state.page!=='startup'||modalVersion!==version)return;
 modal('Edit '+unit,`<form id="service-edit-form" data-unit="${esc(unit)}" data-node="${esc(node)}"><p class="hint">${esc(data.path)} · Save an override, then restart from the service row to apply runtime changes. Empty content removes this override.</p><details><summary>Current service configuration</summary><pre class="job-output">${esc(data.source)}</pre></details><label>Magnet override<textarea id="service-override-content" name="content" aria-label="Service override" data-code-language="linuxconf" spellcheck="false" placeholder="[Service]">${esc(data.content)}</textarea></label><div class="form-actions"><button type="submit" class="primary">Save override</button></div></form>`);
}

function jobs() { const list=state.node?state.jobs.filter(job=>job.node_id===state.node):state.jobs;return heading('Every operation has a story.','Follow batch installs, server tasks, and the activity across your workspace.')+`<section class="panel"><div class="toolbar"><h3>Recent jobs</h3><span class="hint">Last 100 operations</span></div>${list.length?`<div class="table-scroll"><table><thead><tr><th>Operation</th><th>Server</th><th>Status</th><th>Started</th><th></th></tr></thead><tbody>${list.map(j=>`<tr><td>${esc(operationLabel(j.kind))}<small>${esc(j.id.slice(0,10))}</small></td><td>${esc(state.nodes.find(n=>n.id===j.node_id)?.hostname||'Removed server')}</td><td>${badge(j.status)}</td><td>${new Date(j.created*1000).toLocaleString(magnetI18n.locale)}</td><td>${button('View output ↗','job-output','',`data-id="${esc(j.id)}"`)}</td></tr>`).join('')}</tbody></table></div>`:empty('jobs','All quiet, for now','Operations appear here as soon as you run them.','','')}</section><section class="panel editor-panel"><div class="panel-heading"><h3>${state.node?'Server activity':'Workspace activity'}</h3></div>${activityRows()}</section>`; }
function alerts() { const rules=state.alerts.filter(rule=>state.node?rule.node_id===state.node:!rule.node_id);return heading('Stay close. Without watching constantly.','Send HTTP requests or JSON webhooks when your servers need attention.',button(icon('plus',14)+' New alert rule','new-alert','primary'))+`<section class="panel">${rules.length?rules.map(a=>`<div class="alert-card"><span class="health-icon">${icon('alerts',18)}</span><div class="alert-detail"><h3>${esc(a.name)}</h3><p>${esc(a.metric)} &gt; ${a.threshold}${a.metric==='offline'?' seconds':''} · ${esc(state.nodes.find(n=>n.id===a.node_id)?.hostname||'All servers')} · ${a.method} · ${a.cooldown}s cooldown</p><p>${esc(a.url)}</p></div>${button('Edit','edit-alert','',`data-id="${esc(a.id)}"`)}${button('Delete','delete-alert','danger',`data-id="${esc(a.id)}"`)}</div>`).join(''):empty('alerts','A calmer way to stay informed','Set a threshold for CPU, RAM, disk, system load, or offline time. Magnet will send the signal.','new-alert','Create your first rule')}</section>`; }
function connect(){ensureManagedNode();return linkConnectionBody();}

function settings() { const theme=localStorage.getItem('magnet-theme')||'auto';return heading('Make this space yours.','A few thoughtful defaults. Your preferred way to work.')+`<section class="panel"><div class="settings-section"><h3>Appearance</h3><p>Choose a theme, or let Magnet follow your device.</p><div class="theme-options">${[['light','☀','Light'],['dark','☾','Dark'],['auto','◐','System']].map(([v,i,t])=>button(`<span>${i}</span>${t}`,'set-theme','theme-option '+(theme===v?'active':''),`data-theme="${v}"`)).join('')}</div></div><div class="settings-section"><h3>MagnetServer</h3><p>Public server origin</p><div class="code-box">${esc(state.publicURL)}</div><p>Configure listen, public_url, optional TLS, and the opt-in node setup script in magnet.yaml. Restart the server to apply changes.</p></div><div class="settings-section"><h3>MariaDB connection</h3><p>Connection settings are configured in the database section of magnet.yaml. Restart MagnetServer after editing.</p><div class="code-box">Host: ${esc(state.database?.host)}<br>Port: ${esc(state.database?.port)}<br>User: ${esc(state.database?.user)}<br>Database: ${esc(state.database?.name)}<br>Password: ••••••••<br>Verified TLS: ${state.database?.tls?'Enabled':'Disabled'}</div><p>The database password is stored in the server configuration and is never sent to your browser.</p></div><div class="settings-section"><h3>Connection security</h3><p>Every Link has an independent 256-bit key. Setup keys expire after 15 minutes and can be used once. Link payloads use AES-GCM authenticated encryption over HTTP or HTTPS.</p><p>Browser sessions require HTTPS or a trusted local connection. The default listener is localhost; use an SSH tunnel for remote UI access without a certificate.</p></div><div class="settings-section"><h3>Workspace access</h3><p>The administrator key is stored in data/admin.key. Sessions expire after 12 hours or a server restart. Replace the key and restart MagnetServer to rotate it.</p><div class="form-actions">${button('Sign out','logout')}</div></div></section>`; }

const historyRequests=new Map();
async function loadHistory(){
 const node=state.node;if(!state.authenticated||!selectedNode()||!['server'].includes(state.page))return;
 let request=historyRequests.get(node);if(!request){request=api(`/nodes/${encodeURIComponent(node)}/history`);historyRequests.set(node,request);}
 try{const history=await request;if(state.node===node&&['server'].includes(state.page)){state.history=history;drawChart();}}
 finally{if(historyRequests.get(node)===request)historyRequests.delete(node);}
}
async function refresh() {
 if(polling||!state.authenticated)return;polling=true;let scopeChanged=false;
 try {
  const node=state.node,scope=node?'?node='+encodeURIComponent(node):'';
  const session=await api('/session'),previouslyEnabled=state.totpEnabled;state.user=session.user;state.totpEnabled=session.totp_enabled;if(previouslyEnabled&&!state.totpEnabled)lockSensitiveUI();
  const [nodes,jobs,alerts,events,serverGroups]=await Promise.all([api('/nodes'),state.totpEnabled?api('/jobs'+scope):[],state.totpEnabled?api('/alerts'):[],api('/events'+scope),api('/server-groups')]);
  if(!state.authenticated)return;if(state.node!==node){scopeChanged=true;return;}
  for(const n of nodes){n.system_hostname=n.hostname;n.hostname=n.display_name||n.hostname;}
  Object.assign(state,{nodes,serverGroups,jobs,alerts,events,nodesLoaded:true});
  if(state.node&&!nodes.some(n=>n.id===state.node)){closeModal(true);closeFileEditor(true);location.replace('#servers');return;}
  if(state.modalKind==='enrollment'&&state.enrollmentNode&&$('#modal').open){
   const connected=nodes.find(n=>n.id===state.enrollmentNode&&n.online);
   if(connected){closeModal();toast(connected.hostname+' connected');}
   else if(Date.now()/1000>=state.enrollmentExpires){stopEnrollmentWatch();toast('The setup command expired. Generate a new command to connect your server.');}
  }
  for(const id of state.selected)if(!nodes.some(n=>n.id===id))state.selected.delete(id);
  $('#refresh-time').textContent='Last synced '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  updateNavigationShell();
  const focused=document.activeElement;const editing=$('#main').contains(focused)&&focused.matches('input,textarea,select,button,a,tr[tabindex]');
  if(!editing && ['overview','servers','server','jobs','alerts'].includes(state.page))render();
  if(state.page==='docker'&&state.totpEnabled) { const template=document.createElement('template');template.innerHTML=docker();const panel=template.content.querySelector('#container-panel');if(panel&&$('#container-panel'))$('#container-panel').replaceWith(panel); }
  for(const [id,watch] of state.watched){const job=jobs.find(j=>j.id===id);if(!job||!['succeeded','failed','unknown'].includes(job.status))continue;state.watched.delete(id);if(watch.node!==state.node || (watch.path && $('#compose-path')?.value!==watch.path))continue;const el=$(watch.target);if(el&&job.status==='succeeded')el.value=job.output;else if(job.status!=='succeeded')toast(job.output||'Operation failed');}
  if(state.page==='monitorings'||(state.page==='services'&&state.totpEnabled))loadStatusMonitorings();if(state.page==='access')loadAccessPage();
  if(state.modalJob && $('#modal').open)updateJobModal();
  if(['server'].includes(state.page))await loadHistory();
 }catch(err){$('#refresh-time').textContent='Unable to refresh · Retrying automatically';if(state.authenticated)toast(err.message);}finally{polling=false;if(scopeChanged&&state.authenticated)queueMicrotask(refresh);}
}
async function uploadDebPackage(file){
 if(!file)return;
 if(!file.name.toLowerCase().endsWith('.deb')||file.size<72||file.size>512*1024*1024)throw new Error('Choose a .deb package up to 512 MiB.');
 const targets=operationTargets(),node=state.node,page=state.page,button=$('[data-action="deb-upload"]'),status=$('#deb-upload-status');
 if(!targets.length)throw new Error('Select at least one server first');
 if(targets.some(id=>!state.nodes.find(node=>node.id===id)?.online))throw new Error('Selected servers must be online to install a package.');
 const params=new URLSearchParams({name:file.name});targets.forEach(id=>params.append('node',id));
 setButtonBusy(button,true);if(status)status.textContent='Uploading '+file.name+' · '+bytes(file.size);
 try{
  const upload=await api('/packages?'+params,{method:'POST',headers:{'Content-Type':'application/vnd.debian.binary-package'},body:file});
  if(state.node!==node||state.page!==page||JSON.stringify(operationTargets())!==JSON.stringify(targets))throw new Error('Package uploaded, but the selected servers changed. Upload again for the current selection.');
  if(status)status.textContent=upload.name+' uploaded. Links will download and install the package.';
  await dispatchAction('deb.install',{upload_id:upload.id},targets);
 }catch(error){if(status?.isConnected)status.textContent=error.message;throw error;}
 finally{setButtonBusy(button,false);}
}
async function dispatchAction(kind,args={},nodes=null,watch=null,show=true) {
 nodes=nodes||[state.node];if(!nodes.length||!nodes[0])throw new Error('Select at least one server first');
 const reply=await post('/jobs',{kind,args,nodes});toast(`${operationLabel(kind)} started on ${nodes.length} server${nodes.length===1?'':'s'}`);
 if(watch)state.watched.set(reply.ids[0],{target:watch,node:nodes[0],path:args.path||''});
 if(show){state.modalJob=reply.ids[0];modal('Operation started',`<div class="notice">${esc(operationLabel(kind))} · Running on the selected server${nodes.length===1?'':'s'}.</div><pre class="job-output">Output will appear here automatically.</pre><div class="form-actions"><a href="${esc(pageURL('jobs'))}">View all operations →</a></div>`,'job');}
 for(const [i,id] of reply.ids.entries())followJob(id,['compose.write','cron.write'].includes(kind)?{kind,node:nodes[i],content:args.content,path:args.path}:null).catch(error=>{if(state.authenticated)toast(error.message);});
 const failures=Object.values(reply.delivery_errors||{});if(failures.length)toast(failures[0]);
 await refresh();return reply;
}
function updateJobModal(){const j=state.jobs.find(j=>j.id===state.modalJob);if(!j)return;$('#modal-title').textContent=operationLabel(j.kind);$('#modal-content').innerHTML=`<p class="hint">${esc(state.nodes.find(n=>n.id===j.node_id)?.hostname||'Server')} · ${badge(j.status)}</p><pre class="job-output">${esc(j.output||(['queued','running'].includes(j.status)?'Waiting for node output…':'Operation completed without output.'))}</pre><p class="hint">${j.status==='unknown'?'Inspect the server before submitting this operation again.':'Updates automatically while this dialog is open.'}</p>`;}
function addServer(){modal('Connect a server',`<p class="hint">Bring a Debian or Ubuntu server into your workspace. A one-time setup key is generated for this connection.</p><ol class="hint"><li>Place the MagnetLink Linux binary on your server.</li><li>Generate a command and run it in that directory.</li><li>Your server appears automatically.</li></ol><label class="check"><input id="setup-script" type="checkbox">Run the optional server-configured setup script</label><p class="hint">Setup scripts are off by default. The command installs MagnetLink as a systemd service.</p><div id="enrollment-command"></div><div class="form-actions">${button('Generate setup command →','generate-command','primary')}</div>`,'enrollment');}
function alertForm(id='') {
 const a=state.alerts.find(r=>r.id===id)||{name:'',metric:'cpu',threshold:85,url:'',method:'POST',cooldown:300,node_id:state.node};
 modal(id?'Edit alert rule':'Create an alert rule',`<form id="alert-form" data-id="${esc(id)}"><p class="hint">Applies to ${esc(state.nodes.find(node=>node.id===a.node_id)?.hostname||'all servers in this workspace')}.</p><label>Rule name<input name="name" required value="${esc(a.name)}" placeholder="High CPU usage"></label><div class="form-grid"><label>Metric<select name="metric">${['cpu','ram','disk','load','offline'].map(m=>`<option ${m===a.metric?'selected':''}>${m}</option>`).join('')}</select></label><label>Greater than<input name="threshold" type="number" step="any" min="0" value="${a.threshold}" required></label><input type="hidden" name="node_id" value="${esc(a.node_id)}"><label>Cooldown (seconds)<input name="cooldown" type="number" min="60" max="86400" value="${a.cooldown}" required></label></div><p class="hint">CPU, RAM, disk: percentage. Load: 1 minute average. Offline: seconds since last heartbeat.</p><label>Callback URL<input name="url" type="url" value="${esc(a.url)}" placeholder="https://hooks.example.com/…" required></label><label>Request method<select name="method"><option value="POST" ${a.method==='POST'?'selected':''}>POST · JSON webhook</option><option value="GET" ${a.method==='GET'?'selected':''}>GET · HTTP request with query values</option></select></label><div class="form-actions"><button class="primary" type="submit">Save alert rule →</button></div></form>`);
}
function confirmAction(title,text,action){modal(title,`<p class="hint">${esc(text)}</p><div class="form-actions">${button('Cancel','close-modal')}${button('Confirm','confirm-action','primary')}</div>`);$('#modal-content [data-action="confirm-action"]').addEventListener('click',async event=>{const confirm=event.currentTarget,version=modalVersion;if(confirm.disabled)return;setButtonBusy(confirm,true);try{await action();if(version===modalVersion)closeModal();}catch(e){toast(e.message);}finally{setButtonBusy(confirm,false);}});}
async function browseFiles(){return explorerBrowse();}
function setTheme(theme){localStorage.setItem('magnet-theme',theme);document.documentElement.dataset.theme=theme;$('#theme-toggle').title='Theme: '+theme;if(state.page==='settings')render();}
function utf8Base64(text){const b=new TextEncoder().encode(text);let s='';for(const n of b)s+=String.fromCharCode(n);return btoa(s);}
function base64Bytes(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}

const actions={
 'add':addServer,'close-modal':()=>closeModal(),
 'go-apps':()=>goPage(state.node?'apps':'batch'),'go-docker':()=>goPage(state.node?'docker':'servers'),'go-connect':()=>goPage(state.node?'connect':'servers'),
 'open-server':el=>goPage('server',el.dataset.id),
 'generate-command':async()=>{const version=modalVersion;const result=await post('/enrollments',{script:$('#setup-script').checked});if(version!==modalVersion||!$('#modal').open||state.modalKind!=='enrollment'||$('#modal').classList.contains('is-closing'))return;stopEnrollmentWatch();state.enrollmentNode=result.node_id;state.enrollmentExpires=result.expires;enrollmentPollTimer=setInterval(refresh,2000);$('#enrollment-command').innerHTML=`<div class="code-box" id="setup-command"></div><p class="hint">Single use · Expires ${new Date(result.expires*1000).toLocaleTimeString()}</p>${button('Copy command','copy-command')}`;$('#setup-command').textContent=result.command;},
 'copy-command':async()=>{const text=$('#setup-command').textContent;if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);toast('Setup command copied');}else{const range=document.createRange();range.selectNodeContents($('#setup-command'));const s=window.getSelection();s.removeAllRanges();s.addRange(range);toast('Command selected. Press Ctrl+C to copy.');}},
 'clear-selection':()=>{state.selected.clear();closeModal(true);paintFleetSelection();},
 'fleet-batch-actions':()=>{if(!state.selected.size)return;modal('Batch actions',`<p class="hint"><span>Selected servers</span>: ${state.selected.size}</p><div class="batch-action-list">${button('Install packages','batch-install')}${button('Update packages','batch-update')}${button('Clear selection','clear-selection','ghost')}</div>`);},
 'batch-install':()=>goPage('batch',''),
 'batch-update':()=>{const nodes=operationTargets();if(!nodes.length)throw new Error('Select servers to update first');confirmAction(state.node?'Update server packages?':'Update selected servers?',`Upgrade packages on ${nodes.length} server(s). This can restart services.`,async()=>{await dispatchAction('apt.update',{},nodes,null,false);goPage('jobs');});},
 'apt-install':()=>{const packages=$('#apt-packages').value.trim();if(!packages)throw new Error('Enter package names');return dispatchAction('apt.install',{packages},operationTargets());},
 'deb-upload':()=>{if(!operationTargets().length)throw new Error('Select servers first');$('#deb-upload-file').click();},
 'deb-install':()=>{const url=$('#deb-url').value.trim();if(!url)throw new Error('Enter a package URL');return dispatchAction('deb.install',{url},operationTargets());},
 'chart':el=>{state.chart=el.dataset.metric;$$('[data-action="chart"]').forEach(e=>{e.classList.toggle('active',e===el);e.setAttribute('aria-pressed',String(e===el));});drawChart();},
 'server-detail':el=>{const n=state.nodes.find(n=>n.id===el.dataset.id);if(!n)return;modal(n.hostname,`<p class="hint">${privateAddress(n.address)} · ${esc(n.os)} · ${esc(n.arch)}</p><dl class="server-metadata"><div><dt>Link version</dt><dd>${esc(linkVersionLabel(n))}</dd></div></dl>${badge(n.online?'online':'offline')}<div class="form-grid"><div class="code-box">CPU ${pct(n.metrics.cpu)}${n.online?resourceUsageWarning(n.metrics.cpu,'CPU'):''}<br>RAM ${pct(n.metrics.ram)}${n.online?resourceUsageWarning(n.metrics.ram,'Memory'):''}<br>Root disk (/) ${pct(n.metrics.disk)}${n.online?resourceUsageWarning(n.metrics.disk,'Root disk (/)'):''}</div><div class="code-box">${networkRates([n])}<br>Load ${n.metrics.load.toFixed(2)}</div></div><div class="form-actions">${button('Edit node','edit-node','',`data-id="${esc(n.id)}"`)}${button('Terminal & files','node-connect','',`data-id="${esc(n.id)}"`)}${button('View overview →','node-monitor','primary',`data-id="${esc(n.id)}"`)}</div>`,'',true);},
 'node-monitor':el=>goPage('server',el.dataset.id),
 'node-connect':el=>goPage('connect',el.dataset.id),
 'edit-node':el=>editNodeDialog(el.dataset.id),
 'uninstall-link':el=>confirmAction('Uninstall MagnetLink?', 'This removes the installed Link service, executable, and credentials from this node. Other applications and files stay on the node. Its record and history remain in Magnet until you remove them. Requires an online Link running as root.',async()=>{await post('/jobs',{nodes:[el.dataset.id],kind:'link.uninstall',args:{}});closeModal();toast('Link uninstall dispatched. Follow its result in Activity & jobs.');}),
 'revoke-node':el=>confirmAction('Revoke this Link?','The node will lose access immediately. Its metrics, jobs, service checks and check history will be deleted. Workspace monitorings and their custom services remain. The node service remains installed.',async()=>{await api('/nodes/'+el.dataset.id,{method:'DELETE'});await refresh();}),
 'container-action':el=>{const action=el.dataset.kind,container=el.dataset.container;if(action==='update'){modal('Edit container restart policy',`<p class="hint">${esc(container)} · Change when Docker restarts this container. Edit the Compose file to change ports, volumes, image, or environment.</p><label>Restart policy<select id="restart-policy"><option>unless-stopped</option><option>always</option><option>on-failure</option><option>no</option></select></label><div class="form-actions">${button('Save policy','docker-policy','primary',`data-container="${esc(container)}"`)}</div>`);return;}confirmAction(action==='rm'?'Delete container?':`${action[0].toUpperCase()+action.slice(1)} container?`,`${container} on ${selectedNode()?.hostname}.`,async()=>{await dispatchAction('docker.action',{container,action},null,null,false);toast('Container operation dispatched');});},
 'docker-policy':el=>dispatchAction('docker.action',{container:el.dataset.container,action:'update',restart:$('#restart-policy').value}),
 'compose-save':saveComposeFile,
 'compose-open':openComposeFile,
 'compose-editor-close':()=>closeComposeEditor(),
 'compose-up':deployComposeProject,
 'service-action':async el=>{await managedJob('service.action',{unit:el.dataset.unit,action:el.dataset.kind});await loadServices();},
 'service-edit':el=>editService(el.dataset.unit),
 'cron-save':saveAdvancedCrontab,
 'service-create':openServiceCreator,
 'service-preview':previewNewService,
 'cron-create':()=>openCronTask(),
 'cron-edit':el=>openCronTask(Number(el.dataset.line)),
 'cron-toggle':el=>changeCronTask(Number(el.dataset.line),'toggle'),
 'cron-delete':el=>changeCronTask(Number(el.dataset.line),'delete'),
 'cron-reload':()=>reloadCronTasks(),
 'job-output':el=>{state.modalJob=el.dataset.id;modal('Job output','','job');updateJobModal();},
 'new-alert':()=>alertForm(),'edit-alert':el=>alertForm(el.dataset.id),
 'delete-alert':el=>confirmAction('Delete this alert rule?','This callback will no longer be sent.',async()=>{await api('/alerts/'+el.dataset.id,{method:'DELETE'});await refresh();}),
 'set-theme':el=>setTheme(el.dataset.theme),
 'logout':async()=>{closeFileEditor(true);await post('/logout',{});closeModal();state.authenticated=false;redirectToLogin(false);},
 'file-browse':browseFiles,
 'file-directory':el=>{$('#file-path').value=el.dataset.path;return browseFiles();},
};
// Keep selection and explicit controls independent from the row's navigation.
function serverRowFromEvent(event){
 const row=event.target.closest('tr[data-server-id]');
 if(!row||event.defaultPrevented||event.target.closest('a,button,input,select,textarea,label,[role="button"],.server-resource-warning,.server-select-cell'))return null;
 if(window.getSelection()?.toString())return null;
 return row;
}
document.addEventListener('click',event=>{
 if(event.button!==0)return;const row=serverRowFromEvent(event);if(!row)return;
 if(event.ctrlKey||event.metaKey||event.shiftKey)window.open(pageURL('server',row.dataset.serverId),'_blank','noopener');
 else goPage('server',row.dataset.serverId);
});
document.addEventListener('auxclick',event=>{if(event.button!==1)return;const row=serverRowFromEvent(event);if(row){event.preventDefault();window.open(pageURL('server',row.dataset.serverId),'_blank','noopener');}});
document.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||!event.target.matches('tr[data-server-id]'))return;event.preventDefault();goPage('server',event.target.dataset.serverId);});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;const action=actions[el.dataset.action];if(!action||el.disabled)return;try{setButtonBusy(el,true);await action(el);}catch(err){toast(err.message);}finally{setButtonBusy(el,false);}});
document.addEventListener('change',async e=>{try{
 if(e.target.dataset.select){if(e.target.checked)state.selected.add(e.target.dataset.select);else state.selected.delete(e.target.dataset.select);if(['overview','servers'].includes(state.page))paintFleetSelection();}
 if(e.target.id==='select-all'){const ids=$$('[data-select]').map(el=>el.dataset.select);for(const id of ids){if(e.target.checked)state.selected.add(id);else state.selected.delete(id);}paintFleetSelection();}
 if(e.target.id==='status-filter'){state.onlineFilter=e.target.value;$('#main').innerHTML=state.page==='overview'?overview():servers();paintFleetSelection();drawChart();}
 if(e.target.id==='deb-upload-file'){try{await uploadDebPackage(e.target.files[0]);}finally{e.target.value='';}return;}
 if(e.target.id==='file-upload'){await uploadLinkFile(e.target.files[0]);return;}
 }catch(err){toast(err.message);}});
document.addEventListener('input',e=>{if(e.target.id==='server-search'){const value=e.target.value,position=e.target.selectionStart;state.filter=value;const panel=e.target.closest('.panel');panel.outerHTML=serverTable(state.page==='overview');const input=$('#server-search');input.focus({preventScroll:true});input.setSelectionRange(position,position);paintFleetSelection();}});
document.addEventListener('submit',async e=>{if(!['alert-form'].includes(e.target.id))return;e.preventDefault();const submit=$('button[type="submit"]',e.target);setButtonBusy(submit,true);try{
 if(e.target.id==='alert-form'){const data=Object.fromEntries(new FormData(e.target));data.threshold=Number(data.threshold);data.cooldown=Number(data.cooldown);data.id=e.target.dataset.id;await post('/alerts',data);closeModal();toast('Alert rule saved');await refresh();}
 }catch(err){toast(err.message);}finally{setButtonBusy(submit,false);}});
$('#modal-close').addEventListener('click',()=>closeModal());$('#modal').addEventListener('cancel',event=>{event.preventDefault();closeModal();});$('#modal').addEventListener('close',()=>{if(!$('#modal').open){resetModalClose();stopEnrollmentWatch();state.modalJob=null;state.modalKind='';$('#modal-content').replaceChildren();}});
let backdropDialog=null;
function outsideDialog(event,dialog){const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;}
document.addEventListener('pointerdown',event=>{backdropDialog=event.target instanceof HTMLDialogElement&&outsideDialog(event,event.target)?event.target:null;});
document.addEventListener('click',event=>{
 const dialog=backdropDialog;backdropDialog=null;if(!dialog||event.target!==dialog||!outsideDialog(event,dialog))return;
 if(dialog.id==='modal')closeModal();else if(dialog.id==='file-editor-dialog')closeFileEditor();else if(dialog.id==='compose-editor-dialog')closeComposeEditor();else if(dialog.id==='step-up-dialog')finishStepUp(new Error('Verification cancelled'));
});
$('#logout').addEventListener('click',()=>actions.logout().catch(e=>toast(e.message)));
function setNavigationOpen(open,restoreFocus=false){
 const sidebar=$('.sidebar'),toggle=$('#mobile-menu');
 sidebar.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));
 $('#sidebar-backdrop').hidden=!open;document.body.classList.toggle('navigation-open',open);
 if(open)sidebar.querySelector('a.active,a')?.focus();else if(restoreFocus)toggle.focus();
}
$('#mobile-menu').addEventListener('click',()=>setNavigationOpen(!$('.sidebar').classList.contains('open')));
$('#sidebar-backdrop').addEventListener('click',()=>setNavigationOpen(false,true));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('.sidebar').classList.contains('open')&&!document.querySelector('dialog[open]')){event.preventDefault();setNavigationOpen(false,true);}});
document.addEventListener('focusin',event=>{if($('.sidebar').classList.contains('open')&&!event.target.closest('.sidebar')&&event.target.id!=='mobile-menu'&&!event.target.closest('dialog'))setNavigationOpen(false);});
window.matchMedia('(min-width:801px)').addEventListener('change',()=>setNavigationOpen(false));
$('.skip-link').addEventListener('click',event=>{event.preventDefault();setNavigationOpen(false);resetPageScroll();$('#main').focus();});
$('#theme-toggle').addEventListener('click',()=>{const list=['auto','light','dark'];const theme=list[(list.indexOf(document.documentElement.dataset.theme)+1)%3];setTheme(theme);toast('Theme: '+theme);});
async function focusSearch(){if(location.hash!=='#servers')history.pushState(null,'','#servers');await navigation();$('#server-search')?.focus();}
$('#search-trigger').addEventListener('click',focusSearch);document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!e.target.isContentEditable&&!document.querySelector('dialog[open]')){e.preventDefault();focusSearch();}});
window.addEventListener('hashchange',navigation);
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon,16));
setTheme(localStorage.getItem('magnet-theme')||'auto');navigation();
async function boot(){try{try{const saved=sessionStorage.getItem('magnet-login-route');sessionStorage.removeItem('magnet-login-route');if(saved?.startsWith('#')&&!location.hash)history.replaceState(null,'',location.pathname+saved);}catch{}const session=await api('/session');state.user=session.user;state.publicURL=session.public_url;state.database=session.database;state.totpEnabled=session.totp_enabled;state.authenticated=true;await refresh();await navigation();}catch(err){if(state.authenticated)toast(err.message);}}
registerServerGroupActions();registerCleanupActions();registerConfigurationActions();registerManagementActions();registerWorkspaceActions();registerStatusActions();registerAccountActions();boot();setInterval(refresh,10000);

async function editNodeDialog(id){
 const originalPage=state.page,originalNode=state.node,version=modalVersion;await ensureIconPresets();if(state.page!==originalPage||state.node!==originalNode||modalVersion!==version)return;
 const n=state.nodes.find(n=>n.id===id);if(!n)return;
 modal('Edit node',`<form id="node-edit-form" data-id="${esc(id)}" data-image="${esc(n.icon||'')}"><label>Display name<input name="name" maxlength="255" value="${esc(n.display_name||'')}" placeholder="${esc(n.system_hostname||n.hostname)}"></label><p class="hint">An empty name uses the system hostname. This changes the name in Magnet.</p><div class="code-box">Hostname: ${esc(n.system_hostname||n.hostname)}<br>Public IPv4: ${privateAddress(n.address)}<br>System: ${esc(n.os)}<br>Link version: ${esc(linkVersionLabel(n))}</div>${imageControls(n.icon||'',true)}<div class="form-actions"><button type="submit" class="primary">Save settings</button></div></form><hr><h3>Link management</h3><p class="hint">Uninstall removes Link from an online node and retains its history. Revoke removes the node and its history from Magnet immediately; the service remains installed.</p><div class="form-actions">${button('Uninstall Link','uninstall-link','danger',`data-id="${esc(id)}" ${n.online?'':'disabled'}`)}${button('Revoke & remove node','revoke-node','danger',`data-id="${esc(id)}"`)}</div>`);
}
document.addEventListener('submit',async event=>{
 if(event.target.id!=='node-edit-form')return;event.preventDefault();const form=event.target,submit=form.querySelector('[type="submit"]');setButtonBusy(submit,true);
 try{await api('/nodes/'+encodeURIComponent(form.dataset.id),{method:'PATCH',body:{name:new FormData(form).get('name'),icon:form.dataset.image||''}});closeModal();await refresh();toast('Server settings saved');}catch(err){toast(err.message);}finally{setButtonBusy(submit,false);}
});

// Long-poll completion changes instead of delaying output until workspace refresh.
async function followJob(id,draft=null){
 const deadline=Date.now()+36*60*1000;
 while(state.authenticated&&Date.now()<deadline){
  const job=await api('/jobs/'+encodeURIComponent(id)+'?wait=1');
  if(!state.authenticated)return;
  const existing=state.jobs.findIndex(item=>item.id===id);if(existing>=0)state.jobs[existing]=job;else state.jobs.unshift(job);
  if(['running','queued'].includes(job.status))continue;
  if(draft&&job.status==='succeeded'&&draft.node===state.node){if(draft.kind==='cron.write'&&screenData.cronContent===draft.content)screenData.cronDirty=false;}
  const watch=state.watched.get(id);
  if(watch){state.watched.delete(id);const target=$(watch.target);if(watch.node===state.node&&(!watch.path||$('#compose-path')?.value===watch.path)&&target){if(job.status==='succeeded')target.value=job.output;else toast(job.output||'Operation failed');}}
  if(state.modalJob===id&&$('#modal').open)updateJobModal();
  if(state.page==='jobs')render();
  if(job.status==='succeeded'&&job.node_id===state.node){if(state.page==='docker'&&['docker.action','compose.up'].includes(job.kind))Promise.all([loadContainers(),loadComposes()]);if(state.page==='startup'&&job.kind==='service.action')loadServices();}
  if(state.page==='docker'&&state.totpEnabled){const template=document.createElement('template');template.innerHTML=docker();const panel=template.content.querySelector('#container-panel');if(panel&&$('#container-panel'))$('#container-panel').replaceWith(panel);}
  return;
 }
}

document.addEventListener('magnetlanguagechange',()=>{if(state.authenticated)updateNavigationShell();});
