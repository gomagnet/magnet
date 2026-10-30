'use strict';
const composeEditor={drafts:new Map(),opened:'',request:0,closeTimer:null};
const composeFiles=project=>(Array.isArray(project.ConfigFiles)?project.ConfigFiles:String(project.ConfigFiles||'').split(',')).map(path=>path.trim()).filter(Boolean);
function composeProjectsHTML(){
 const projects=screenData.composes||[];
 return `<section class="panel editor-panel" id="compose-projects"><div class="toolbar"><div><h3>Docker Compose</h3><p>Choose a project file to view or edit.</p></div>${screenStatus('composes')}</div>${projects.length?`<div class="table-scroll"><table><thead><tr><th>Project</th><th>Status</th><th>Configuration files</th></tr></thead><tbody>${projects.map((project,index)=>`<tr><td><strong data-i18n-skip>${esc(project.Name)}</strong></td><td><span data-i18n-skip>${esc(project.Status)}</span></td><td><div class="compose-files">${composeFiles(project).map(path=>button(icon('jobs',16)+`<span data-i18n-skip>${esc(path)}</span>`,'compose-open','ghost',`data-project="${index}" data-path="${esc(path)}"`)).join('')||'<span class="hint">No configuration file reported</span>'}</div></td></tr>`).join('')}</tbody></table></div>`:`<div class="section-body"><p class="hint" role="status">${screenData.composes===null?'Loading Compose projects…':'No Compose projects found. Projects started outside Docker Compose are shown only in the container list.'}</p></div>`}</section>`;
}
function loadComposes(){return screenTask('composes','compose.list',{},text=>{const projects=JSON.parse(text);if(!Array.isArray(projects))throw Error('Invalid Compose project list');screenData.composes=projects;});}
function closeComposeEditor(immediate=false){
 const dialog=$('#compose-editor-dialog');clearTimeout(composeEditor.closeTimer);composeEditor.request++;
 if(!dialog?.open)return;
 if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.classList.remove('is-closing');dialog.close();return;}
 dialog.classList.add('is-closing');composeEditor.closeTimer=setTimeout(()=>{dialog.classList.remove('is-closing');dialog.close();},180);
}
async function openComposeFile(element){
 const project=screenData.composes?.[Number(element.dataset.project)],path=element.dataset.path,node=state.node;
 if(!project||!composeFiles(project).includes(path))return;
 const key=JSON.stringify([node,path]),request=++composeEditor.request,version=screenData.version;
 element.disabled=true;
 try{
  if(!composeEditor.drafts.has(key)){const content=await managedJob('compose.read',{path},node);if(state.node!==node||state.page!=='docker'||request!==composeEditor.request||version!==screenData.version)return;composeEditor.drafts.set(key,{node,path,project:project.Name,files:composeFiles(project),content,dirty:false,saving:false});}
  if(state.node!==node||state.page!=='docker'||request!==composeEditor.request)return;
  Object.assign(composeEditor.drafts.get(key),{project:project.Name,files:composeFiles(project)});
  composeEditor.opened=key;showComposeEditor();
 }finally{element.disabled=false;}
}
function showComposeEditor(){
 const draft=composeEditor.drafts.get(composeEditor.opened);if(!draft)return;
 const dialog=$('#compose-editor-dialog');clearTimeout(composeEditor.closeTimer);dialog.classList.remove('is-closing');
 dialog.innerHTML=`<div class="dialog-heading"><div><h2 id="compose-editor-title" data-i18n-skip>${esc(draft.project)}</h2><p class="hint" data-i18n-skip>${esc(draft.path)}</p></div>${button('×','compose-editor-close','icon-button','aria-label="Close Compose editor"')}</div><textarea id="compose-content" data-code-language="yaml" spellcheck="false" aria-label="Docker Compose YAML">${esc(draft.content)}</textarea><div class="file-editor-footer"><span id="compose-editor-status" role="status"></span><div class="inline-controls">${button('Deploy project','compose-up')}${button('Save & validate','compose-save','primary')}</div></div>`;
 paintComposeEditor();if(!dialog.open)dialog.showModal();
}
function paintComposeEditor(){
 const draft=composeEditor.drafts.get(composeEditor.opened);if(!draft)return;
 const status=$('#compose-editor-status');if(status)status.textContent=draft.saving?'Saving…':draft.dirty?'Unsaved changes':'Saved';
 for(const button of $$('#compose-editor-dialog [data-action="compose-save"],#compose-editor-dialog [data-action="compose-up"]'))button.disabled=draft.saving;
}
async function saveComposeFile(){
 const key=composeEditor.opened,draft=composeEditor.drafts.get(key);if(!draft||draft.node!==state.node||draft.saving)return;
 const content=$('#compose-content').value;draft.content=content;draft.saving=true;paintComposeEditor();
 try{await managedJob('compose.write',{path:draft.path,content,project:draft.project,files:JSON.stringify(draft.files)},draft.node);if(draft.content===content)draft.dirty=false;toast('Compose file saved');}
 finally{draft.saving=false;if(composeEditor.opened===key&&state.node===draft.node)paintComposeEditor();}
}
function deployComposeProject(){
 const draft=composeEditor.drafts.get(composeEditor.opened);if(!draft||draft.node!==state.node)return;
 if(draft.dirty){toast('Save your changes before deploying.');return;}
 const {node,path,project,files}=draft;
 confirmAction('Deploy this Compose project?',`Run docker compose up -d for ${project}. Containers may be recreated.`,async()=>{await managedJob('compose.up',{path,project,files:JSON.stringify(files)},node);if(state.node===node&&state.page==='docker')await Promise.all([loadContainers(),loadComposes()]);toast('Compose project deployed');});
}
document.addEventListener('input',event=>{if(event.target.id!=='compose-content')return;const draft=composeEditor.drafts.get(composeEditor.opened);if(draft){draft.content=event.target.value;draft.dirty=true;paintComposeEditor();}});
document.addEventListener('DOMContentLoaded',()=>{const dialog=$('#compose-editor-dialog');dialog.addEventListener('cancel',event=>{event.preventDefault();closeComposeEditor();});dialog.addEventListener('close',()=>{clearTimeout(composeEditor.closeTimer);dialog.replaceChildren();});});
