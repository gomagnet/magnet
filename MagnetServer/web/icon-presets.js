'use strict';
let iconPresets=[],iconPresetsRequest;
async function ensureIconPresets(){
 if(iconPresets.length)return;
 iconPresetsRequest??=fetch('/material-icons.json',{credentials:'same-origin',cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Unable to load icon presets');iconPresets=await response.json();}).catch(error=>{iconPresetsRequest=null;throw error;});
 await iconPresetsRequest;
}
function identityIcon(value,fallback='servers'){
 if(/^material:[a-z][a-z0-9_]*$/.test(value||''))return `<span class="material-symbols-outlined server-custom-icon" aria-hidden="true" data-i18n-skip>${esc(value.slice(9))}</span>`;
 return value?`<img class="server-custom-icon" src="${esc(value)}" alt="" referrerpolicy="no-referrer">`:icon(fallback,18);
}
function presetIconPicker(value){return `<fieldset class="icon-picker"><legend>Google Material Symbols</legend><p class="hint">Choose a preset, upload an image, or remove the icon to use the inherited default.</p><input type="search" data-icon-search data-editor-filter-only aria-label="Find an icon" placeholder="Find an icon…"><div class="icon-presets">${iconPresets.map(preset=>`<button type="button" data-icon-preset="${esc(preset.name)}" data-icon-label="${esc(preset.label)}" aria-label="${esc(preset.label)}" title="${esc(preset.label)}" aria-pressed="${value==='material:'+preset.name}"><span class="material-symbols-outlined" aria-hidden="true" data-i18n-skip>${esc(preset.name)}</span><span>${esc(preset.label)}</span></button>`).join('')}</div><p class="hint" data-icon-empty hidden>No matching icons.</p></fieldset>`;}
function updateIconSelection(form,value){
 form.dataset.image=value;form.querySelector('.image-preview').innerHTML=value?identityIcon(value):'';
 for(const preset of form.querySelectorAll('[data-icon-preset]'))preset.setAttribute('aria-pressed',String(value==='material:'+preset.dataset.iconPreset));
 const dirty=form.querySelector('[data-editor-dirty]');if(dirty)dirty.textContent='Unsaved changes';
}
document.addEventListener('click',event=>{const preset=event.target.closest('[data-icon-preset]');if(preset)updateIconSelection(preset.closest('form'),'material:'+preset.dataset.iconPreset);});

document.addEventListener('input',event=>{
 if(!event.target.matches('[data-icon-search]'))return;
 const picker=event.target.closest('.icon-picker'),query=event.target.value.trim().toLocaleLowerCase(magnetI18n.locale);let count=0;
 for(const preset of picker.querySelectorAll('[data-icon-preset]')){const terms=[preset.dataset.iconPreset,preset.dataset.iconLabel,magnetI18n.text(preset.dataset.iconLabel)].join(' ').toLocaleLowerCase(magnetI18n.locale);preset.hidden=!terms.includes(query);if(!preset.hidden)count++;}
 picker.querySelector('[data-icon-empty]').hidden=count>0;
});
