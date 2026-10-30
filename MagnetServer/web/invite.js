'use strict';
document.documentElement.dataset.theme=localStorage.getItem('magnet-theme')||'auto';
let inviteToken=location.hash.slice(1),inviteEnrollment='';
history.replaceState(null,'',location.pathname);
const profileForm=document.querySelector('#invite-profile'),totpForm=document.querySelector('#invite-totp'),inviteError=document.querySelector('#invite-error');
if(!/^[A-Za-z0-9_-]{43}$/.test(inviteToken)){profileForm.hidden=true;inviteError.textContent='This invitation is missing or invalid. Open the full link provided by your administrator.';}
async function inviteRequest(path,body){
 const response=await fetch('/api/invite/'+path,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','X-Magnet-Request':'1'},body:JSON.stringify({token:inviteToken,...body})});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||(response.status===429?'Too many attempts. Try again later.':'Unable to accept invitation.'));return result;
}
profileForm.addEventListener('submit',async event=>{
 event.preventDefault();const button=profileForm.querySelector('button');button.disabled=true;inviteError.textContent='';
 try{const result=await inviteRequest('enroll',Object.fromEntries(new FormData(profileForm)));inviteEnrollment=result.enrollment;document.querySelector('#invite-secret').textContent=result.secret;document.querySelector('#invite-uri').href=result.uri;document.querySelector('#invite-deadline').textContent='Confirm a code before '+new Date(result.expires*1000).toLocaleTimeString()+'.';profileForm.hidden=true;totpForm.hidden=false;totpForm.elements.code.focus();}
 catch(error){inviteError.textContent=error.message;}finally{button.disabled=false;}
});
document.querySelector('#invite-back').addEventListener('click',()=>{inviteEnrollment='';totpForm.reset();totpForm.hidden=true;profileForm.hidden=false;document.querySelector('#invite-secret').textContent='';document.querySelector('#invite-uri').removeAttribute('href');inviteError.textContent='';});
totpForm.addEventListener('submit',async event=>{
 event.preventDefault();const button=totpForm.querySelector('[type=submit]');button.disabled=true;document.querySelector('#invite-back').disabled=true;inviteError.textContent='';
 try{const result=await inviteRequest('complete',{enrollment:inviteEnrollment,code:new FormData(totpForm).get('code')});inviteToken='';inviteEnrollment='';totpForm.reset();totpForm.hidden=true;profileForm.reset();document.querySelector('#invite-secret').textContent='';document.querySelector('#invite-uri').removeAttribute('href');document.querySelector('#invite-status').hidden=true;document.querySelector('#invite-codes').textContent=result.recovery_codes.join('\n');document.querySelector('#invite-recovery').hidden=false;}
 catch(error){inviteError.textContent=error.message;}finally{button.disabled=false;document.querySelector('#invite-back').disabled=false;}
});
