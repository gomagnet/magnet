'use strict';
const performanceView={node:'',version:0,data:null,error:'',pending:false,timer:null,sort:'cpu',direction:-1,query:''};
const processColumns=[['name','Name'],['pid','PID'],['cpu','CPU'],['memory','Memory'],['swap','Swap'],['read','Disk read / s'],['write','Disk write / s'],['threads','Threads']];
function resetPerformance(){
 clearTimeout(performanceView.timer);
 Object.assign(performanceView,{node:'',version:performanceView.version+1,data:null,error:'',pending:false,query:''});
}
function performancePage(){
 return `<section class="panel" id="performance-panel"><div class="panel-heading"><h3>Processes</h3><input id="process-search" type="search" placeholder="Search processes" aria-label="Search processes" value="${esc(performanceView.query)}"></div><div class="section-body"><p class="hint">CPU is a percentage of total server capacity. Memory is resident RAM. Disk rates measure storage I/O; per-process network usage is unavailable.</p><p class="hint">Processes visible to the Link account are sampled automatically. New processes need two samples for rates.</p><div id="process-status" role="status">${performanceStatus()}</div></div><div class="table-wrap"><table class="process-table"><thead><tr>${processColumns.map(([key,label])=>`<th scope="col" data-process-column="${key}" aria-sort="${performanceView.sort===key?(performanceView.direction===1?'ascending':'descending'):'none'}"><button type="button" data-process-sort="${key}"><span>${esc(label)}</span><span aria-hidden="true">${performanceView.sort===key?(performanceView.direction===1?'↑':'↓'):'↕'}</span></button></th>`).join('')}</tr></thead><tbody id="process-rows">${performanceRows()}</tbody></table></div></section>`;
}
function performanceStatus(){
 if(performanceView.error)return `<p class="error">${esc(performanceView.error)}</p>`;
 const data=performanceView.data,snapshot=data?.snapshot;
 if(!data)return '<p class="hint">Loading processes…</p>';
 if(!data.online)return '<p class="notice">Server offline</p>';
 if(!snapshot)return '<p class="notice">Update MagnetLink to 0.4.10 for process statistics.</p>';
 if(snapshot.error)return `<p class="error">${esc(magnetI18n.text(snapshot.error))}</p>`;
 return `<span>${magnetI18n.text('Last sample')}</span>: <time data-i18n-skip>${esc(new Date(snapshot.sampled*1000).toLocaleTimeString(magnetI18n.locale))}</time> · <span>${magnetI18n.text('Visible processes')}</span>: ${snapshot.processes.length} / ${snapshot.total}${snapshot.skipped?`<p class="hint">${magnetI18n.text('Some processes exited or could not be read.')}</p>`:''}${snapshot.truncated?'<p class="notice">Process list limited to 4096 entries.</p>':''}`;
}
function performanceRows(){
 const snapshot=performanceView.error?null:performanceView.data?.snapshot;
 const rows=[...(snapshot?.processes||[])].filter(row=>`${row.name} ${row.pid}`.toLocaleLowerCase().includes(performanceView.query.toLocaleLowerCase()));
 const {sort,direction}=performanceView;
 rows.sort((a,b)=>{
  const av=a[sort],bv=b[sort];
  if(av==null||bv==null)return av==null&&bv==null?a.pid-b.pid:av==null?1:-1;
  const result=sort==='name'?String(av).localeCompare(String(bv),magnetI18n.locale,{sensitivity:'base'}):av-bv;
  return result*direction||a.pid-b.pid;
 });
 if(!rows.length)return `<tr><td colspan="8" class="hint">${performanceView.query?'No matches.':snapshot&&!snapshot.error?'No visible processes.':'Process statistics unavailable.'}</td></tr>`;
 return rows.map(row=>`<tr>${processColumns.map(([key])=>{
  const value=row[key];let label=value==null?'—':key==='cpu'?pct(value):['memory','swap'].includes(key)?bytes(value):['read','write'].includes(key)?bytes(value)+'/s':String(value);
  return `<td data-i18n-skip>${esc(label)}</td>`;
 }).join('')}</tr>`).join('');
}
function paintPerformance(){
 if(state.page!=='performance')return;
 const rows=$('#process-rows'),status=$('#process-status');
 if(rows)rows.innerHTML=performanceRows();if(status)status.innerHTML=performanceStatus();
 for(const th of $$('[data-process-column]')){
  const active=th.dataset.processColumn===performanceView.sort;
  th.setAttribute('aria-sort',active?(performanceView.direction===1?'ascending':'descending'):'none');
  th.querySelector('[aria-hidden]').textContent=active?(performanceView.direction===1?'↑':'↓'):'↕';
 }
}
async function loadPerformance(){
 if(!state.authenticated||state.page!=='performance'||!state.node||performanceView.pending)return;
 const node=state.node,version=performanceView.version;
 performanceView.node=node;performanceView.pending=true;
 const current=()=>state.authenticated&&state.page==='performance'&&state.node===node&&performanceView.version===version;
 try{
  const data=await api(`/nodes/${encodeURIComponent(node)}/processes`);
  if(current()){performanceView.data=data;performanceView.error='';}
 }catch(error){if(current()){performanceView.error=error.message;performanceView.data=null;}}
 finally{if(current()){performanceView.pending=false;paintPerformance();performanceView.timer=setTimeout(loadPerformance,5000);}}
}
document.addEventListener('click',event=>{
 const control=event.target.closest('[data-process-sort]');if(!control)return;
 const key=control.dataset.processSort;if(!processColumns.some(([column])=>column===key))return;
 performanceView.direction=performanceView.sort===key?-performanceView.direction:key==='name'||key==='pid'?1:-1;
 performanceView.sort=key;paintPerformance();
});
document.addEventListener('input',event=>{if(event.target.id==='process-search'){performanceView.query=event.target.value;paintPerformance();}});
