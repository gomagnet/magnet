'use strict';
let serverGroupEditorRequest=0;
function serverGroupColor(value){return /^#[0-9a-f]{6}$/i.test(value||'')?value:'#2563eb';}
function serverGroupIcon(group){return identityIcon(group?.icon,'folder');}
function visibleFleetNodes(){return state.nodes.filter(n=>(n.hostname+' '+n.address+' '+n.os+' '+(n.group_name||'')).toLowerCase().includes(state.filter.toLowerCase())&&(state.onlineFilter==='all'||(state.onlineFilter==='online'?n.online:!n.online))).sort((a,b)=>Number(!a.group_id)-Number(!b.group_id)||(a.group_name||'').localeCompare(b.group_name||'')||a.hostname.localeCompare(b.hostname));}
function resourceUsageWarning(value,label){
 if(typeof value!=='number'||!Number.isFinite(value)||value<80)return '';
 const severity=value>=95?'danger':'warning',description=magnetI18n.text(value>=95?'Critical resource usage':'High resource usage')+': '+magnetI18n.text(label)+' '+pct(value);
 return `<span class="server-resource-warning ${severity}" role="img" tabindex="0" title="${esc(description)}" aria-label="${esc(description)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg></span>`;
}
function networkRates(nodes){
 const online=nodes.filter(node=>node.online),known=online.every(node=>node.metrics?.network_scope==='internet-uplink-v1'),ready=online.length>0&&known&&online.every(node=>node.metrics.network_ready);
 const explanation=magnetI18n.text('Internet-uplink interface rates; LAN traffic sharing an uplink is included.');
 let detail=explanation;
 if(!online.length)detail=magnetI18n.text('Server offline');
 else if(!known)detail=magnetI18n.text('Update MagnetLink to 0.4.9 for uplink traffic statistics.');
 else if(!ready)detail=magnetI18n.text('Uplink measurements unavailable or sampling.');
 else if(online.length===1)detail=(online[0].metrics.network_interfaces||[]).join(', ')+': '+explanation;
 return `<span class="network-rates" title="${esc(detail)}">${[['rx','Inbound','M12 4v16m-6-6 6 6 6-6'],['tx','Outbound','M12 20V4m-6 6 6-6 6 6']].map(([key,label,path])=>{const value=ready?bytes(online.reduce((sum,node)=>sum+Number(node.metrics[key]||0),0))+'/s':'—';return `<span class="network-rate" aria-label="${esc(magnetI18n.text(label)+': '+value+'. '+detail)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg><span data-i18n-skip>${esc(value)}</span></span>`;}).join('')}</span>`;
}
function serverFleetRow(n,grouped=false,last=false){
 return `<tr class="server-row ${state.selected.has(n.id)?'is-selected':''} ${grouped?'grouped-server-row':''} ${last?'last-group-member':''}" data-server-id="${esc(n.id)}" tabindex="0"><td class="server-select-cell"><input type="checkbox" data-select="${esc(n.id)}" aria-label="Select ${esc(n.hostname)}" ${state.selected.has(n.id)?'checked':''}></td><td class="${grouped?'grouped-server-cell':''}"><div class="server-name"><span class="server-glyph">${serverIcon(n)}</span><div><a class="server-link" href="${esc(pageURL('server',n.id))}">${esc(n.hostname)}</a><small>${privateAddress(n.address)} · ${esc(n.os)}</small></div></div></td><td><span class="server-status-label">${badge(n.online?'online':'offline')}</span><small>${n.link_removed?'Link uninstalled':n.online?'Reporting normally':'Last seen '+ago(n.seen)}</small></td><td>${n.online?meter(n.metrics.cpu,'CPU'):'—'}</td><td>${n.online?meter(n.metrics.ram,'Memory'):'—'}</td><td>${n.online?meter(n.metrics.disk,'Root disk (/)'):'—'}</td><td>${networkRates([n])}</td><td><div class="server-actions">${button(icon('connect',20),'node-connect','ghost server-action',`data-id="${esc(n.id)}" aria-label="Connect to ${esc(n.hostname)}"`)}${button(icon('more',20),'server-detail','ghost server-action',`data-id="${esc(n.id)}" aria-label="Server details"`)}</div></td></tr>`;
}
function serverGroupTableBodies(nodes){
 const groups=new Map();for(const n of nodes){const key=n.group_id||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
 return [...groups].map(([id,members])=>{
  const first=members[0],group={id,name:first.group_name,color:first.group_color,icon:state.serverGroups?.find(group=>group.id===id)?.icon||''};
  const heading=id?`<tr class="server-group-heading"><td></td><th scope="rowgroup" colspan="7"><div class="server-group-label"><span class="server-group-glyph">${serverGroupIcon(group)}</span><strong data-i18n-skip>${esc(group.name)}</strong><span class="nav-count">${members.length}</span>${state.user?.admin?button('Edit group','server-group-edit','ghost',`data-id="${esc(id)}"`):''}</div></th></tr>`:groups.size>1?'<tr class="server-group-heading"><th scope="rowgroup" colspan="8">Ungrouped servers</th></tr>':'';
  return `<tbody class="${id?'server-tree-group':''}" style="--server-group-color:${serverGroupColor(group.color)}">${heading}${members.map((node,i)=>serverFleetRow(node,Boolean(id),i===members.length-1)).join('')}</tbody>`;
 }).join('');
}
async function serverGroupManager(){
 if(!state.user?.admin)return;
 if(!state.totpEnabled){modal('Authenticator setup required',totpSetupNotice());return;}
 const request=++serverGroupEditorRequest,page=state.page,node=state.node,version=modalVersion;
 const groups=await api('/server-groups');if(request!==serverGroupEditorRequest||!state.authenticated||!state.user?.admin||!state.totpEnabled||page!==state.page||node!==state.node||version!==modalVersion)return;state.serverGroups=groups;
 modal('Server groups',`<div class="page-actions">${button('New server group','server-group-new','primary')}</div><p class="hint">Group icons are inherited by servers without their own icon. User group grants apply to every server in the group.</p><div class="table-scroll"><table class="server-group-inventory"><thead><tr><th>Server group</th><th>Servers</th><th>Actions</th></tr></thead><tbody>${groups.map(group=>`<tr><th scope="row"><span class="server-group-label" style="--server-group-color:${serverGroupColor(group.color)}"><span class="server-group-glyph">${serverGroupIcon(group)}</span><strong data-i18n-skip>${esc(group.name)}</strong></span></th><td>${group.nodes.length}</td><td><div class="inline-controls">${button('Edit','server-group-edit','',`data-id="${esc(group.id)}"`)}${button('Delete','server-group-delete','danger',`data-id="${esc(group.id)}" data-revision="${group.revision}"`)}</div></td></tr>`).join('')||'<tr><td colspan="3">No server groups yet.</td></tr>'}</tbody></table></div>`,'server-groups');
}
async function serverGroupForm(id=''){
 if(!state.user?.admin)return;
 if(!state.totpEnabled){modal('Authenticator setup required',totpSetupNotice());return;}
 const request=++serverGroupEditorRequest,page=state.page,node=state.node,version=modalVersion,dialogWasOpen=$('#modal').open;
 const [groups,nodes,userGroups]=await Promise.all([api('/server-groups?manage=1'),api('/nodes'),api('/access/groups'),ensureIconPresets()]);
 if(request!==serverGroupEditorRequest||!state.authenticated||!state.totpEnabled||!state.user?.admin||(dialogWasOpen&&!$('#modal').open)||state.page!==page||state.node!==node||version!==modalVersion)return;
 state.serverGroups=groups;
 const group=id?groups.find(group=>group.id===id):{id:'',name:'',color:'#2563eb',icon:'',revision:0,nodes:[],access:[]};if(!group)throw Error('Server group no longer exists');
 const details=`<h3>Server group details</h3><div class="form-grid"><label>Name<input name="name" value="${esc(group.name)}" maxlength="120" required></label><label>Group color<input name="color" type="color" value="${serverGroupColor(group.color)}" required></label></div>${imageControls(group.icon,true)}`;
 const servers=`<h3>Member servers</h3><p class="hint">A server belongs to one group. Selecting it here moves it from its current group and changes inherited access.</p><input id="server-group-node-search" type="search" data-editor-filter-only aria-label="Find servers" placeholder="Find servers…"><div class="server-group-members">${nodes.map(server=>`<label class="check" data-server-group-search="${esc((server.display_name+' '+server.hostname+' '+server.group_name).toLowerCase())}"><input type="checkbox" name="nodes" value="${esc(server.id)}" ${group.nodes.includes(server.id)?'checked':''}><span><strong data-i18n-skip>${esc(server.display_name||server.hostname)}</strong><small data-i18n-skip>${esc(server.group_name||'')}</small></span></label>`).join('')||'<p class="hint">No servers yet.</p>'}</div>`;
 const access=`<h3>User group access</h3><p class="hint">Grant View or Manage to user groups. Access includes current and future servers in this group. Direct user grants are preserved.</p><input type="search" data-editor-grantee-search placeholder="Find user groups…" aria-label="Find user groups"><div class="account-grants">${userGroups.map(userGroup=>`<label data-grantee-search="${esc(userGroup.name.toLowerCase())}"><span data-i18n-skip>${esc(userGroup.name)}</span><select data-server-group-grant="${esc(userGroup.id)}">${[['','No group grant'],['view','View'],['manage','Manage']].map(([level,label])=>`<option value="${level}" ${group.access.find(grant=>grant.group_id===userGroup.id)?.level===level?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')||'<p class="hint">Create user groups in Users & access.</p>'}</div>`;
 modal(id?'Edit server group':'New server group',accountEditorForm('server-group-form',id,[['details','Group',details],['servers','Servers',servers],['access','User group access',access]],'Save server group'),'server-group-editor');
 const form=$('#server-group-form');form.dataset.revision=String(group.revision);form.dataset.image=group.icon;initializeAccountEditor();
}
function registerServerGroupActions(){Object.assign(actions,{
 'server-groups':serverGroupManager,'server-group-new':()=>serverGroupForm(),'server-group-edit':el=>serverGroupForm(el.dataset.id),
 'server-group-delete':el=>{const id=el.dataset.id,revision=el.dataset.revision;confirmAction('Delete server group?','Servers will be kept and become ungrouped. Access inherited from this server group will be removed.',async()=>{await api('/server-groups/'+encodeURIComponent(id)+'?revision='+encodeURIComponent(revision),{method:'DELETE'});await refresh();});}
});}
document.addEventListener('input',event=>{if(event.target.id==='server-group-node-search'){const value=event.target.value.toLowerCase();for(const label of $$('#server-group-form [data-server-group-search]'))label.hidden=!label.dataset.serverGroupSearch.includes(value);}});
document.addEventListener('submit',async event=>{
 const form=event.target;if(form.id!=='server-group-form')return;event.preventDefault();const version=modalVersion,submit=form.querySelector('[type=submit]');setButtonBusy(submit,true);const controls=form.querySelector('[data-account-editor-controls]'),saveStatus=form.querySelector('[data-editor-dirty]');if(saveStatus)saveStatus.textContent='Saving…';form.querySelector('.error').textContent='';
 try{const data=new FormData(form),id=form.dataset.id,body={name:data.get('name'),color:data.get('color'),icon:form.dataset.image||'',revision:Number(form.dataset.revision),nodes:data.getAll('nodes'),access:[...form.querySelectorAll('[data-server-group-grant]')].filter(input=>input.value).map(input=>({group_id:input.dataset.serverGroupGrant,level:input.value}))};if(controls)controls.disabled=true;await api('/server-groups'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body});if(version!==modalVersion)return;closeModal(true);await refresh();if(state.page==='access')await loadAccessPage(true);toast('Server group saved');}
 catch(error){if(version===modalVersion)form.querySelector('.error').textContent=error.message;}
 finally{if(controls)controls.disabled=false;if(saveStatus?.isConnected)saveStatus.textContent='Unsaved changes';setButtonBusy(submit,false);}
});
