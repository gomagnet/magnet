'use strict';
document.documentElement.dataset.theme=localStorage.getItem('magnet-theme')||'auto';
const loginForm=document.querySelector('#login-form'),loginError=document.querySelector('#login-error');
const accessKey=document.querySelector('#access-key'),loginUsername=document.querySelector('#login-username');
function updateLoginKey(){accessKey.required=loginUsername.value.trim().toLowerCase()==='admin';}
loginUsername.addEventListener('input',updateLoginKey);loginUsername.addEventListener('change',updateLoginKey);updateLoginKey();
loginForm.addEventListener('submit',async event=>{
 event.preventDefault();const submit=loginForm.querySelector('button');submit.disabled=true;loginError.textContent='';
 try{
  const data=new FormData(loginForm),response=await fetch('/api/login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Magnet-Request':'1'},body:JSON.stringify({username:data.get('username'),key:data.get('key'),code:data.get('code')})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){if(result.code==='totp_required')document.querySelector('#login-code').focus();throw new Error(result.error||(response.status===429?'Too many attempts. Please try again later.':'Unable to sign in. Check your access key and authenticator code.'));}
  loginForm.reset();location.replace('/'+location.hash);
 }catch(error){loginError.textContent=error.message;}finally{submit.disabled=false;}
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

const loginQuery=new URLSearchParams(location.search),mfaForm=document.querySelector('#login-mfa-form');
if(loginQuery.has('oidc_error'))loginError.textContent='OpenID sign-in could not be completed. Check that your account and provider are enabled. A workspace administrator can find the failed step in the MagnetServer logs.';
if(loginQuery.has('mfa')){loginForm.hidden=true;mfaForm.hidden=false;mfaForm.querySelector('input').focus();}
mfaForm.addEventListener('submit',async event=>{
 event.preventDefault();const button=mfaForm.querySelector('button'),error=mfaForm.querySelector('.error');button.disabled=true;error.textContent='';
 try{const response=await fetch('/api/login/mfa',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Magnet-Request':'1'},body:JSON.stringify({code:new FormData(mfaForm).get('code')})});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Unable to verify sign-in.');mfaForm.reset();location.replace('/dash'+location.hash);}
 catch(failure){error.textContent=failure.message;}finally{button.disabled=false;}
});
if(!loginQuery.has('mfa'))fetch('/api/login/providers',{cache:'no-store'}).then(response=>response.ok?response.json():[]).then(providers=>{
 const root=document.querySelector('#login-providers');if(!Array.isArray(providers)||!providers.length)return;
 const label=document.createElement('p');label.textContent='Or continue with';root.append(label);
 for(const provider of providers){const link=document.createElement('a');link.textContent=provider.name;link.href='/auth/oidc/'+encodeURIComponent(provider.id)+'/start';link.addEventListener('click',()=>{try{sessionStorage.setItem('magnet-login-route',location.hash);}catch{}});root.append(link);}root.hidden=false;
}).catch(()=>{});
