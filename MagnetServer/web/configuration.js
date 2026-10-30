'use strict';
const configurationData=new Map();
function nodeConfiguration(){if(!configurationData.has(state.node))configurationData.set(state.node,{sources:null,dns:null,error:'',pending:null});return configurationData.get(state.node);}
function configurationFeedback(data){return data.error?`<p class="error" role="alert">${esc(data.error)}</p>${button('Retry','configuration-retry')}`:'<p class="hint" role="status">Loading configuration…</p>';}
function aptSourcesPanel(){
 const data=nodeConfiguration();
 return `<section class="panel editor-panel" id="apt-sources-panel"><div class="panel-heading"><h3>APT repositories</h3>${button('Add repository file','source-new')}</div><div class="section-body"><p class="hint">Edit .list and deb822 .sources files. Existing repository signing keys are preserved.</p>${data.sources===null||data.error?configurationFeedback(data):data.sources.length?`<div class="activity-list">${data.sources.map(file=>`<div class="activity-row"><strong data-i18n-skip>${esc(file.name)}</strong><div class="form-actions">${button('Edit','source-edit','',`data-name="${esc(file.name)}"`)}${button('Remove','source-delete','danger',`data-name="${esc(file.name)}"`)}</div></div>`).join('')}</div>`:'<p class="hint">No repository files.</p>'}</div></section>`;
}
function configuredDNSServers(config){const value=[...config.matchAll(/^DNS=(.*)$/gm)].at(-1)?.[1]||config.match(/^servers=(.+)$/m)?.[1];return value?value.split(/[\s,]+/).filter(Boolean):[...config.matchAll(/^nameserver\s+(\S+)/gm)].map(match=>match[1]);}
function dnsChanged(data){return (data.dnsAddresses||[]).map(v=>v.trim()).filter(Boolean).join(' ')!==(data.dnsBaseline||[]).join(' ');}
function dnsAddressRows(data){const disabled=data.dns.backend==='unsupported';return (data.dnsAddresses||['']).map((value,index)=>`<div class="dns-address-row"><label for="dns-address-${index}">Server ${index+1}</label><input id="dns-address-${index}" data-dns-address="${index}" name="address" value="${esc(value)}" placeholder="IPv4 or IPv6 address" autocomplete="off" spellcheck="false" ${index===0?'required':''} ${disabled?'disabled':''}><button type="button" data-action="dns-remove" data-index="${index}" class="ghost" aria-label="Remove DNS server ${index+1}" ${(data.dnsAddresses||[]).length<2||disabled?'disabled':''}>${icon('plus',16)}<span>Remove</span></button></div>`).join('');}
function updateDNSControls(){
 const data=nodeConfiguration(),form=$('#dns-form');if(!form)return;const changed=dnsChanged(data),unsupported=data.dns?.backend==='unsupported',save=form.querySelector('[type="submit"]');
 if(save&&!save.hasAttribute('aria-busy'))save.disabled=unsupported||!changed;
 const reset=$('[data-action="dns-reset"]');if(reset)reset.disabled=!changed||unsupported;
 const add=$('[data-action="dns-add"]');if(add)add.disabled=(data.dnsAddresses||[]).length>=6||unsupported;
 const status=$('#dns-draft-status');if(status)status.textContent=changed?'Unsaved changes':data.dnsSaved?'DNS settings saved':'Up to six IPv4 or IPv6 addresses';
 const error=$('#dns-error');if(error)error.textContent=data.dnsError||'';
}
function networkPage(){
 const data=nodeConfiguration(),dns=data.dns;
 if(!dns||data.error)return `<section class="panel" id="dns-panel"><div class="section-body">${configurationFeedback(data)}</div></section>`;
 const unsupported=dns.backend==='unsupported',active=[...dns.active.matchAll(/^nameserver\s+(\S+)/gm)].map(match=>match[1]),labels={'systemd-resolved':'systemd-resolved',NetworkManager:'NetworkManager',resolvconf:'resolvconf',static:'Static resolver file',unsupported:'Managed externally'},changed=dnsChanged(data);
 return `<div class="dns-layout" id="dns-panel"><section class="panel dns-settings"><div class="toolbar"><h3>DNS servers</h3>${badge(unsupported?'unknown':'online',unsupported?'Read-only':'Configurable')}</div><form id="dns-form" class="section-body" data-node="${esc(state.node)}"><p class="hint">Enter one address per field. Changes persist across restarts.</p>${unsupported?'<p class="notice">This resolver manager requires manual configuration on the server.</p>':''}<div id="dns-addresses">${dnsAddressRows(data)}</div><div class="dns-add-row">${button('＋ Add DNS server','dns-add','',` ${(data.dnsAddresses||[]).length>=6||unsupported?'disabled':''}`)}<span class="hint">IPv4 and IPv6 supported</span></div><p id="dns-error" class="error" role="alert">${esc(data.dnsError)}</p><div class="dns-savebar"><span id="dns-draft-status" class="hint" role="status">${changed?'Unsaved changes':data.dnsSaved?'DNS settings saved':'Up to six IPv4 or IPv6 addresses'}</span><div>${button('Reset changes','dns-reset','ghost',!changed||unsupported?'disabled':'')}<button type="submit" class="primary" ${!changed||unsupported?'disabled':''}>Save DNS</button></div></div></form></section><aside class="dns-summary"><section class="panel"><div class="panel-heading"><h3>Resolver status</h3></div><div class="section-body"><dl class="dns-metadata"><div><dt>Manager</dt><dd data-i18n-skip>${esc(labels[dns.backend]||dns.backend)}</dd></div><div><dt>Operating system</dt><dd data-i18n-skip>${esc(dns.os)}</dd></div></dl><h4>Active resolver addresses</h4><div class="dns-active-addresses">${active.length?active.map(address=>`<div><code data-i18n-skip>${esc(address)}</code><span class="badge">${address.includes(':')?'IPv6':'IPv4'}</span></div>`).join(''):'<p class="hint">No resolver addresses reported.</p>'}</div>${active.includes('127.0.0.53')?'<p class="hint">The local resolver stub forwards requests to upstream DNS servers.</p>':''}</div></section><section class="panel dns-files"><details><summary>Configuration files</summary><div class="section-body"><p class="hint" data-i18n-skip>${esc(dns.path)}</p><pre class="job-output" data-i18n-skip>${esc(dns.configured||'# No custom DNS configuration')}</pre><p class="hint" data-i18n-skip>/etc/resolv.conf</p><pre class="job-output" data-i18n-skip>${esc(dns.active)}</pre></div></details></section></aside></div>`;
}

async function loadConfiguration(force=false){
 if(!state.node||!['apps','network'].includes(state.page))return;
 const node=state.node,page=state.page,data=nodeConfiguration(),key=page==='apps'?'sources':'dns';
 if(data.pending){await data.pending;if(state.node===node&&state.page===page&&data[key]===null&&!data.error)return loadConfiguration(force);return;}if(!force&&data[key]!==null&&!(key==='dns'&&data.dnsNeedsReload))return;
 data.error='';
 data.pending=(async()=>{
  try{data[key]=JSON.parse(await managedJob(key==='sources'?'apt.sources.list':'dns.read',{},node));if(key==='dns'){data.dnsNeedsReload=false;data.dnsBaseline=configuredDNSServers(data.dns.configured);if(!data.dnsAddresses)data.dnsAddresses=data.dnsBaseline.length?[...data.dnsBaseline]:[''];}}
  catch(error){data.error=error.message;}
  finally{data.pending=null;if(state.node===node&&state.page===page){if(key==='sources')replaceScreenPanel('#apt-sources-panel',aptSourcesPanel());else replaceScreenPanel('#dns-panel',networkPage());}}
 })();return data.pending;
}
function repositoryForm(name=''){
 const data=nodeConfiguration(),file=data.sources?.find(file=>file.name===name),draft=data.sourceDrafts?.[name];
 modal(name?'Edit repository file':'Add repository file',`<form id="source-form" data-node="${esc(state.node)}" data-original="${esc(name)}"><label>Filename<input name="name" value="${esc(name||draft?.name||'magnet.sources')}" pattern="(?:sources\\.list\\.d/)?[a-zA-Z0-9][a-zA-Z0-9_.\\-]*\\.(list|sources)" required ${name?'readonly':''}></label><label>Repository configuration<textarea id="source-content" name="content" aria-label="APT repository configuration" data-code-language="linuxconf" spellcheck="false">${esc(draft?.content??file?.content??'')}</textarea></label><p class="hint">Use Signed-By with a keyring installed on the server. Saving does not upgrade packages.</p><div class="form-actions"><button type="submit" class="primary">Save repository file</button></div></form>`,'source-editor');
}
function registerConfigurationActions(){Object.assign(actions,{
 'dns-add':()=>{const data=nodeConfiguration();if(data.dns.backend==='unsupported'||data.dnsAddresses.length>=6)return;data.dnsAddresses.push('');$('#dns-addresses').innerHTML=dnsAddressRows(data);updateDNSControls();$('#dns-address-'+(data.dnsAddresses.length-1))?.focus();},
 'dns-remove':el=>{const data=nodeConfiguration();if(data.dns.backend==='unsupported'||data.dnsAddresses.length<2)return;data.dnsAddresses.splice(Number(el.dataset.index),1);$('#dns-addresses').innerHTML=dnsAddressRows(data);data.dnsSaved=false;updateDNSControls();$('#dns-address-0')?.focus();},
 'dns-reset':()=>{const data=nodeConfiguration();data.dnsAddresses=data.dnsBaseline.length?[...data.dnsBaseline]:[''];data.dnsError='';data.dnsSaved=false;$('#dns-addresses').innerHTML=dnsAddressRows(data);updateDNSControls();},
 'configuration-retry':()=>loadConfiguration(true),
 'source-new':()=>repositoryForm(),
 'source-edit':el=>repositoryForm(el.dataset.name),
 'source-delete':el=>{const node=state.node,name=el.dataset.name;confirmAction('Remove repository file?',name,async()=>{await managedJob('apt.sources.delete',{name},node);if(state.node===node)await loadConfiguration(true);});},
 'image-remove':el=>{const form=el.closest('form');updateIconSelection(form,'');},
});}
document.addEventListener('input',event=>{
 if(event.target.matches('[data-dns-address]')){const data=nodeConfiguration();data.dnsAddresses[Number(event.target.dataset.dnsAddress)]=event.target.value;data.dnsSaved=false;data.dnsError='';updateDNSControls();}
 const form=event.target.closest('#source-form');if(form){const data=nodeConfiguration();data.sourceDrafts??={};data.sourceDrafts[form.dataset.original]=Object.fromEntries(new FormData(form));}
});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['source-form','dns-form','avatar-form'].includes(form.id))return;event.preventDefault();
 const submit=form.querySelector('[type="submit"]'),node=form.dataset.node,version=modalVersion;if(submit?.hasAttribute('aria-busy'))return;setButtonBusy(submit,true);
 try{
  if(form.id==='avatar-form'){const result=await api('/account/avatar',{method:'PUT',body:{image:form.dataset.image||''}});state.user.avatar=result.avatar;accessNavigation();toast('Avatar saved');return;}
  if(state.node!==node)throw new Error('Server context changed');
  const data=nodeConfiguration(),values=Object.fromEntries(new FormData(form));
  if(form.id==='dns-form'){
   const addresses=new FormData(form).getAll('address').map(v=>String(v).trim()).filter(Boolean);
   if(!addresses.length||addresses.length>6)throw new Error('Enter one to six DNS server IP addresses');
   for(const address of addresses){let valid=false;if(address.includes(':')){try{new URL('http://['+address+']/');valid=!address.includes('%');}catch{}}else valid=/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)&&address.split('.').every(part=>Number(part)<=255);if(!valid)throw new Error('Invalid DNS server: '+address);}
   if(new Set(addresses).size!==addresses.length)throw new Error('DNS server addresses must be unique');
   values.servers=addresses.join(' ');data.dnsError='';
  }
  await managedJob(form.id==='source-form'?'apt.sources.write':'dns.write',values,node);
  if(form.id==='source-form'){delete data.sourceDrafts?.[form.dataset.original];if(modalVersion===version)closeModal();}
  else {data.dnsSaved=true;data.dnsNeedsReload=true;data.dnsBaseline=values.servers.split(' ');}
  if(state.node===node&&state.page===(form.id==='source-form'?'apps':'network'))await loadConfiguration(true);toast('Configuration saved');
 }catch(error){if(form.id==='dns-form'&&state.node===node){nodeConfiguration().dnsError=error.message;updateDNSControls();}else toast(error.message);}finally{setButtonBusy(submit,false);if(form.id==='dns-form'&&state.node===node)updateDNSControls();}
});
function imageControls(image='',presets=false){return `<div class="image-preview">${image?identityIcon(image):''}</div>${presets?presetIconPicker(image):''}<label>PNG or SVG image<input type="file" data-image-upload accept="image/png,image/svg+xml"></label><p class="hint">Maximum 256 KiB. PNG dimensions up to 4096 × 4096.</p>${button('Remove image','image-remove','danger')}`;}
function avatarSettings(){return `<section class="panel"><div class="settings-section"><h3>Avatar</h3><form id="avatar-form" data-image="${esc(state.user?.avatar||'')}">${imageControls(state.user?.avatar||'')}<p class="hint">OpenID accounts receive their provider avatar after every completed login.</p><div class="form-actions"><button type="submit" class="primary">Save avatar</button></div></form></div></section>`;}
document.addEventListener('change',async event=>{
 if(!event.target.matches('[data-image-upload]'))return;
 const file=event.target.files[0],form=event.target.closest('form');if(!file)return;
 try{
  if(file.size>262144||!['image/png','image/svg+xml'].includes(file.type))throw new Error('Choose a PNG or SVG image up to 256 KiB');
  const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Unable to read image'));reader.readAsDataURL(file);});
  if(form.isConnected)updateIconSelection(form,image);
 }catch(error){toast(error.message);}
});
function privateAddress(address){if(!address)return `<span class="text-muted">${esc(magnetI18n.text('Not detected'))}</span>`;return `<span class="private-address" tabindex="0" aria-label="Public IPv4"><span class="address-placeholder">IPv4 ••••••</span><span class="address-value" data-i18n-skip>${esc(address||'—')}</span></span>`;}
function serverIcon(node){const image=node?.icon||state.serverGroups?.find(group=>group.id===node?.group_id)?.icon;return identityIcon(image);}


let addressTimer=null,addressTarget=null;
function hideAddress(){clearTimeout(addressTimer);addressTarget?.classList.remove('revealed');addressTarget=null;}
for(const eventName of ['pointerover','focusin'])document.addEventListener(eventName,event=>{
 const target=event.target.closest('.private-address');if(!target||target===addressTarget)return;hideAddress();addressTarget=target;addressTimer=setTimeout(()=>{if(target.isConnected)target.classList.add('revealed');},500);
});
for(const eventName of ['pointerout','focusout'])document.addEventListener(eventName,event=>{
 const target=event.target.closest('.private-address');if(target&&target===addressTarget&&!target.contains(event.relatedTarget))hideAddress();
});
