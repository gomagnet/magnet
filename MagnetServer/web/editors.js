'use strict';
// Pinned, self-hosted Monaco distribution. No document content leaves Magnet.
require.config({paths:{vs:'/vendor/monaco/vs'}});
require(['vs/editor/editor.main'], function () {
 const editors=new Map(), valueProperty=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
 const targets='#file-content, #compose-content, #cron-content, #sql-query, textarea[data-code-language]';
 monaco.languages.register({id:'crontab'});
 monaco.languages.setMonarchTokensProvider('crontab',{tokenizer:{root:[[/^\s*#.*/, 'comment'],[/^\s*[A-Za-z_][\w]*\s*=/,'variable'],[/@[a-z]+/,'keyword'],[/\b\d+(?:[-/,]\d+)*\b/,'number'],[/\*/,'keyword'],[/"[^"\n]*"|'[^'\n]*'/,'string'],[/\$[\w{}]+/,'variable']]}});
 // Common Linux formats without a bundled Monaco language contribution.
 const quoted=[[/"(?:\\.|[^"\\])*"|'[^']*'/,'string']];
 function registerLanguage(id,rules){monaco.languages.register({id});monaco.languages.setMonarchTokensProvider(id,{tokenizer:{root:rules}});}
 registerLanguage('linuxconf',[[/#.*$/,'comment'],[/^\s*\[[^\]]+\]/,'type.identifier'],...quoted,[/\$\{?\w+\}?/,'variable'],[/^\s*[\w.@/-]+(?=\s|=|:)/,'attribute.name'],[/\b(?:yes|no|true|false|on|off|allow|deny|defaults)\b/,'keyword'],[/\b\d+(?:\.\d+)*(?:[KMG]i?B?|ms|s)?\b/,'number'],[/[=:,]/,'delimiter']]);
 registerLanguage('nginx',[[/#.*$/,'comment'],...quoted,[/\$\w+/,'variable'],[/\b(?:server|location|upstream|http|events|stream|map|if|include|listen|server_name|root|index|proxy_pass|return|rewrite|ssl_certificate|ssl_certificate_key)\b/,'keyword'],[/\b\d+(?:\.\d+)*(?:ms|s|m|k|M)?\b/,'number'],[/[{};]/,'delimiter']]);
 registerLanguage('apacheconf',[[/#.*$/,'comment'],[/<\/?[\w]+\b/,'tag'],[/>/,'delimiter'],...quoted,[/\$\{[^}]+\}|%\{[^}]+\}/,'variable'],[/^\s*\w+/,'keyword'],[/\b\d+\b/,'number']]);
 registerLanguage('toml',[[/#.*$/,'comment'],[/^\s*\[\[?[^\]]+\]\]?/,'type.identifier'],...quoted,[/[\w.-]+(?=\s*=)/,'attribute.name'],[/\b(?:true|false)\b/,'keyword'],[/[+-]?\b(?:0[xob][\da-fA-F_]+|\d[\d_.]*(?:[eE][+-]?\d+)?)\b/,'number'],[/[=,{}\[\]]/,'delimiter']]);
 registerLanguage('dotenv',[[/^\s*#.*/,'comment'],[/\bexport\b/,'keyword'],[/[A-Za-z_][\w]*(?=\s*=)/,'variable'],...quoted,[/\$\{?\w+\}?/,'variable'],[/\s+#.*$/,'comment'],[/=/,'delimiter']]);
 registerLanguage('log',[[/\b(?:ERROR|FATAL|CRITICAL|PANIC|failed)\b/i,'invalid'],[/\b(?:WARN|WARNING)\b/i,'keyword'],[/\b(?:INFO|DEBUG|TRACE|NOTICE)\b/,'type.identifier'],[/\b\d{4}-\d{2}-\d{2}[T ]\d[\d:.Z+-]*/,'number'],...quoted,[/\b\d+(?:\.\d+)+\b/,'number']]);
 registerLanguage('makefile',[[/^\s*#.*/,'comment'],[/\$\([^)]+\)|\$[@<^?*]/,'variable'],[/^[\w./%${}()-]+(?=\s*:)/,'type.identifier'],[/^\s*(?:include|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|override)\b/,'keyword'],...quoted,[/[:?+]?=/,'delimiter']]);
 function fileLanguage(path,content=''){
  path=path.toLowerCase();const name=path.split('/').pop(), extension=name.split('.').pop(), firstLine=content.split('\n',1)[0];
  if(name==='crontab'||/\/cron\.d\//.test(path))return 'crontab';
  if(/^#!/.test(firstLine)){
   if(/\b(?:python[\d.]*|pypy[\d.]*)\b/.test(firstLine))return 'python';
   if(/\b(?:node|nodejs|bun|deno)\b/.test(firstLine))return 'javascript';
   if(/\bperl\b/.test(firstLine))return 'perl';
   if(/\bruby\b/.test(firstLine))return 'ruby';
   if(/\b(?:ba|da|z|k|fi)?sh\b/.test(firstLine))return 'shell';
  }
  if(name==='dockerfile'||name.startsWith('dockerfile.')||name==='containerfile')return 'dockerfile';
  if(name==='makefile'||name==='gnumakefile'||extension==='mk')return 'makefile';
  if(name==='.env'||name.startsWith('.env.')||extension==='env')return 'dotenv';
  if(extension==='toml')return 'toml';
  if(/\.(?:service|socket|timer|target|mount|automount|path|slice|scope|swap|network|netdev|link|desktop)$/.test(name)||path.includes('/systemd/'))return 'ini';
  if(name==='nginx.conf'||path.includes('/nginx/'))return 'nginx';
  if(name==='.htaccess'||path.includes('/apache2/')||path.includes('/httpd/'))return 'apacheconf';
  if(/^(?:sshd?_config|ssh_config)$/.test(name)||/\/(?:sshd?_config\.d|\.ssh)\//.test(path)&&(!extension||name==='config'||extension==='conf'))return 'linuxconf';
  if(/^\.(?:bashrc|bash_profile|bash_login|profile|zshrc|zprofile|zshenv)$/.test(name)||/\/etc\/(?:default|sysconfig)\//.test(path))return 'shell';
  if(name==='user-data'&&firstLine.startsWith('#cloud-config'))return 'yaml';
  if(['hosts','fstab','crypttab','sudoers','resolv.conf','sources.list','nftables.conf','authorized_keys'].includes(name)||/\/sudoers\.d\//.test(path))return 'linuxconf';
  if(extension==='log'||/\/var\/log\//.test(path))return 'log';
  return ({yaml:'yaml',yml:'yaml',json:'json',jsonc:'json',json5:'json',js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',sh:'shell',bash:'shell',zsh:'shell',fish:'shell',sql:'sql',py:'python',go:'go',rs:'rust',rb:'ruby',pl:'perl',pm:'perl',lua:'lua',php:'php',c:'c',h:'c',cc:'cpp',cpp:'cpp',hpp:'cpp',java:'java',kt:'kotlin',tf:'hcl',hcl:'hcl',html:'html',htm:'html',vue:'html',svelte:'html',css:'css',scss:'scss',less:'less',xml:'xml',svg:'xml',md:'markdown',markdown:'markdown',ini:'ini',cnf:'ini',cfg:'ini',properties:'ini',conf:'linuxconf',list:'linuxconf'})[extension]||'plaintext';
 }
 function language(el){return el.dataset.codeLanguage||({'compose-content':'yaml','cron-content':'crontab','sql-query':'sql'})[el.id]||fileLanguage(document.querySelector('#edit-file-path')?.value||'',el.value);}
 function theme(){
  const preference=document.documentElement.dataset.theme;
  monaco.editor.setTheme(preference==='dark'||(preference!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'vs-dark':'vs');
 }
 function mount(el){
  if(editors.has(el))return;
  const host=document.createElement('div');host.className='code-editor';host.dataset.editorFor=el.id;
  el.insertAdjacentElement('afterend',host);
  const model=monaco.editor.createModel(el.value,language(el));
  const editor=monaco.editor.create(host,{model,automaticLayout:true,minimap:{enabled:false},fontSize:14.95,fontFamily:'Consolas, monospace',lineNumbers:'on',scrollBeyondLastLine:false,smoothScrolling:!matchMedia('(prefers-reduced-motion: reduce)').matches,readOnly:el.readOnly,scrollbar:{verticalScrollbarSize:8,horizontalScrollbarSize:8,verticalSliderSize:5,horizontalSliderSize:5,useShadows:false,verticalHasArrows:false,horizontalHasArrows:false},wordWrap:'on',tabSize:2,insertSpaces:true,padding:{top:12,bottom:12},fixedOverflowWidgets:false,ariaLabel:el.getAttribute('aria-label')||el.id,renderValidationDecorations:'on'});
  const invalid=event=>{event.preventDefault();editor.focus();};
  const focus=()=>editor.focus();
  el.addEventListener('focus',focus);el.addEventListener('invalid',invalid);el.classList.add('code-editor-source');
  const oldTabIndex=el.getAttribute('tabindex');el.tabIndex=-1;el.setAttribute('aria-hidden','true');
  // Preserve existing FormData, save handlers, and asynchronous file loads.
  Object.defineProperty(el,'value',{configurable:true,get(){return valueProperty.get.call(this);},set(value){
   valueProperty.set.call(this,value);const text=valueProperty.get.call(this);
   monaco.editor.setModelLanguage(model,language(this));if(model.getValue()!==text)model.setValue(text);
  }});
  const subscription=model.onDidChangeContent(()=>{valueProperty.set.call(el,model.getValue());el.dispatchEvent(new Event('input',{bubbles:true}));});
  const reset=()=>queueMicrotask(()=>{if(el.isConnected)el.value=valueProperty.get.call(el);});
  el.form?.addEventListener('reset',reset);
  editors.set(el,{model,editor,host,dispose(){subscription.dispose();editor.dispose();model.dispose();el.form?.removeEventListener('reset',reset);el.removeEventListener('focus',focus);el.removeEventListener('invalid',invalid);delete el.value;el.classList.remove('code-editor-source');el.removeAttribute('aria-hidden');if(oldTabIndex===null)el.removeAttribute('tabindex');else el.setAttribute('tabindex',oldTabIndex);host.remove();}});
 }
 let pending=false;
 function scan(){pending=false;for(const [el,item] of editors)if(!el.isConnected){item.dispose();editors.delete(el);}document.querySelectorAll(targets).forEach(mount);}
 new MutationObserver(records=>{
  if(pending||records.every(record=>record.target.nodeType===1&&record.target.closest('.monaco-editor')))return;
  pending=true;requestAnimationFrame(scan);
 }).observe(document.body,{childList:true,subtree:true});
 new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
 document.addEventListener('input',event=>{if(event.target.id==='edit-file-path'){const el=document.querySelector('#file-content'),item=editors.get(el);if(item)monaco.editor.setModelLanguage(item.model,language(el));}});
 theme();scan();
}, function(error){console.error('Could not load Monaco',error);});
