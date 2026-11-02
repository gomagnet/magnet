'use strict';
const dbView={tab:'data',offset:0,pages:[],filter:'',structure:null,queryResult:null,openTables:[],editing:null};
const explorer={key:'',files:[],filter:'',view:'list',selected:'',history:[],position:-1,request:0,openRequest:0,opened:'',drafts:new Map()};
function resetDatabaseView(){Object.assign(dbView,{tab:'data',offset:0,pages:[],filter:'',structure:null,queryResult:null,openTables:[],editing:null});}
function databaseTree(){return `<section id="database-browser" class="db-tree"><div class="db-tree-heading">${icon('database',16)} CONNECTION</div><label class="sr-label" for="database-schema">Database</label><select id="database-schema"><option value="">Choose a database</option>${managed.schemas.map(name=>`<option data-i18n-skip value="${esc(name)}" ${name===managed.dbSchema?'selected':''}>${esc(name)}</option>`).join('')}</select><input id="db-table-filter" type="search" aria-label="Find table" placeholder="Find a table…" value="${esc(dbView.filter)}"><div id="schemas-status">${screenStatus('schemas')}</div><div id="tables-status">${screenStatus('tables')}</div><div class="database-tables">${databaseTableLinks()}</div></section>`;}
function databaseTableLinks(){return managed.tables.filter(table=>table.name.toLowerCase().includes(dbView.filter.toLowerCase())).map(table=>button(`${icon('overview',14)}<span>${esc(table.name)}</span><small>${esc(table.estimated_rows??'')}</small>`,'database-table','tree-table '+(table.name===managed.dbTable?'active':''),`data-table="${esc(table.name)}" title="${esc(table.type)}"`)).join('')||'<p class="hint">No tables to display.</p>';}
function databaseUsersPanel(){return `<section id="database-users-panel"><div class="workbench-toolbar"><strong>Database accounts</strong>${button('＋ Create user','database-user-new','primary')}</div>${screenStatus('databaseUsers')}<div class="table-scroll"><table><thead><tr><th>User</th><th>Host</th><th>Authentication</th><th></th></tr></thead><tbody>${(managed.dbUsers||[]).map(user=>`<tr><td data-i18n-skip>${esc(user.user)}</td><td data-i18n-skip>${esc(user.host)}</td><td data-i18n-skip>${esc(user.plugin)}</td><td>${button('Edit','database-user-edit','',`data-user="${esc(user.user)}" data-host="${esc(user.host)}"`)}${button('Delete','database-user-delete','danger',`data-user="${esc(user.user)}" data-host="${esc(user.host)}"`)}</td></tr>`).join('')}</tbody></table></div></section>`;}
function databaseDataGrid(){
 const result=managed.result;
 if(!managed.dbTable)return empty('database','Open a table','Choose a database and a table from the explorer.','','');
 if(result&&!result.fields)return '<div class="notice">Table data</div>'+resultHTML(result);
 if(!result?.fields)return screenStatus('rows')||'<p class="hint">Opening table…</p>';
 const canEdit=result.editable&&result.primary_key?.length;
 return `<div class="workbench-toolbar"><span>${icon('overview',14)} <strong data-i18n-skip>${esc(managed.dbTable)}</strong></span>${button('＋ Insert row','db-row-new','primary',result.editable?'':'disabled')}<small>Double-click a cell to edit its row</small></div>${!canEdit?'<p class="hint">Grid editing requires an InnoDB table with a non-binary primary key. Use SQL for changes in other engines.</p>':''}${result.truncated?'<p class="hint">Some values are shortened. Rows with shortened text are read-only.</p>':''}<div class="data-grid-scroll"><table class="data-grid"><thead><tr><th>#</th>${result.fields.map(field=>`<th data-i18n-skip>${esc(field.name)} ${field.primary?'<span class="pk-tag">PK</span>':''}<small>${esc(field.type)}</small></th>`).join('')}<th>Actions</th></tr></thead><tbody>${result.rows.map((row,index)=>`<tr><td class="row-number">${result.offset+index+1}</td>${row.map((value,column)=>`<td tabindex="0" data-grid-row="${index}" data-grid-column="${column}" title="${esc(value??'NULL')}">${value===null?'<span class="null-value">NULL</span>':esc(value)}</td>`).join('')}<td class="row-actions">${button('Edit','db-row-edit','',`data-row="${index}" ${canEdit&&!result.row_readonly[index]?'':'disabled'}`)}${button('Delete','db-row-delete','danger',`data-row="${index}" ${canEdit&&!result.row_readonly[index]?'':'disabled'}`)}</td></tr>`).join('')}</tbody></table></div><div class="grid-footer"><span>${result.rows.length?`${result.offset+1}–${result.offset+result.rows.length}`:'0'} rows · ${result.limit} per page</span><div>${button('← Previous','db-page-prev','',result.offset>0?'':'disabled')}${button('Next →','db-page-next','',result.has_more&&result.offset+result.rows.length<=1000000?'':'disabled')}</div></div>`;
}
function databaseStructure(){return `${screenStatus('structure')}${dbView.structure?`<div class="data-grid-scroll"><table><thead><tr><th>Column</th><th>Type</th><th>NULL</th><th>Default</th><th>Extra</th></tr></thead><tbody>${dbView.structure.fields.map(field=>`<tr><td>${esc(field.name)} ${field.primary?'<span class="pk-tag">PK</span>':''}</td><td>${esc(field.type)}</td><td>${field.nullable?'Yes':'No'}</td><td>${esc(field.default??'NULL')}</td><td>${esc(field.extra)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="hint">Choose a table to view its structure.</p>'}`;}
function databaseQueryPanel(){return `<div class="sql-workspace"><form id="database-query-form"><label class="sr-label" for="sql-query">SQL statement</label><textarea id="sql-query" name="query" required spellcheck="false">${esc(managed.sql)}</textarea><div class="workbench-toolbar"><select id="sql-execution" name="execution"><option value="query" ${managed.execution==='query'?'selected':''}>Return rows</option><option value="exec" ${managed.execution==='exec'?'selected':''}>Execute change</option></select><button class="primary" type="submit">▶ Execute</button><span class="hint">Changes commit immediately.</span></div></form>${resultHTML(dbView.queryResult)}</div>`;}
function databaseTabContent(){return dbView.tab==='data'?`<div id="rows-status">${screenStatus('rows')}</div><div id="database-result">${databaseDataGrid()}</div>`:dbView.tab==='structure'?`<div id="db-structure">${databaseStructure()}</div>`:dbView.tab==='query'?databaseQueryPanel():databaseUsersPanel();}
function databaseWorkspace(){return `<section class="database-workbench panel" id="database-workbench">${databaseTree()}<div class="db-workspace-main"><div class="workbench-toolbar"><span>${icon('database',16)} <strong id="database-workspace-title">${esc(managed.dbTable||'Database workspace')}</strong></span>${badge('online','Connected')}</div><div class="table-tabs">${dbView.openTables.map(name=>button(esc(name),'database-table',name===managed.dbTable?'active':'',`data-table="${esc(name)}"`)).join('')}</div><div class="inner-workspace sql-inner-workspace"><div class="workspace-tabs inner-section-nav" role="tablist" aria-orientation="horizontal" aria-label="Database workspace">${[['data','Data'],['structure','Structure'],['query','SQL query'],...(managed.dbSelected?.engine==='mysql'?[['users','Users']]:[])].map(([tab,label])=>button(label,'db-tab',dbView.tab===tab?'active':'',`data-tab="${tab}" role="tab" tabindex="${dbView.tab===tab?0:-1}" aria-selected="${dbView.tab===tab}"`)).join('')}</div><div class="workspace-content" id="db-tab-content">${databaseTabContent()}</div></div></div></section>`;}
function paintDatabaseWorkspace(){if(state.page==='databases'&&managed.dbConnected)replaceScreenPanel('#database-workbench',databaseWorkspace());}
function paintDatabaseRows(){if(state.page==='databases'&&dbView.tab==='data'){const target=$('#database-result');if(target)target.innerHTML=databaseDataGrid();}}
function loadDatabaseStructure(){return screenTask('structure','database.structure',databaseArgs({schema:managed.dbSchema,table:managed.dbTable}),text=>{dbView.structure=JSON.parse(text);});}
async function openDatabaseTable(table){managed.dbTable=table;managed.result=null;dbView.structure=null;dbView.offset=0;dbView.pages=[];dbView.tab='data';if(!dbView.openTables.includes(table))dbView.openTables.push(table);paintDatabaseWorkspace();await loadDatabaseRows();}
function gridKey(result,row){return Object.fromEntries(result.primary_key.map(name=>[name,row[result.columns.indexOf(name)]]));}
function rowEditor(index=null,focusColumn=0){
 const result=managed.result;if(!result?.editable)return;
 const insert=index===null,row=insert?[]:result.rows[index];
 if(!insert&&(!result.primary_key.length||result.row_readonly[index]))return;
 dbView.editing={node:state.node,connection:managed.dbArgs,schema:managed.dbSchema,table:managed.dbTable,result,index,insert,row};
 modal(insert?'Insert row':'Edit row',`<form id="grid-row-form"><p class="hint">${esc(managed.dbSchema)} / ${esc(managed.dbTable)} · NULL and empty strings are distinct.</p><div class="row-editor-fields">${result.fields.map((field,i)=>{const disabled=field.generated||field.binary;const mode=insert?(disabled||field.extra.includes('auto_increment')||field.default!==null||field.nullable?'default':'value'):(row[i]===null?'null':'value');return `<div class="row-editor-field"><label for="grid-cell-${i}">${esc(field.name)} ${field.primary?'<span class="pk-tag">PK</span>':''}<small>${esc(field.type)}</small></label>${disabled?`<p class="hint">${field.generated?'Generated value':'Binary value; use SQL to change it'}</p>`:`<select name="mode_${i}" aria-label="${esc(field.name)} value mode">${insert?`<option value="default" ${mode==='default'?'selected':''}>Use default / omit</option>`:''}<option value="value" ${mode==='value'?'selected':''}>Value</option>${field.nullable?`<option value="null" ${mode==='null'?'selected':''}>NULL</option>`:''}</select><textarea id="grid-cell-${i}" name="cell_${i}" rows="2" spellcheck="false">${esc(insert?'':row[i]??'')}</textarea>`}</div>`;}).join('')}</div><div class="form-actions"><button class="primary" type="submit">${insert?'Insert row':'Save row'}</button></div></form>`);
 requestAnimationFrame(()=>$('#grid-cell-'+focusColumn)?.focus());
}
function ensureRowContext(edit){if(!edit||edit.node!==state.node||edit.connection!==managed.dbArgs||edit.schema!==managed.dbSchema||edit.table!==managed.dbTable)throw new Error('The database selection changed. Reopen the row.');}

const containerView={node:'',id:'',name:'',tab:'console',output:'',command:'',revision:0,busy:false};
function activeContainer(){return state.page==='docker'&&containerView.node===state.node?containerView.id:'';}
function resetContainerTools(){Object.assign(containerView,{node:'',id:'',name:'',tab:'console',output:'',command:'',revision:containerView.revision+1,busy:false});state.filePath='/';}
function containerTabContent(){return containerView.tab==='files'?fileExplorerHTML():`<div class="container-terminal"><p class="hint">Commands run inside this container in separate shells. Interactive programs are not supported.</p><pre id="container-output" class="terminal" aria-live="polite">${esc(containerView.output)}</pre><form id="container-console-form" class="terminal-input"><input name="command" aria-label="Container command" required autocomplete="off" placeholder="whoami" value="${esc(containerView.command)}"><button type="submit" ${containerView.busy?'disabled':''}>Run ↵</button></form></div>`;}
function containerToolsHTML(){
 if(!activeContainer())return '';
 return `<section class="panel editor-panel"><div class="toolbar container-tools-heading"><strong data-i18n-skip>${esc(containerView.name)}</strong>${button('×','container-tools-close','icon-button','aria-label="Close container tools"')}</div><div class="inner-workspace container-inner-workspace"><div class="workspace-tabs inner-section-nav" aria-label="Container tools">${[['console','Console'],['files','Files']].map(([tab,label])=>button(label,'container-tab',containerView.tab===tab?'active':'',`data-tab="${tab}" aria-pressed="${containerView.tab===tab}"`)).join('')}</div><div id="container-tab-content">${containerTabContent()}</div></div></section>`;
}
function paintContainerTools(){const target=$('#container-tools');if(target)target.innerHTML=containerToolsHTML();}
async function openContainerTools(id,name,tab){
 closeFileEditor(true);
 if(containerView.id!==id||containerView.node!==state.node){resetContainerTools();Object.assign(containerView,{node:state.node,id,name});}
 const content=$('#container-tab-content'),revision=containerView.revision,node=state.node;
 containerView.tab=tab==='files'?'files':'console';const selectedTab=containerView.tab;
 const current=()=>containerView.revision===revision&&state.node===node&&containerView.tab===selectedTab;
 if(content&&content.closest('#container-tools')&&content.dataset.container===id){
  for(const button of $$('#container-tools [data-action="container-tab"]')){const active=button.dataset.tab===selectedTab;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  if(!await transitionInnerSection(content,()=>{content.innerHTML=containerTabContent();},current))return;
 }else{paintContainerTools();const mounted=$('#container-tab-content');if(mounted)mounted.dataset.container=id;}
 if(!current())return;
 if(containerView.tab==='files')await explorerBrowse();
 else $('#container-console-form input')?.focus({preventScroll:true});
}
document.addEventListener('input',event=>{if(event.target.matches('#container-console-form input'))containerView.command=event.target.value;});
document.addEventListener('submit',async event=>{
 const form=event.target;if(form.id!=='container-console-form')return;event.preventDefault();if(containerView.busy)return;
 const revision=containerView.revision,id=activeContainer(),node=state.node,command=new FormData(form).get('command'),submit=form.querySelector('[type=submit]');
 if(!id)return;containerView.busy=true;setButtonBusy(submit,true);
 const current=()=>containerView.revision===revision&&activeContainer()===id&&state.node===node;
 const append=text=>{containerView.output=(containerView.output+'\n$ '+command+'\n'+text).slice(-200000);const log=$('#container-output');if(log){log.textContent=containerView.output;log.scrollTop=log.scrollHeight;}};
 try{const output=await managedJob('docker.shell',{container:id,command},node);if(current()){append(output||'Command completed.');if(containerView.command===command){containerView.command='';const input=$('#container-console-form input');if(input?.value===command)input.value='';}}}
 catch(error){if(current())append(error.message);}
 finally{setButtonBusy(submit,false);if(current()){containerView.busy=false;const currentButton=$('#container-console-form button');if(currentButton)currentButton.disabled=false;}}
});

function explorerIdentity(){return state.node+':'+(activeContainer()||'link');}
function ensureExplorer(){const key=explorerIdentity();if(explorer.key===key)return;closeFileEditor(true);Object.assign(explorer,{key,files:[],filter:'',selected:'',history:[],position:-1,request:explorer.request+1,openRequest:explorer.openRequest+1,opened:'',drafts:new Map()});}
function remoteJoin(directory,name){return directory==='/'?'/'+name:directory.replace(/\/$/,'')+'/'+name;}
function remoteParent(path){if(path==='/')return '/';if(path==='.')return '..';if(/^\.\.(\/\.\.)*$/.test(path))return path+'/..';return path.replace(/\/?[^/]+\/?$/,'')||'/';}
function fileDate(value){return value?new Date(value*1000).toLocaleString(magnetI18n.locale):'—';}
function explorerBreadcrumbs(){const path=state.filePath;const absolute=path.startsWith('/');let cursor=absolute?'':'.';return button(absolute?'Root':'Home','explorer-location','ghost',`data-path="${absolute?'/':'.'}"`)+path.split('/').filter(part=>part&&part!=='.').map(part=>{cursor=absolute?cursor+'/'+part:remoteJoin(cursor,part);return `<span>/</span>${button(esc(part),'explorer-location','ghost',`data-path="${esc(cursor)}"`)}`;}).join('');}
function explorerItems(){const files=explorer.files.filter(file=>file.name.toLowerCase().includes(explorer.filter.toLowerCase())).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));if(!files.length)return empty('folder','This folder is empty','No matching files or folders.','','');if(explorer.view==='grid')return `<div class="explorer-grid">${files.map(file=>button(`${icon(file.directory?'folder':'jobs',34)}<strong>${esc(file.name)}</strong><small>${file.directory?'Folder':bytes(file.size)}</small>`,'explorer-select','explorer-tile '+(file.name===explorer.selected?'selected':''),`data-name="${esc(file.name)}" title="Double-click to open"`)).join('')}</div>`;return `<table class="explorer-table"><thead><tr><th>Name</th><th>Size</th><th>Modified</th><th>Permissions</th><th></th></tr></thead><tbody>${files.map(file=>`<tr data-action="explorer-select" data-name="${esc(file.name)}" tabindex="0" class="${file.name===explorer.selected?'selected':''}"><td><span class="explorer-file-name">${icon(file.directory?'folder':'jobs',17)} <strong>${esc(file.name)}</strong>${file.symlink?'<small>Link</small>':''}</span></td><td>${file.directory?'—':bytes(file.size)}</td><td>${fileDate(file.modified)}</td><td><code>${esc(file.mode)}</code></td><td>${button('Open','explorer-open','ghost',`data-name="${esc(file.name)}"`)}</td></tr>`).join('')}</tbody></table>`;}
function fileExplorerHTML(){
 ensureExplorer();const limit='128 KiB',container=activeContainer();
 return `<section class="panel file-explorer editor-panel"><div class="workbench-toolbar"><strong>${icon('folder',17)} File explorer</strong><span class="hint">${container?'Container · Read-only':'Link user'} · ${limit} transfers</span><div class="explorer-navigation">${button('←','explorer-back','ghost',`aria-label="Back" ${explorer.position>0?'':'disabled'}`)}${button('→','explorer-forward','ghost',`aria-label="Forward" ${explorer.position<explorer.history.length-1?'':'disabled'}`)}${button('↑','explorer-up','ghost','aria-label="Parent folder"')}</div></div><div class="explorer-address"><div class="explorer-breadcrumbs">${explorerBreadcrumbs()}</div><input id="file-path" value="${esc(state.filePath==='.'?'/':state.filePath)}" aria-label="Folder path" spellcheck="false"></div><div class="explorer-layout"><aside class="explorer-places"><div class="eyebrow">QUICK ACCESS</div>${[['Home',container?'/':selectedNode()?.metrics.link_home||'/'],['Root','/'],['Configuration','/etc'],['Logs','/var/log'],['Applications','/opt'],['Users','/home'],['Temporary','/tmp']].map(([name,path])=>button(`${icon('folder',14)}${name}`,'explorer-location','ghost',`data-path="${path}"`)).join('')}</aside><div class="explorer-main"><div class="workbench-toolbar"><input id="explorer-search" type="search" placeholder="Find in this folder…" aria-label="Find file" value="${esc(explorer.filter)}">${button('☷','explorer-view','ghost',`data-view="list" aria-label="List view" aria-pressed="${explorer.view==='list'}"`)}${button('▦','explorer-view','ghost',`data-view="grid" aria-label="Grid view" aria-pressed="${explorer.view==='grid'}"`)}${container?'':button('New folder','explorer-mkdir')+button('New file','explorer-new-file')+'<label class="file-upload">Upload<input id="file-upload" type="file"></label>'}</div><div id="file-list" class="explorer-list">${explorerItems()}</div><div class="grid-footer"><span id="explorer-selection">${explorer.files.length} item(s)</span><div>${button('Download','explorer-download')}${container?'':button('Rename','explorer-rename')+button('Delete','explorer-remove','danger')}</div></div></div></div></section>`;
}
function paintExplorer(){document.querySelectorAll('[data-action="explorer-view"]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===explorer.view)));const list=$('#file-list');if(list)list.innerHTML=explorerItems();const crumbs=$('.explorer-breadcrumbs');if(crumbs)crumbs.innerHTML=explorerBreadcrumbs();const file=explorer.files.find(file=>file.name===explorer.selected),status=$('#explorer-selection');if(status)status.textContent=file?`${file.name} · ${file.directory?'Folder':bytes(file.size)} · ${fileDate(file.modified)}`:`${explorer.files.length} item(s)`;const back=$('[data-action="explorer-back"]'),forward=$('[data-action="explorer-forward"]');if(back)back.disabled=explorer.position<=0;if(forward)forward.disabled=explorer.position>=explorer.history.length-1;}
function paintExplorerSelection(){document.querySelectorAll('#file-list [data-action="explorer-select"]').forEach(el=>{const selected=el.dataset.name===explorer.selected;el.classList.toggle('selected',selected);el.setAttribute('aria-selected',String(selected));});const file=explorer.files.find(item=>item.name===explorer.selected),label=$('#explorer-selection');if(label&&file)label.textContent=`${file.name} · ${file.directory?'Folder':bytes(file.size)} · ${fileDate(file.modified)}`;}
async function explorerBrowse(history=true){
 ensureExplorer();const input=$('#file-path'),list=$('#file-list');if(!input||!list)return;const path=input.value.trim()||'.',key=explorer.key,request=++explorer.request;list.setAttribute('aria-busy','true');list.innerHTML='<p class="hint" role="status">Opening folder…</p>';
 try{const files=await managedJSON(activeContainer()?'docker.files':'link.files',explorerArgs({path}));if(key!==explorerIdentity()||request!==explorer.request||list!==$('#file-list'))return;explorer.files=files;explorer.selected='';state.filePath=path;if(history&&explorer.history[explorer.position]!==path){explorer.history=explorer.history.slice(0,explorer.position+1);explorer.history.push(path);explorer.position++;}paintExplorer();list.scrollTop=0;}
 catch(error){if(key===explorerIdentity()&&request===explorer.request&&list===$('#file-list'))list.innerHTML=`<p class="error" role="status">${esc(error.message)}</p>`;throw error;}
 finally{if(request===explorer.request)list.removeAttribute('aria-busy');}
}
async function explorerLocation(path,history=true){const input=$('#file-path');if(!input)return;input.value=path;await explorerBrowse(history);}
function explorerArgs(args){return activeContainer()?{...args,container:activeContainer()}:linkArgs(args);}
async function explorerRead(path){return await managedJSON(activeContainer()?'docker.file.read':'link.file.read',explorerArgs({path}));}
let fileEditorCloseTimer;
function closeFileEditor(immediate=false){
 const dialog=document.querySelector('#file-editor-dialog');clearTimeout(fileEditorCloseTimer);if(!dialog?.open)return;
 if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.classList.remove('is-closing');dialog.close();return;}
 dialog.classList.add('is-closing');fileEditorCloseTimer=setTimeout(()=>{dialog.classList.remove('is-closing');if(dialog.open)dialog.close();},180);
}
function showFileEditor(){
 const draft=explorer.drafts.get(explorer.opened);if(!draft)return;
 const dialog=$('#file-editor-dialog');clearTimeout(fileEditorCloseTimer);dialog.classList.remove('is-closing');dialog.dataset.connection=explorer.key;
 dialog.innerHTML=`<div class="dialog-heading"><h2 id="file-editor-title"></h2>${button('×','file-editor-close','icon-button','aria-label="Close file editor"')}</div><input id="edit-file-path" type="hidden" value="${esc(explorer.opened)}"><textarea id="file-content" ${activeContainer()?'readonly':''} spellcheck="false" aria-label="Remote file code editor">${esc(draft.content)}</textarea><div class="file-editor-footer"><span id="file-editor-status" role="status"></span>${activeContainer()?'':button('Save file','file-save','primary')}</div>`;
 paintExplorerEditor();if(!dialog.open)dialog.showModal();
}
function paintExplorerEditor(){const draft=explorer.drafts.get(explorer.opened),path=$('#edit-file-path'),content=$('#file-content');if(!path||!content)return;path.value=explorer.opened;content.value=draft?.content||'';const title=$('#file-editor-title');if(title)title.textContent=explorer.opened||'File editor';const status=$('#file-editor-status');if(status)status.textContent=activeContainer()?'Read-only':draft?.dirty?'Unsaved changes':'Saved';const save=$('#file-editor-dialog [data-action="file-save"]');if(save)save.disabled=!draft||!explorer.opened;}
async function explorerOpen(name){
 const file=explorer.files.find(item=>item.name===name);if(!file)return;if(file.directory)return explorerLocation(remoteJoin(state.filePath,name));
 const path=remoteJoin(state.filePath,name),key=explorer.key,request=++explorer.openRequest,version=screenData.version;explorer.selected=name;explorer.opened=path;paintExplorer();
 if(!explorer.drafts.has(path)){
  const result=await explorerRead(path);if(!state.authenticated||!['connect','docker'].includes(state.page)||version!==screenData.version||key!==explorerIdentity()||explorer.opened!==path||request!==explorer.openRequest)return;
  let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(base64Bytes(result.content));if(content.includes('\0'))throw new Error('binary');}catch{throw new Error('This is a binary file. Use Download instead of the text editor.');}
  if(!explorer.drafts.get(path)?.dirty)explorer.drafts.set(path,{content,dirty:false});
 }
 showFileEditor();
}
function selectedExplorerFile(){const file=explorer.files.find(item=>item.name===explorer.selected);if(!file)throw new Error('Select a file or folder first');return file;}
async function explorerMutation(action,path,target){if(activeContainer())throw new Error('Container files are read-only');return managedJob('link.file.'+action,linkArgs({path,...(target?{target}:{})}));}
function explorerNameForm(action){if(activeContainer())throw new Error('Container files are read-only');const file=action==='rename'?selectedExplorerFile():null;modal(action==='mkdir'?'New folder':action==='rename'?'Rename item':'New file',`<form id="explorer-name-form" data-kind="${action}" data-original="${esc(file?.name||'')}" data-key="${esc(explorer.key)}" data-directory="${esc(state.filePath)}"><label>Name<input name="name" required value="${esc(file?.name||'')}" autocomplete="off"></label><div class="form-actions"><button class="primary" type="submit">${action==='rename'?'Rename':'Create'}</button></div></form>`);}
function registerWorkspaceActions(){
 Object.assign(actions,{
  'file-editor-close':()=>closeFileEditor(),
  'container-tools':el=>openContainerTools(el.dataset.container,el.dataset.name,el.dataset.tab),
  'container-tab':el=>openContainerTools(containerView.id,containerView.name,el.dataset.tab),
  'container-tools-close':()=>{closeFileEditor(true);resetContainerTools();paintContainerTools();},
  'database-table':el=>openDatabaseTable(el.dataset.table),
  'db-tab':async el=>{const node=state.node,table=managed.dbTable,tab=el.dataset.tab,content=$('#db-tab-content');dbView.tab=tab;for(const button of $$('#database-workbench [data-action="db-tab"]')){const active=button.dataset.tab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}const changed=await transitionInnerSection(content,()=>{content.innerHTML=databaseTabContent();},()=>state.node===node&&managed.dbTable===table&&dbView.tab===tab);if(changed&&tab==='structure'&&table)await loadDatabaseStructure();},
  'db-page-prev':async()=>{dbView.offset=dbView.pages.pop()??Math.max(0,dbView.offset-50);await loadDatabaseRows();},
  'db-page-next':async()=>{dbView.pages.push(dbView.offset);dbView.offset+=managed.result.rows.length;await loadDatabaseRows();},
  'db-row-new':()=>rowEditor(),'db-row-edit':el=>rowEditor(Number(el.dataset.row)),
  'db-row-delete':el=>{const result=managed.result,index=Number(el.dataset.row),node=state.node,args=databaseArgs({schema:managed.dbSchema,table:managed.dbTable,key:JSON.stringify(gridKey(result,result.rows[index])),etag:result.etags[index]});confirmAction('Delete this row?','This permanently removes the selected row. A concurrent change will cancel deletion.',async()=>{await managedJob('database.row.delete',args,node);await loadDatabaseRows();});},
  'explorer-select':el=>{explorer.selected=el.dataset.name;paintExplorerSelection();},'explorer-open':el=>explorerOpen(el.dataset.name),
  'explorer-location':el=>explorerLocation(el.dataset.path),'explorer-up':()=>explorerLocation(remoteParent(state.filePath)),
  'explorer-back':()=>{if(explorer.position>0)return explorerLocation(explorer.history[--explorer.position],false);},
  'explorer-forward':()=>{if(explorer.position<explorer.history.length-1)return explorerLocation(explorer.history[++explorer.position],false);},
  'explorer-view':el=>{explorer.view=el.dataset.view;paintExplorer();},
  'explorer-mkdir':()=>explorerNameForm('mkdir'),'explorer-new-file':()=>explorerNameForm('new'),'explorer-rename':()=>explorerNameForm('rename'),
  'explorer-remove':()=>{const file=selectedExplorerFile(),path=remoteJoin(state.filePath,file.name);confirmAction('Delete '+file.name+'?',file.directory?'Only an empty folder can be removed.':'This permanently deletes the selected file.',async()=>{await explorerMutation('remove',path);explorer.drafts.delete(path);if(explorer.opened===path){explorer.opened='';paintExplorerEditor();}await explorerBrowse();});},
  'explorer-download':async()=>{const file=selectedExplorerFile();if(file.directory)throw new Error('Select a file to download');const key=explorerIdentity(),result=await explorerRead(remoteJoin(state.filePath,file.name));if(key!==explorerIdentity())return;const url=URL.createObjectURL(new Blob([base64Bytes(result.content)])),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},
  'file-save':()=>{if(activeContainer())throw new Error('Container files are read-only');const path=explorer.opened,draft=explorer.drafts.get(path),key=explorer.key;if(!draft||!path)throw new Error('Open a file first');const text=draft.content;confirmAction('Save remote file?',`Replace ${path} on this node.`,async()=>{if(key!==explorerIdentity())throw new Error('Connection changed');const content=utf8Base64(text);await managedJob('link.file.write',linkArgs({path,content}));if(explorer.drafts.get(path)?.content===text)explorer.drafts.get(path).dirty=false;paintExplorerEditor();await explorerBrowse();toast('File saved');});}
 });
}
document.addEventListener('input',event=>{
 if(event.target.id?.startsWith('grid-cell-')){const mode=event.target.form?.elements['mode_'+event.target.id.slice(10)];if(mode)mode.value='value';}
 if(event.target.id==='db-table-filter'){dbView.filter=event.target.value;const tree=$('.database-tables');if(tree)tree.innerHTML=databaseTableLinks();}
 if(event.target.id==='explorer-search'){explorer.filter=event.target.value;paintExplorer();}
 if(event.target.id==='file-content'&&explorer.opened&&!activeContainer()){const previous=explorer.drafts.get(explorer.opened);if(previous?.content===event.target.value)return;explorer.drafts.set(explorer.opened,{content:event.target.value,dirty:true});const status=$('#file-editor-status');if(status)status.textContent='Unsaved changes';}
});
document.addEventListener('dblclick',event=>{const cell=event.target.closest('[data-grid-row]');if(cell){rowEditor(Number(cell.dataset.gridRow),Number(cell.dataset.gridColumn));return;}const item=event.target.closest('#file-list [data-name]');if(item)explorerOpen(item.dataset.name).catch(error=>toast(error.message));});
document.addEventListener('keydown',event=>{if(event.key!=='Enter')return;const cell=event.target.closest('[data-grid-row]');if(cell){event.preventDefault();rowEditor(Number(cell.dataset.gridRow),Number(cell.dataset.gridColumn));return;}const item=event.target.closest('#file-list [data-name]');if(item){event.preventDefault();explorerOpen(item.dataset.name).catch(error=>toast(error.message));}});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['grid-row-form','explorer-name-form'].includes(form.id))return;event.preventDefault();const submit=form.querySelector('[type="submit"]');setButtonBusy(submit,true);
 try{
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='grid-row-form'){
   const edit=dbView.editing;ensureRowContext(edit);const values=Object.create(null);edit.result.fields.forEach((field,i)=>{if(field.generated||field.binary||data['mode_'+i]==='default')return;const value=data['mode_'+i]==='null'?null:data['cell_'+i];if(edit.insert||value!==edit.row[i])values[field.name]=value;});
   if(!edit.insert&&!Object.keys(values).length){closeModal();return;}
   const args=databaseArgs({schema:edit.schema,table:edit.table,values:JSON.stringify(values),...(edit.insert?{}:{key:JSON.stringify(gridKey(edit.result,edit.row)),etag:edit.result.etags[edit.index]})});
   await managedJob(edit.insert?'database.row.insert':'database.row.update',args,edit.node);closeModal();await loadDatabaseRows();toast('Row saved');
  }
  if(form.id==='explorer-name-form'){
   if(form.dataset.key!==explorerIdentity())throw new Error('Connection changed');const name=data.name;if(!name||name==='.'||name==='..'||/[\/\0]/.test(name))throw new Error('Enter a single file/folder name');const path=remoteJoin(form.dataset.directory,name),action=form.dataset.kind;
   if(action==='new'){if(explorer.files.some(file=>file.name===name))throw new Error('An item with that name already exists');explorer.opened=path;explorer.drafts.set(path,{content:'',dirty:true});}
   else if(action==='mkdir')await explorerMutation('mkdir',path);
   else {const old=remoteJoin(form.dataset.directory,form.dataset.original);await explorerMutation('rename',old,path);if(explorer.drafts.has(old)){explorer.drafts.set(path,explorer.drafts.get(old));explorer.drafts.delete(old);}if(explorer.opened===old){explorer.opened=path;paintExplorerEditor();}}
   closeModal(true);if(action==='new')showFileEditor();else await explorerBrowse();
  }
 }catch(error){toast(error.message);}finally{setButtonBusy(submit,false);}
});

const fileEditorDialog=document.querySelector('#file-editor-dialog');
fileEditorDialog.addEventListener('cancel',event=>{event.preventDefault();closeFileEditor();});
fileEditorDialog.addEventListener('close',()=>{if(!fileEditorDialog.open){clearTimeout(fileEditorCloseTimer);fileEditorDialog.classList.remove('is-closing');fileEditorDialog.replaceChildren();}});
