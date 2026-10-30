'use strict';
const setupForm=document.querySelector('#setup-form');
let workspaceURL='',administratorKey='',preserveOrigin=false;
document.documentElement.dataset.theme=localStorage.getItem('magnet-theme')||'auto';
document.querySelector('#setup-url').value=location.origin;
fetch('/api/setup',{cache:'no-store'}).then(async response=>{
 if(response.status===401){location.replace('/login');return;}if(!response.ok)throw new Error('Unable to load setup settings. Reload this page.');
 const settings=await response.json();
 document.querySelector('#setup-listen').value=settings.listen;
 document.querySelector('#setup-data-dir').textContent=settings.data_dir;
}).catch(error=>{document.querySelector('#setup-error').textContent=error.message;});
setupForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const data=new FormData(setupForm);
 const submit=document.querySelector('#setup-submit');
 const progress=document.querySelector('#setup-progress');
 const errorElement=document.querySelector('#setup-error');
 errorElement.textContent='';submit.disabled=true;progress.textContent='Connecting to MariaDB and preparing your workspace…';
 try{
  const response=await fetch('/api/setup',{
   method:'POST',headers:{'Content-Type':'application/json','X-Magnet-Request':'1'},
   body:JSON.stringify({listen:data.get('listen').trim(),public_url:data.get('public_url').trim(),tls_cert:data.get('tls_cert').trim(),tls_key:data.get('tls_key').trim(),create_database:data.has('create_database'),database:{host:data.get('db_host').trim(),port:Number(data.get('db_port')),user:data.get('db_user'),password:data.get('db_password'),name:data.get('db_name').trim(),tls:data.has('db_tls')}})
  });
  if(response.status===401){location.replace('/login');return;}const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Setup failed. Check the server logs and try again.');
  const destination=new URL(result.url);
  if(!['http:','https:'].includes(destination.protocol))throw new Error('The server returned an invalid workspace URL.');
  workspaceURL=destination.href;administratorKey=result.admin_key;preserveOrigin=result.preserve_origin===true;
  setupForm.reset();setupForm.hidden=true;
  document.querySelector('#setup-admin-key').textContent=administratorKey;
  document.querySelector('#setup-success').hidden=false;
 }catch(error){errorElement.textContent=error.message;}
 finally{submit.disabled=false;progress.textContent='';}
});
document.querySelector('#copy-admin-key').addEventListener('click',async()=>{
 const status=document.querySelector('#setup-success-status');
 try{
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(administratorKey);status.textContent='Access key copied.';}
  else{const range=document.createRange();range.selectNodeContents(document.querySelector('#setup-admin-key'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Access key selected. Press Ctrl+C to copy.';}
 }catch{status.textContent='Select and copy the access key above.';}
});
document.querySelector('#open-workspace').addEventListener('click',async event=>{
 if(!workspaceURL)return;
 // The node-facing URL may differ from the browser's address (for example, an SSH tunnel).
 // Keep the current browser origin when protocol/port were left unchanged.
 const destination=new URL(workspaceURL);
 if(!preserveOrigin){location.assign(destination.origin+'/');return;}
 const button=event.currentTarget,status=document.querySelector('#setup-success-status');
 button.disabled=true;status.textContent='Waiting for your workspace to finish starting…';
 for(let attempt=0;attempt<15;attempt++){
  try{const response=await fetch('/api/session',{cache:'no-store',signal:AbortSignal.timeout(2000)});if(response.ok||response.status===401){location.assign(location.origin+'/');return;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,700));
 }
 button.disabled=false;status.textContent='The workspace is still starting. Check the server logs, then try again. Your access key is saved on this page.';
});
