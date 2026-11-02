'use strict';
const accountAdmin={users:[],groups:[],providers:[],nodes:[],pages:[],serverGroups:[],callback:'',filters:{users:'',groups:'',providers:''},loaded:false,error:'',pending:null,version:0};
const restrictedServerPages=new Set(['cleanup','users','docker','databases','apps','network','startup','connect','alerts']);
function canAccess(kind,id,manage=false){const p=state.user;if(!p)return false;if(p.admin)return true;const level=(kind==='server'?p.servers:p.monitorings)?.[id];return level==='manage'||(!manage&&level==='view');}
function accessNavigation(){
 if(!state.authenticated)return;
 for(const link of $$('[data-server-page]'))setShellHidden(link,restrictedServerPages.has(link.dataset.serverPage)&&!canAccess('server',state.node,true));
 setShellHidden($('#workspace-navigation [data-page="alerts"]'),!state.user?.admin);
 setShellHidden($('[data-page="access"]'),!state.user?.admin);
 setShellHidden($('[data-page="batch"]'),!state.user?.admin&&!Object.values(state.user?.servers||{}).includes('manage'));
 const avatar=$('.account>.avatar');patchShellContent(avatar,state.user?.avatar?`<img src="${esc(state.user.avatar)}" alt="" referrerpolicy="no-referrer">`:esc((state.user?.name||'A').slice(0,1)),true);
 const account=$('.account>span:not(.avatar)');
 if(account){
  let name=account.querySelector('[data-account-name]'),role=account.querySelector('small');
  if(!name){name=document.createElement('span');name.dataset.accountName='';name.dataset.i18nSkip='';role=document.createElement('small');account.replaceChildren(name,role);}
  patchShellContent(name,state.user?.name||magnetI18n.text('Account'));
  patchShellContent(role,magnetI18n.text(state.user?.admin?'Workspace administrator':state.user?.viewer?'Viewer':'Workspace member'));
 }
}

function applyAccessUI(){
 if(!state.authenticated)return;
 if(state.page==='access'&&!state.user?.admin){$('#main').innerHTML='<p class="notice">Workspace administrator access required.</p>';return;}
 if(state.node&&!canAccess('server',state.node,true)){
  if(restrictedServerPages.has(state.page)){$('#main').innerHTML='<p class="notice">Manage access is required for this server tool.</p>';return;}
  for(const b of $$('#main button[data-action]'))if(!['chart','node-monitor','server-detail'].includes(b.dataset.action))b.disabled=true;
 }
 for(const b of $$('#main [data-action]')){
  if(['add','generate-command','status-new-page'].includes(b.dataset.action)&&!state.user?.admin)b.hidden=true;
  if(b.dataset.action==='new-alert'&&!state.node&&!state.user?.admin)b.hidden=true;
  if(b.dataset.action==='edit-node'&&!canAccess('server',b.dataset.id||state.node,true))b.hidden=true;
 }
 if(state.page==='monitorings'&&!canAccess('monitoring',statusAdmin.page,true)){
  for(const b of $$('#main [data-action]'))if(['status-new-service','status-edit-service','status-delete-service','status-edit-page','status-install','status-delete-page','status-new-incident','status-new-maintenance','status-edit-incident','status-delete-incident'].includes(b.dataset.action))b.hidden=true;
 }
 if(!state.user?.admin&&!state.node&&['overview','servers'].includes(state.page)&&state.nodesLoaded&&!state.nodes.length)$('#main').innerHTML='<section class="panel"><div class="section-body"><p class="hint">No servers have been shared with your account. Your status pages are available in the workspace sidebar.</p></div></section>';
}
function accessTableRows(kind){
 const query=(accountAdmin.filters[kind]||'').trim().toLowerCase(),list=accountAdmin[kind]||[];
 const groupNames=user=>[...new Set([...(user.groups||[]),...(user.automatic_groups||[])])].map(id=>accountAdmin.groups.find(g=>g.id===id)?.name||'Group');
 const rows=list.filter(item=>(kind==='users'?[item.name,item.username,item.email,...groupNames(item)]:kind==='providers'?[item.name,item.issuer,accountAdmin.groups.find(g=>g.id===item.group_id)?.name]:[item.name]).join(' ').toLowerCase().includes(query));
 if(!rows.length)return `<tr><td colspan="${kind==='users'?6:kind==='providers'?6:5}" class="access-empty">${query?'No matches.':kind==='users'?'No users yet. Invite a user to get started.':kind==='groups'?'No groups yet. Create a group to share resource permissions.':'No OpenID providers configured.'}</td></tr>`;
 return rows.map(item=>{
  const attrs=`data-id="${esc(item.id)}"`;
  if(kind==='users'){
   const names=groupNames(item),inherited=[...(item.groups||[]),...(item.automatic_groups||[])].some(id=>accountAdmin.groups.find(g=>g.id===id)?.admin);
   return `<tr><th scope="row"><strong data-i18n-skip>${esc(item.name)}</strong><small data-i18n-skip>${esc(item.username)}</small></th><td>${badge(item.enabled?'online':'offline',item.enabled?'Enabled':'Disabled')}</td><td>${item.totp_only?'Authenticator':item.has_password?'Local password':'OpenID Connect'}</td><td>${item.admin?'Administrator':inherited?'Administrator (group)':item.viewer?'Viewer':[...(item.groups||[]),...(item.automatic_groups||[])].some(id=>accountAdmin.groups.find(g=>g.id===id)?.viewer)?'Viewer (group)':'Member'}</td><td class="access-wrap">${names.length?names.map(name=>`<span class="badge" data-i18n-skip>${esc(name)}</span>`).join(' '):'<span class="text-muted">No groups</span>'}</td><td><div class="access-row-actions">${button('Edit access','account-edit-user','',attrs)}${button('Delete','account-delete-user','danger',attrs)}</div></td></tr>`;
  }
  if(kind==='groups'){
   const members=accountAdmin.users.filter(u=>[...(u.groups||[]),...(u.automatic_groups||[])].includes(item.id)).length;
   return `<tr><th scope="row" data-i18n-skip>${esc(item.name)}</th><td>${members}</td><td>${item.admin?'Administrator':item.viewer?'Viewer':'Member'}</td><td>${item.grants.length}</td><td><div class="access-row-actions">${button('Edit','account-edit-group','',attrs)}${button('Delete','account-delete-group','danger',attrs)}</div></td></tr>`;
  }
  return `<tr><th scope="row" data-i18n-skip>${esc(item.name)}</th><td class="access-issuer" data-i18n-skip>${esc(item.issuer)}</td><td>${badge(item.enabled?'online':'offline',item.enabled?'Enabled':'Disabled')}</td><td>${item.signup?'Allowed':'Blocked'}</td><td data-i18n-skip>${esc(accountAdmin.groups.find(g=>g.id===item.group_id)?.name||'—')}</td><td><div class="access-row-actions">${button('Edit','account-edit-provider','',attrs)}${button('Delete','account-delete-provider','danger',attrs)}</div></td></tr>`;
 }).join('');
}
function accessTable(kind,title,columns,extra=''){
 return `<section class="panel access-table-panel"><div class="toolbar"><h3>${title} <span class="text-muted">${accountAdmin[kind].length}</span></h3><input type="search" id="access-search-${kind}" data-access-filter="${kind}" aria-label="Search ${title}" placeholder="Search…" value="${esc(accountAdmin.filters[kind])}"></div>${extra}<div class="table-scroll"><table class="access-table"><caption class="sr-label">${title}</caption><thead><tr>${columns.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody id="access-rows-${kind}">${accessTableRows(kind)}</tbody></table></div></section>`;
}
function accessPage(){
 if(!state.user?.admin)return '<p class="notice">Workspace administrator access required.</p>';
 const actionsHTML=`<div class="page-actions">${button('Invite user','account-new-user')}${button('New group','account-new-group')}${button('New OpenID provider','account-new-provider','primary')}</div>`;
 if(!accountAdmin.loaded)return actionsHTML+(accountAdmin.error?`<p class="error" role="status">${esc(accountAdmin.error)}</p>`:'<p class="hint" role="status">Loading workspace access…</p>');
 return actionsHTML+`${accountAdmin.error?`<p class="error" role="status">${esc(accountAdmin.error)} · Retrying automatically.</p>`:''}`+
 accessTable('users','Users',['User','Status','Sign-in','Workspace access','Groups','Actions'])+
 accessTable('groups','User groups',['Group','Members','Workspace access','Resource grants','Actions'])+
 accessTable('providers','OpenID Connect providers',['Provider','Issuer','Status','New accounts','Automatic group','Actions'],`<div class="access-callback"><span class="hint">Callback URL</span><code data-i18n-skip>${esc(accountAdmin.callback)}</code></div>`);
}

async function loadAccessPage(force=false){
 if(state.page!=='access'||!state.user?.admin||!state.authenticated||!state.totpEnabled)return;
 if(force){accountAdmin.version++;accountAdmin.pending=null;}if(accountAdmin.pending)return accountAdmin.pending;const version=accountAdmin.version;
 const task=(async()=>{try{
  const [users,groups,providers,nodes,pages,serverGroups]=await Promise.all([api('/access/users'),api('/access/groups'),api('/access/providers'),api('/nodes'),api('/monitorings'),api('/server-groups')]);
  if(state.page!=='access'||!state.authenticated||accountAdmin.version!==version)return;Object.assign(accountAdmin,{users,groups,providers:providers.providers,callback:providers.callback_url,nodes,pages,serverGroups,loaded:true,error:''});
 }catch(error){if(state.page==='access'&&accountAdmin.version===version)accountAdmin.error=error.message;}finally{if(accountAdmin.pending===task)accountAdmin.pending=null;if(state.page==='access'&&accountAdmin.version===version)paintAccountAccess();}})();accountAdmin.pending=task;return task;
}
function paintAccountAccess(){const focused=document.activeElement,inside=$('#main').contains(focused),action=focused?.dataset.action,id=focused?.dataset.id,filter=focused?.dataset.accessFilter,position=focused?.selectionStart;render();if(inside&&filter){const input=$('#access-search-'+filter);input?.focus({preventScroll:true});try{input?.setSelectionRange(position,position);}catch{}}else if(inside&&action){const el=$$('#main [data-action]').find(b=>b.dataset.action===action&&b.dataset.id===id);el?.focus({preventScroll:true});}}
document.addEventListener('input',event=>{const kind=event.target.dataset.accessFilter;if(!['users','groups','providers'].includes(kind))return;accountAdmin.filters[kind]=event.target.value;const rows=$('#access-rows-'+kind);if(rows)rows.innerHTML=accessTableRows(kind);});

function accountInviteLink(result){
 const url=new URL(result.path,state.publicURL||location.origin).href;
 modal('Invite a new user',`<p class="hint">Share this one-time link privately. It expires at ${esc(new Date(result.expires*1000).toLocaleString())} (three hours). Your selected user settings, groups and resource access will be applied when registration is complete.</p><label>Invitation link<input value="${esc(url)}" readonly autocomplete="off"></label><p class="hint">The link is shown only now. Copy it before closing this window.</p><div class="form-actions">${button('Close','close-modal','primary')}</div>`);
}
function accountProviderForm(id=''){
 const p=accountAdmin.providers.find(p=>p.id===id)||{name:'',issuer:'',client_id:'',auth_method:'client_secret_basic',enabled:false,signup:false,group_id:''};modal(id?'Edit OpenID provider':'Add OpenID provider',`<form id="account-provider-form" data-id="${esc(id)}"><label>Name<input name="name" value="${esc(p.name)}" maxlength="120" required></label><label>Issuer URL (HTTPS)<input type="url" name="issuer" value="${esc(p.issuer)}" maxlength="2000" placeholder="https://identity.example.com/realms/magnet" required ${id?'readonly':''}></label><label>Client ID<input name="client_id" value="${esc(p.client_id)}" maxlength="500" required></label><label>Token endpoint authentication<select name="auth_method">${[['client_secret_basic','Client secret — HTTP Basic'],['client_secret_post','Client secret — request body'],['none','Public client — PKCE only']].map(([value,label])=>`<option value="${value}" ${p.auth_method===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Client secret ${id?'(leave empty to preserve)':''}<input name="client_secret" type="password" maxlength="8000" autocomplete="new-password"></label><label>Automatically assign group<select name="group_id"><option value="">No automatic group</option>${accountAdmin.groups.map(g=>`<option value="${esc(g.id)}" ${p.group_id===g.id?'selected':''}>${esc(g.name)}${g.admin?' · Administrator':''}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="enabled" ${p.enabled?'checked':''}>Enable provider</label><label class="check"><input type="checkbox" name="signup" ${p.signup?'checked':''}>Allow automatic creation of new user accounts</label><p class="hint">Callback: ${esc(accountAdmin.callback)}. The issuer must exactly match the issuer in the provider’s .well-known/openid-configuration document. Uses the provider subject as identity; email never links accounts. Assignment occurs on each provider login. Disabling the provider removes its automatic group access and invalidates its sessions. Use a new provider entry to change issuer.</p><p class="error" role="alert"></p><div class="form-actions"><button type="submit" class="primary">Save provider</button></div></form>`);
}
function personalAccountSettings(){return `<section class="panel"><div class="settings-section"><h3>Your account</h3><p>${esc(state.user?.name)} · ${esc(state.user?.username)}</p><p>Permissions are assigned by workspace administrators through user and group access rules.</p><div class="form-actions">${state.user?.totp_only?'':button('Change local password','account-change-password')}${button('Sign out','logout')}</div></div><div class="settings-section"><h3>Appearance</h3><div class="theme-options">${[['light','Light'],['dark','Dark'],['auto','System']].map(([v,t])=>button(t,'set-theme','theme-option',`data-theme="${v}"`)).join('')}</div></div></section>`;}
function registerAccountActions(){Object.assign(actions,{
 'account-new-user':async()=>{if(!accountAdmin.loaded)await loadAccessPage();if(!accountAdmin.loaded)throw Error(accountAdmin.error||'Unable to load workspace access.');accountInviteForm();},'account-edit-user':el=>accountUserForm(el.dataset.id),
 'account-new-group':()=>accountGroupForm(),'account-edit-group':el=>accountGroupForm(el.dataset.id),
 'account-new-provider':()=>accountProviderForm(),'account-edit-provider':el=>accountProviderForm(el.dataset.id),
 'account-delete-user':el=>confirmAction('Delete this user?','This removes their login identities, memberships and grants. The recovery administrator key remains available.',async()=>{await api('/access/users/'+encodeURIComponent(el.dataset.id),{method:'DELETE'});await loadAccessPage(true);}),
 'account-delete-group':el=>confirmAction('Delete this group?','Its grants and memberships will be removed. Provider assignments to this group will be cleared.',async()=>{await api('/access/groups/'+encodeURIComponent(el.dataset.id),{method:'DELETE'});await loadAccessPage(true);}),
 'account-delete-provider':el=>confirmAction('Delete this provider?','This removes provider login identities and its automatic group memberships. Local passwords and manually assigned groups remain.',async()=>{await api('/access/providers/'+encodeURIComponent(el.dataset.id),{method:'DELETE'});await loadAccessPage(true);}),
 'account-change-password':()=>modal('Change local password',`<form id="account-password-form"><p class="hint">OpenID-only accounts use their provider to manage passwords.</p><label>Current password<input type="password" name="current" autocomplete="current-password" required></label><label>New password<input type="password" name="password" minlength="12" maxlength="72" autocomplete="new-password" required></label><p class="error" role="alert"></p><div class="form-actions"><button class="primary" type="submit">Save password</button></div></form>`)
 });}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['account-invite-form','account-user-form','account-group-form','account-provider-form','account-password-form'].includes(form.id))return;
 event.preventDefault();const formData=new FormData(form),data=Object.fromEntries(formData),id=form.dataset.id,version=modalVersion,submit=form.querySelector('[type=submit]');setButtonBusy(submit,true);const controls=form.querySelector('[data-account-editor-controls]');if(controls)controls.disabled=true;const saveStatus=form.querySelector('[data-editor-dirty]');if(saveStatus)saveStatus.textContent='Saving…';const error=form.querySelector('.error');if(error)error.textContent='';
 try{
  const grants=[...form.querySelectorAll('[data-grant-kind]')].filter(s=>s.value).map(s=>({kind:s.dataset.grantKind,id:s.dataset.grantId,level:s.value}));let path,body;
  if(form.id==='account-invite-form'){const result=await post('/access/users',{enabled:data.enabled==='on',admin:data.access_template==='admin',viewer:data.access_template==='viewer',groups:formData.getAll('groups'),grants});accountInviteLink(result);return;}
  if(form.id==='account-user-form'){path='/access/users';body={username:data.username,name:data.name,email:data.email,password:data.password,reset_authenticator:data.reset_authenticator==='on',enabled:data.enabled==='on',admin:data.access_template==='admin',viewer:data.access_template==='viewer',groups:formData.getAll('groups'),grants};}
  if(form.id==='account-group-form'){path='/access/groups';body={name:data.name,admin:data.access_template==='admin',viewer:data.access_template==='viewer',grants};}
  if(form.id==='account-provider-form'){path='/access/providers';body={name:data.name,issuer:data.issuer,client_id:data.client_id,client_secret:data.client_secret,auth_method:data.auth_method,group_id:data.group_id||null,enabled:data.enabled==='on',signup:data.signup==='on'};}
  if(form.id==='account-password-form'){path='/account/password';body={current:data.current,password:data.password};}
  await api(path+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body});if(version!==modalVersion)return;form.reset();closeModal();await loadAccessPage(true);toast('Saved');
 }catch(error){if(version===modalVersion)form.querySelector('.error').textContent=error.message;}finally{if(controls)controls.disabled=false;if(saveStatus?.isConnected)saveStatus.textContent='Unsaved changes';setButtonBusy(submit,false);}
});
