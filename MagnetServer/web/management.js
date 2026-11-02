'use strict';
const managed={node:'',users:null,linkConnected:false,linkOutput:'',databases:[],dbSearch:'',dbSearchLimited:false,dbSelected:null,dbConnected:false,dbArgs:null,schemas:[],tables:[],dbSchema:'',dbTable:'',result:null,dbUsers:null,sql:'SELECT VERSION();',execution:'query',busy:0,loads:new Set()};
let stepUpPromise=null,stepUpResolve=null,stepUpReject=null;
function ensureManagedNode(){if(managed.node===state.node)return;resetDatabaseView();Object.assign(managed,{node:state.node,users:null,linkConnected:false,linkOutput:'',databases:[],dbSearch:'',dbSearchLimited:false,dbSelected:null,dbConnected:false,dbArgs:null,schemas:[],tables:[],dbSchema:'',dbTable:'',result:null,dbUsers:null,sql:'SELECT VERSION();',execution:'query'});}
function managedStatus(){return '<span class="hint managed-status" role="status">'+(managed.busy?'Waiting for the Link to finish this operation…':'Operations run through the encrypted Link.')+'</span>';}
function updateManagedStatus(){document.querySelectorAll('.managed-status').forEach(el=>el.textContent=managed.busy?'Waiting for the Link to finish this operation…':'Operations run through the encrypted Link.');}
async function managedJob(kind,args={},node=state.node){
 if(!node)throw new Error('Select a node first');if(!state.totpEnabled)throw new Error('Set up an authenticator in Settings before accessing sensitive tools');managed.busy++;updateManagedStatus();
 try{
  const result=await post('/jobs',{nodes:[node],kind,args});if(result.delivery_errors?.[node])throw new Error(result.delivery_errors[node]);const id=result.ids[0],deadline=Date.now()+36*60*1000;
  while(Date.now()<deadline){
   const job=await api('/jobs/'+encodeURIComponent(id)+'?wait=1');
   if(job.status==='succeeded'){if(state.node!==node)throw new Error('The operation finished on the previous node. Its output is in Activity & jobs.');return job.output;}
   if(['failed','unknown'].includes(job.status))throw new Error(job.output||'Node operation failed');
  }
  throw new Error('The operation is still pending. Check Activity & jobs before retrying.');
 }finally{managed.busy--;updateManagedStatus();}
}
async function managedJSON(kind,args={}){return JSON.parse(await managedJob(kind,args));}
function lockSensitiveUI(){
 modalVersion++;serverGroupEditorRequest++;closeModal(true);closeFileEditor(true);closeComposeEditor(true);resetContainerTools();resetCleanupView();clearDatabaseConnection();
 managed.databases=[];managed.dbSearch='';managed.linkConnected=false;managed.linkOutput='';managed.users=null;screenData.version++;screenData.containers=null;screenData.services=null;screenData.composes=null;screenData.cronContent='';screenData.cronDirty=false;screenData.cronLoaded=false;screenData.cronRevision='';screenData.cronUser='';screenData.cronTimezone='';
 explorer.key='';explorer.files=[];explorer.opened='';explorer.drafts.clear();explorer.request++;explorer.openRequest++;
 statusAdmin.version++;statusAdmin.pending=null;statusAdmin.services=[];statusAdmin.loaded=false;accountAdmin.loaded=false;accountAdmin.version++;accountAdmin.pending=null;screenData.pending.clear();state.watched.clear();
 state.jobs=[];state.alerts=[];if(state.authenticated)render();
}
function totpSetupNotice(){return '<section class="panel"><div class="section-body"><h3>Authenticator setup required</h3><p class="hint">Set up an authenticator in Settings before accessing sensitive tools.</p><a class="context-link" href="#settings">Open Settings →</a></div></section>';}
async function loadManagedPage(fresh=true){if(!state.totpEnabled)return;await loadScreenData(fresh);}
function usersPage(){
 ensureManagedNode();let html=heading('The people behind your node.','View Debian accounts, update access, and create or remove users.',button('＋ Create user','unix-user-new','primary'));
 if(!state.nodes.length)return html+requireNodes('servers','Connect a node to manage its Linux users.');
 return html+`<section class="panel" id="users-panel"><div class="toolbar"><div><h3>Debian / Ubuntu users</h3><p>System accounts are included. Deletion preserves home directories.</p></div></div><div class="section-body">${managedStatus()}${managed.users!==null?screenStatus('users'):""}</div>${managed.users===null?screenStatus('users','Loading node accounts…'):`<div class="table-scroll"><table><thead><tr><th>User</th><th>UID / GID</th><th>Groups</th><th>Home / shell</th><th></th></tr></thead><tbody>${managed.users.map(u=>`<tr><td data-i18n-skip><strong>${esc(u.name)}</strong><small>${esc(u.comment)}</small></td><td>${u.uid} / ${u.gid}</td><td data-i18n-skip>${esc(u.groups)}</td><td>${esc(u.home)}<small>${esc(u.shell)}</small></td><td>${button('Edit','unix-user-edit','',`data-name="${esc(u.name)}"`)} ${u.uid!==0?button('Remove','unix-user-delete','danger',`data-name="${esc(u.name)}"`):''}</td></tr>`).join('')}</tbody></table></div>`}</section>`;
}
async function loadUnixUsers(){return screenTask('users','users.list',{},text=>{managed.users=JSON.parse(text);});}
function unixUserForm(name=''){
 const u=managed.users?.find(u=>u.name===name)||{name:'',comment:'',home:'',shell:'/bin/bash',groups:''};
 modal(name?'Edit Linux user':'Create Linux user',`<form id="unix-user-form" data-edit="${name?'true':'false'}"><label>Username<input name="name" value="${esc(u.name)}" required ${name?'readonly':''} pattern="[a-z_][a-z0-9_-]{0,31}[$]?"></label><label>Description<input name="comment" value="${esc(u.comment)}"></label><div class="form-grid"><label>Home directory<input name="home" value="${esc(u.home)}" placeholder="/home/alex"></label><label>Login shell<input name="shell" value="${esc(u.shell)}" placeholder="/bin/bash"></label></div><label>Supplementary groups (comma-separated)<input name="groups" value="${esc(u.groups)}" placeholder="sudo,docker"></label><p class="hint">This replaces supplementary group membership. Existing home files are not moved.</p><label>${name?'New password (blank keeps current)':'Password (blank creates a locked-password account)'}<input name="password" type="password" autocomplete="new-password"></label>${name?'<label>Account password lock<select name="locked"><option value="">Leave unchanged</option><option value="true">Lock</option><option value="false">Unlock</option></select></label>':''}<p class="hint">User-management commands require the Link account to be root.</p><div class="form-actions"><button class="primary" type="submit">Save user →</button></div></form>`);
}
function linkConnectionBody(){
 const n=selectedNode();if(!n)return requireNodes('connect','Connect a node to open its Link shell and files.');
 const info=`${n.metrics.link_user||'Link account'}${n.metrics.link_user?' · UID '+n.metrics.link_uid:''}`;
 if(!managed.linkConnected)return `<section class="panel"><div class="section-body"><h3>${esc(info)}</h3>${screenStatus('linkConnection','Connecting as the Link user…')}${screenData.errors.linkConnection?button('Retry connection','link-connect','primary'):''}</div></section>`;
 return `<section class="panel"><div class="section-body"><h3>${esc(info)}</h3><p class="hint">Commands run as the Link user in separate shells. Use an explicit cd in each command when needed.</p><pre id="link-terminal-output" class="terminal">${esc(managed.linkOutput)}</pre><form id="link-terminal-form" class="terminal-input"><input name="command" required aria-label="Link command" autocomplete="off" placeholder="whoami"><button type="submit">Run ↵</button></form>${managedStatus()}</div></section>${fileExplorerHTML()}`;
}
function linkArgs(args){return args;}
async function connectLinkAccount(){return screenTask('linkConnection','link.shell',{command:'id'},text=>{managed.linkConnected=true;managed.linkOutput=text;if(state.page==='connect')render();});}

function fileListHTML(files,path){return `<div class="file-row">${icon('folder',14)}<span>..</span>${button('Open','file-directory','',`data-path="${esc(path.replace(/\/?[^/]+\/?$/,'')||'/')}"`)}</div>`+files.map(f=>`<div class="file-row">${icon(f.directory?'folder':'jobs',14)}<span>${esc(f.name)}</span><small>${esc(f.mode)} · ${bytes(f.size)}</small>${button('Open',f.directory?'file-directory':'file-read','',`data-path="${esc(path.replace(/\/$/,'')+'/'+f.name)}"`)}</div>`).join('');}
async function browseLinkFiles(){return explorerBrowse();}
async function uploadLinkFile(file){if(!file)return;if(file.size>128*1024)throw new Error('Link transfers are limited to 128 KiB');const path=$('#file-path').value.replace(/\/$/,'')+'/'+file.name;const data=new Uint8Array(await file.arrayBuffer());let text='';for(const b of data)text+=String.fromCharCode(b);const content=btoa(text);confirmAction('Upload remote file?',`Write ${path} as the Link account. An existing file will be replaced.`,async()=>{await managedJob('link.file.write',linkArgs({path,content}));toast('File uploaded');await browseFiles();});}

function databaseConnectionStatus(){return `<section class="panel"><div class="section-body">${screenStatus('databaseConnection','Connecting to database…')}${screenData.errors.databaseConnection?button('Retry connection','database-connect','primary'):''}</div></section>`;}
async function connectNodeDatabase(){
 const selected=managed.dbSelected;if(!selected)return false;
 const args={engine:selected.engine,endpoint:selected.endpoint};
 return screenTask('databaseConnection','database.ping',args,text=>{managed.dbArgs=args;managed.dbConnected=true;managed.result=JSON.parse(text);managed.sql=selected.engine==='sqlite'?'SELECT sqlite_version();':'SELECT VERSION();';});
}
function databaseListRows(){
 const search=managed.dbSearch.toLowerCase();
 return managed.databases.filter(item=>[item.name,item.engine,item.endpoint].some(value=>value.toLowerCase().includes(search))).map(item=>`<tr data-action="database-open" data-id="${esc(item.id)}" tabindex="0"><td>${button(esc(item.name),'database-open','ghost',`data-id="${esc(item.id)}"`)}</td><td data-i18n-skip>${esc(item.engine)}</td><td data-i18n-skip><code>${esc(item.endpoint)}</code></td><td>${button('Open','database-open','',`data-id="${esc(item.id)}"`)}</td></tr>`).join('')||'<tr><td colspan="4">No matching databases found.</td></tr>';
}
async function openLocalDatabase(id){
 const selected=managed.databases.find(item=>item.id===id);if(!selected)return;
 clearDatabaseConnection();managed.dbSelected=selected;render();
 if(!await connectNodeDatabase()||state.page!=='databases')return;
 render();await loadSchemas();if(!managed.dbConnected||managed.dbSelected!==selected||state.page!=='databases')return;
 if(selected.engine==='mysql')await loadDatabaseUsers();
 if(managed.dbSelected!==selected)return;
 if(managed.schemas.length===1){managed.dbSchema=managed.schemas[0];await loadDatabaseTables();}
 paintDatabaseWorkspace();
}
function resultHTML(result){if(!result)return '<p class="hint">Choose a table or execute a statement to view results.</p>';if(!Array.isArray(result.columns))return `<div class="code-box">${esc(JSON.stringify(result,null,2))}</div>`;return `${result.truncated?'<div class="notice">Result limited to 200 rows and bounded cell/output sizes.</div>':''}<div class="table-scroll"><table><thead><tr>${result.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row=>`<tr>${row.map(value=>`<td>${value===null?'<span class="text-muted">NULL</span>':esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="hint">${result.rows.length} row(s)</p>`;}
function databasesPage(){
 ensureManagedNode();let html=heading('Your node’s databases, in view.','Discover local MySQL, MariaDB, PostgreSQL and SQLite databases.',button('Search again','database-discover')+button('Install MariaDB','database-install'));
 if(!state.nodes.length)return html+requireNodes('servers','Connect a node to manage databases.');
 html+=`<section class="panel" id="database-installation"><div class="toolbar"><div><h3>Available databases</h3><p>Local socket authentication uses the Link account. PostgreSQL requires psql; SQLite requires sqlite3. SQLite files are searched in common data directories.</p></div><input id="database-search" type="search" aria-label="Find database" placeholder="Find a database…" value="${esc(managed.dbSearch)}"></div><div class="section-body">${screenStatus('installation','Searching for databases…')}${managed.dbSearchLimited?'<p class="hint">Search limit reached. Some SQLite files may not be listed.</p>':''}</div><div class="table-scroll"><table><thead><tr><th>Database</th><th>Engine</th><th>Local endpoint</th><th></th></tr></thead><tbody id="database-list-rows">${databaseListRows()}</tbody></table></div></section>`;
 if(managed.dbSelected)html+=`<section class="panel"><div class="toolbar"><strong data-i18n-skip>${esc(managed.dbSelected.name)} · ${esc(managed.dbSelected.endpoint)}</strong>${button('Close connection','database-close')}</div></section>`;
 if(managed.dbSelected&&!managed.dbConnected)return html+databaseConnectionStatus();
 if(managed.dbConnected)html+=databaseWorkspace();
 return html;
}
async function inspectDatabases(){return screenTask('installation','database.status',{},text=>{const result=JSON.parse(text);if(!Array.isArray(result.databases))throw new Error('Update MagnetLink to discover local databases.');managed.databases=result.databases;managed.dbSearchLimited=Boolean(result.truncated);});}
function clearDatabaseConnection(){resetDatabaseView();screenData.version++;screenData.loading=new Set();Object.assign(managed,{dbConnected:false,dbArgs:null,dbSelected:null,dbSchema:'',dbTable:'',schemas:[],tables:[],result:null,dbUsers:null});}
function databaseArgs(extra={}){if(!managed.dbConnected||!managed.dbArgs)throw new Error('Connect to a database first');return {...managed.dbArgs,...(managed.dbSchema?{schema:managed.dbSchema}:{}),...extra};}
async function loadSchemas(){return screenTask('schemas','database.schemas',databaseArgs(),text=>{managed.schemas=JSON.parse(text).rows.map(row=>row[0]);});}
async function loadDatabaseUsers(){return screenTask('databaseUsers','database.users',databaseArgs(),text=>{managed.dbUsers=databaseRows(JSON.parse(text));});}
function databaseUserForm(name='',host=''){
 modal(name?'Edit MariaDB account':'Create MariaDB account',`<form id="database-user-form" data-edit="${name?'true':'false'}"><div class="form-grid"><label>Account name<input name="target_user" required value="${esc(name)}" ${name?'readonly':''}></label><label>Host<input name="target_host" required value="${esc(host||'localhost')}" ${name?'readonly':''}></label>${name?'<label>Rename to (optional)<input name="new_user"></label><label>New host (optional)<input name="new_host"></label>':''}</div><label>${name?'New password (blank keeps current)':'Password'}<input name="new_password" type="password" autocomplete="new-password" ${name?'':'required'}></label><label>Account lock<select name="locked"><option value="">Leave unchanged</option><option value="true">Lock</option><option value="false">Unlock</option></select></label><label>Privileges<select name="grant"><option value="preserve">Preserve current privileges</option><option value="read">Add read-only access</option><option value="write">Add read/write access</option><option value="all">Add all privileges on scope</option><option value="revoke">Revoke all privileges and grant option</option></select></label><label>Privilege scope (database name or *)<input name="grant_schema" value="${esc(managed.dbSchema||'*')}"></label><p class="hint">Adding access preserves other grants. Revoke removes all grants. Account changes commit individually.</p><div class="form-actions"><button class="primary" type="submit">Save database account →</button></div></form>`);
}

function securitySettings(){return `<section class="panel editor-panel"><div class="settings-section"><h3>Authenticator protection</h3><p>${state.totpEnabled?'TOTP is enabled. Sign-in and sensitive actions require verification. Verification stays active for 30 minutes of inactivity. Sensitive actions renew it within the current session.':'Set up an authenticator to unlock sensitive tools and server management.'}</p><div class="form-actions">${state.totpEnabled?button('Disable TOTP','totp-disable','danger'):button('Set up TOTP →','totp-start','primary')}</div></div></section>`;}
function languageSettings(){return `<section class="panel editor-panel"><div class="settings-section"><h3>Language</h3><p>Choose your interface language.</p><label>Language<select id="language-select">${[['auto','Automatic (system language)'],['en','English'],['ru','Russian']].map(([value,label])=>`<option value="${value}" ${magnetI18n.preference===value?'selected':''}>${label}</option>`).join('')}</select></label></div></section>`;}
function settingsPage(){return '<div class="settings-stack">'+avatarSettings()+languageSettings()+(state.user?.admin?settings()+(state.user.root?'':personalAccountSettings()):personalAccountSettings())+securitySettings()+'</div>';}
function requestStepUp(){
 if(stepUpPromise)return stepUpPromise;
 stepUpPromise=new Promise((resolve,reject)=>{stepUpResolve=resolve;stepUpReject=reject;});
 $('#step-up-error').textContent='';$('#step-up-form').reset();$('#step-up-dialog').showModal();return stepUpPromise;
}
function finishStepUp(error=null){
 const dialog=$('#step-up-dialog');if(!stepUpPromise||dialog.classList.contains('is-closing'))return;
 const resolve=stepUpResolve,reject=stepUpReject;dialog.classList.add('is-closing');
 setTimeout(()=>{dialog.close();dialog.classList.remove('is-closing');$('#step-up-form').reset();stepUpPromise=null;stepUpResolve=null;stepUpReject=null;if(error)reject?.(error);else resolve?.();},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:160);
}

function registerManagementActions(){
 const signout=actions.logout;actions.logout=async()=>{await signout();clearDatabaseConnection();Object.assign(managed,{linkConnected:false,linkOutput:'',users:null,sql:'SELECT VERSION();'});};
 Object.assign(actions,{
  'unix-user-new':()=>unixUserForm(),'unix-user-edit':el=>unixUserForm(el.dataset.name),
  'unix-user-delete':el=>confirmAction('Remove Linux account?',`Remove ${el.dataset.name} from ${selectedNode()?.hostname}. Its home directory and files will be preserved.`,async()=>{await managedJob('users.delete',{name:el.dataset.name});await loadUnixUsers();}),
  'link-connect':()=>loadManagedPage(),
  'database-install':()=>confirmAction('Install MariaDB Server?',`Install mariadb-server and start its systemd service on ${selectedNode()?.hostname}. Link must run as root.`,async()=>{await managedJob('database.install');await loadManagedPage();}),
  'database-connect':async()=>{if(await connectNodeDatabase()){render();await loadSchemas();if(managed.dbSelected?.engine==='mysql')await loadDatabaseUsers();}},
  'database-discover':()=>inspectDatabases(),'database-open':el=>openLocalDatabase(el.dataset.id),'database-close':()=>{clearDatabaseConnection();render();},
  'database-table':async el=>{managed.dbTable=el.dataset.table;managed.result=null;await loadDatabaseRows();},
  'database-user-new':()=>databaseUserForm(),'database-user-edit':el=>databaseUserForm(el.dataset.user,el.dataset.host),
  'database-user-delete':el=>confirmAction('Delete MariaDB account?',`Drop ${el.dataset.user}@${el.dataset.host}. This removes that account and its grants.`,async()=>{await managedJob('database.user.delete',databaseArgs({target_user:el.dataset.user,target_host:el.dataset.host}));await loadDatabaseUsers();}),
  'totp-start':()=>modal('Set up an authenticator',`<form id="totp-begin-form"><p class="hint">${state.user?.root?'Confirm your administrator access key.':'Confirm your current local password, or leave it empty after a recent OpenID login.'}</p><label>${state.user?.root?'Administrator access key':'Current local password'}<input name="key" type="password" autocomplete="current-password" ${state.user?.root?'required':''}></label><div class="form-actions"><button class="primary" type="submit">Continue →</button></div></form>`),
  'totp-disable':()=>modal('Disable authenticator protection',`<form id="totp-disable-form"><p class="hint">Enter a fresh authenticator code or an unused recovery code. A code already used in this 30-second window cannot be reused.</p><label>Code<input name="code" autocomplete="one-time-code" required></label><div class="form-actions"><button class="primary" type="submit">Disable TOTP</button></div></form>`)
 });

}

document.addEventListener('change',async event=>{try{
 if(event.target.id==='database-schema'){resetDatabaseView();managed.result=null;managed.dbSchema=event.target.value;managed.dbTable='';managed.tables=[];paintDatabaseWorkspace();if(managed.dbSchema)await loadDatabaseTables();else paintScreenData('tables');}
 if(event.target.id==='sql-execution')managed.execution=event.target.value;
}catch(error){toast(error.message);}});
document.addEventListener('input',event=>{if(event.target.id==='database-search'){managed.dbSearch=event.target.value;const rows=$('#database-list-rows');if(rows)rows.innerHTML=databaseListRows();}if(event.target.id==='sql-query')managed.sql=event.target.value;});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['service-edit-form','unix-user-form','database-query-form','database-user-form','link-terminal-form','totp-begin-form','totp-enable-form','totp-disable-form','step-up-form'].includes(form.id))return;
 event.preventDefault();const submit=form.querySelector('button[type="submit"]');setButtonBusy(submit,true);
 try{
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='service-edit-form'){if(form.dataset.node!==state.node)throw new Error('Server changed');const version=modalVersion;await managedJob('service.write',{unit:form.dataset.unit,content:data.content});if(version===modalVersion&&form.isConnected)closeModal();toast('Service override saved. Restart the service to apply runtime changes.');if(state.page==='startup')await loadServices();}
  if(form.id==='unix-user-form'){await managedJob(form.dataset.edit==='true'?'users.edit':'users.create',data);form.reset();closeModal();await loadUnixUsers();}
  if(form.id==='link-terminal-form'){const output=await managedJob('link.shell',linkArgs({command:data.command}));managed.linkOutput=(managed.linkOutput+'\n$ '+data.command+'\n'+output).slice(-200000);const log=$('#link-terminal-output');if(log){log.textContent=managed.linkOutput;log.scrollTop=log.scrollHeight;}form.reset();}
  if(form.id==='database-query-form'){const connection=managed.dbArgs;managed.dbTable='';managed.sql=data.query;managed.execution=data.execution;const result=await managedJSON('database.query',databaseArgs(data));if(managed.dbArgs===connection){dbView.queryResult=result;if(state.page==='databases')render();}}
  if(form.id==='database-user-form'){await managedJob('database.user.save',databaseArgs({...data,execution:form.dataset.edit==='true'?'edit':'create'}));form.reset();closeModal();await loadDatabaseUsers();}
  if(form.id==='totp-begin-form'){const result=await post('/security/enroll',{key:data.key});form.reset();modal('Add Magnet to your authenticator',`<p class="hint">Add a time-based code in your authenticator app using this secret (SHA-1, 6 digits, 30 seconds).</p><div class="code-box">${esc(result.secret)}</div><p class="hint"><a href="${esc(result.uri)}">Open authenticator app ↗</a></p><form id="totp-enable-form"><label>Current 6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label><div class="form-actions"><button class="primary" type="submit">Enable protection →</button></div></form>`);}
  if(form.id==='totp-enable-form'){const result=await post('/security/enable',{code:data.code});state.totpEnabled=true;clearDatabaseConnection();managed.linkConnected=false;modal('Save your recovery codes',`<div class="notice">Each code works once. Store these codes safely; they are not shown again.</div><pre class="code-box">${esc(result.recovery_codes.join('\n'))}</pre><p class="hint">Authenticator protection is now enabled. Other browser sessions have been signed out.</p><div class="form-actions">${button('I saved the codes','close-modal','primary')}</div>`);if(state.page==='settings')render();}
  if(form.id==='totp-disable-form'){await post('/security/disable',{code:data.code});state.totpEnabled=false;form.reset();lockSensitiveUI();toast('TOTP disabled');}
  if(form.id==='step-up-form'){await post('/security/verify',{code:data.code});finishStepUp();}
 }catch(error){if(form.id==='step-up-form')$('#step-up-error').textContent=error.message;else toast(error.message);}finally{setButtonBusy(submit,false);}
});
document.addEventListener('DOMContentLoaded',()=>{
 $('#step-up-cancel').addEventListener('click',()=>finishStepUp(new Error('Verification cancelled')));
 $('#step-up-dialog').addEventListener('cancel',event=>{event.preventDefault();finishStepUp(new Error('Verification cancelled'));});
});

document.addEventListener('change',event=>{if(event.target.id==='sql-execution')managed.execution=event.target.value;});

document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('#database-list-rows tr[data-id]')){event.preventDefault();openLocalDatabase(event.target.dataset.id).catch(error=>toast(error.message));}});
