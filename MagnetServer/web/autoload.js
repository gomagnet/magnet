'use strict';
const screenData={node:'',version:0,pending:new Map(),loading:new Set(),errors:{},containers:null,services:null,serviceFilter:'',composes:null,cronContent:'',cronDirty:false,cronRevision:'',cronUser:'',cronTimezone:'',cronLoaded:false,applying:false};
function ensureScreenNode(){
 if(screenData.node===state.node)return;
 Object.assign(screenData,{node:state.node,version:screenData.version+1,loading:new Set(),errors:{},containers:null,services:null,serviceFilter:'',composes:null,cronContent:'',cronDirty:false,cronRevision:'',cronUser:'',cronTimezone:'',cronLoaded:false});
 state.filePath='/';
}
function screenStatus(name,label='Loading…'){
 if(!screenData.errors[name]&&!screenData.loading.has(name))return '';
 return `<p class="${screenData.errors[name]?'error':'hint'}" role="status">${esc(screenData.errors[name]||(screenData.loading.has(name)?label:'Data loads automatically when this screen opens.'))}</p>`;
}
function screenCurrent(node,version){return state.authenticated&&state.node===node&&screenData.node===node&&screenData.version===version;}
async function screenTask(name,kind,args,apply){
 const node=state.node,version=screenData.version,selected=managed.dbSelected;
 const current=()=>screenCurrent(node,version)&&(!kind.startsWith('database.')||kind==='database.status'||selected===managed.dbSelected)&&(name!=='tables'||args.schema===managed.dbSchema)&&(!['rows','structure'].includes(name)||(args.schema===managed.dbSchema&&args.table===managed.dbTable))&&(name!=='rows'||args.offset===String(dbView.offset));
 const key=JSON.stringify([node,kind,args]);
 screenData.loading.add(name);delete screenData.errors[name];paintScreenData(name);
 let promise=screenData.pending.get(key);
 if(!promise){promise=managedJob(kind,args,node);screenData.pending.set(key,promise);}
 try{const result=await promise;if(current())apply(result);return current();}
 catch(error){if(current())screenData.errors[name]=error.message;return false;}
 finally{if(screenData.pending.get(key)===promise)screenData.pending.delete(key);if(current()){screenData.loading.delete(name);paintScreenData(name);}}
}
function replaceScreenPanel(selector,html){
 const target=$(selector);if(!target)return;
 const template=document.createElement('template');template.innerHTML=html;
 const replacement=template.content.querySelector(selector);if(replacement)target.replaceWith(replacement);
}
function paintScreenData(name){
 if(!state.authenticated)return;
 if(['linkConnection','databaseConnection'].includes(name)&&['connect','databases'].includes(state.page))render();
 if(name==='users'&&state.page==='users')replaceScreenPanel('#users-panel',usersPage());
 if(name==='containers'&&state.page==='docker')replaceScreenPanel('#container-panel',docker());
 if(name==='installation'&&state.page==='databases')replaceScreenPanel('#database-installation',databasesPage());
 if(name==='schemas'&&state.page==='databases')replaceScreenPanel('#database-browser',databasesPage());
 if(name==='databaseUsers'&&state.page==='databases')replaceScreenPanel('#database-users-panel',databasesPage());
 if(name==='rows'&&state.page==='databases')paintDatabaseRows();
 if(name==='structure'&&state.page==='databases'){const el=$('#db-structure');if(el)el.innerHTML=databaseStructure();}
 if(name==='tables'&&state.page==='databases')replaceScreenPanel('#database-browser',databasesPage());
 if(name==='services'&&state.page==='startup'){const el=$('#service-rows');if(el)el.innerHTML=serviceRows();}
 if(name==='composes'&&state.page==='docker')replaceScreenPanel('#compose-projects',composeProjectsHTML());
 if(name==='cron'&&state.page==='startup'){
  const el=$('#cron-content');
  if(el&&!screenData[name+'Dirty']&&el.value!==screenData[name+'Content']){screenData.applying=true;try{el.value=screenData[name+'Content'];}finally{screenData.applying=false;}}
 }
 const status=$('#'+name+'-status');if(status)status.innerHTML=screenStatus(name);
 for(const action of name==='cron'?['cron-save']:[]){const el=$(`[data-action="${action}"]`);setButtonBusy(el,screenData.loading.has(name));}
 if(name==='cron'&&state.page==='startup')paintCronTasks();
}
function loadContainers(){return screenTask('containers','docker.list',{},text=>{screenData.containers=text.split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line));});}
function loadServices(){return screenTask('services','service.list',{},text=>{try{screenData.services=JSON.parse(text);}catch{screenData.services=text.split('\n').map(line=>line.trim().split(/\s+/)).filter(fields=>fields[0]?.endsWith('.service')).map(fields=>({unit:fields[0],state:fields[1]||'unknown',active:'unknown',sub:'',description:''}));}});}
function loadCron(){return screenTask('cron','cron.snapshot',{},text=>{const snapshot=JSON.parse(text);if(!screenData.cronDirty){screenData.cronContent=snapshot.content;screenData.cronRevision=snapshot.revision;screenData.cronUser=snapshot.user;screenData.cronTimezone=snapshot.timezone;screenData.cronLoaded=true;}});}

async function loadScreenData(fresh=true){
 if(!state.authenticated)return;
 if(['overview','servers','server','jobs','alerts','batch','settings'].includes(state.page)){screenData.version++;if(fresh)await refresh();return;}
 if(!state.node)return;
 ensureManagedNode();ensureScreenNode();screenData.version++;screenData.loading=new Set();
 const tasks=[];
 if(['apps','network'].includes(state.page))tasks.push(loadConfiguration(true));
 if(state.page==='users')tasks.push(loadUnixUsers());
 if(state.page==='docker')tasks.push(loadContainers(),loadComposes());
 if(state.page==='startup')tasks.push(loadServices(),loadCron());
 if(state.page==='databases')tasks.push((async()=>{
  await inspectDatabases();if(state.page!=='databases')return;
  if(managed.dbConnected){const reads=[loadSchemas()];if(managed.dbSelected?.engine==='mysql')reads.push(loadDatabaseUsers());if(managed.dbSchema)reads.push(loadDatabaseTables());if(managed.dbTable){reads.push(loadDatabaseRows());if(dbView.tab==='structure')reads.push(loadDatabaseStructure());}await Promise.allSettled(reads);}
 })());
 if(state.page==='connect')tasks.push((async()=>{if(!managed.linkConnected&&!await connectLinkAccount())return;if(state.page==='connect'&&managed.linkConnected)await browseFiles().catch(()=>{});})());
 await Promise.allSettled(tasks);
}
function loadDatabaseRows(){return screenTask('rows','database.rows',databaseArgs({schema:managed.dbSchema,table:managed.dbTable,offset:String(dbView.offset)}),text=>{managed.result=JSON.parse(text);});}
function databaseRows(result){return result.rows.map(row=>Object.fromEntries(result.columns.map((column,i)=>[column,row[i]])));}
function loadDatabaseTables(){
 const schema=managed.dbSchema,args=databaseArgs({schema});
 return screenTask('tables','database.tables',args,text=>{if(managed.dbSchema===schema)managed.tables=databaseRows(JSON.parse(text));});
}
document.addEventListener('input',event=>{
 if(event.target.id==='service-search'){screenData.serviceFilter=event.target.value;const rows=$('#service-rows');if(rows)rows.innerHTML=serviceRows();}
 if(screenData.applying)return;
 if(event.target.id==='cron-content'){screenData.cronContent=event.target.value;screenData.cronDirty=true;}
});
document.addEventListener('change',event=>{
 if(event.target.id==='file-path')browseFiles().catch(error=>toast(error.message));
});

document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.id==='file-path'){event.preventDefault();event.target.blur();}});
document.addEventListener('click',event=>{const link=event.target.closest('[data-page]');if(link&&link.hash===location.hash&&state.authenticated){event.preventDefault();navigation();}});
