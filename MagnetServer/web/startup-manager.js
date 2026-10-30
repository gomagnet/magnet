'use strict';
const serviceTemplates=[
 ['startup','Startup task','Run once at each boot, without automatic restarts.'],
 ['always','Always running','Start at boot and restart after every exit. Keep the command in the foreground.'],
 ['on-failure','Restart on failure','Start at boot and restart only after an unsuccessful exit.'],
 ['manual','Manual task','Run once when started manually; boot startup is off by default.']
];
function openServiceCreator(){
 const user=selectedNode()?.metrics.link_user||'root';
 modal('Create systemd service',`<form id="service-create-form" data-node="${esc(state.node)}"><fieldset class="startup-form-fields"><h3>Choose a template</h3><div class="service-template-grid">${serviceTemplates.map(([value,label,description],i)=>`<label class="service-template"><input type="radio" name="template" value="${value}" ${i===0?'checked':''}><span><strong>${label}</strong><small>${description}</small></span></label>`).join('')}</div><div class="form-grid"><label>Service name<input name="unit" required pattern="[a-zA-Z0-9][a-zA-Z0-9_\\x2d]{0,79}(\\.service)?" maxlength="88" placeholder="my-startup-task" autocomplete="off"></label><label>Description<input name="description" maxlength="255" placeholder="What does this task do?"></label></div><label>Command or script<textarea name="command" required maxlength="16384" rows="3" spellcheck="false" placeholder="/usr/bin/python3 /opt/my-app/worker.py"></textarea></label><p class="hint">Runs through /bin/sh. Use absolute program paths. Output goes to the system journal.</p><div class="form-grid"><label>Run as Linux user<input name="user" value="${esc(user)}" required maxlength="32" autocomplete="off"></label><label>Working directory<input name="directory" value="/" required maxlength="4096" placeholder="/opt/my-app" spellcheck="false"></label><label data-service-restart hidden>Restart delay (seconds)<input name="restart_seconds" type="number" min="1" max="3600" value="5" required></label></div><label class="check"><input type="checkbox" name="network" checked>Wait for network at startup</label><label class="check"><input type="checkbox" name="enable" checked>Enable at boot</label><label class="check"><input type="checkbox" name="start">Start immediately after creation</label><p class="hint">A startup task runs once per boot, not once forever. Existing services are never overwritten. Creation requires MagnetLink 0.4.8 or newer and a Link account allowed to manage system services.</p><details id="service-preview-details"><summary>Generated service file</summary><pre class="job-output" id="service-create-preview">Use Preview unit to see the exact configuration.</pre></details></fieldset><p class="error" role="alert"></p><div class="form-actions">${button('Cancel','close-modal')}${button('Preview unit','service-preview')}<button type="submit" class="primary">Create service</button></div></form>`,'service-creator');
}
function serviceCreateArgs(form){const data=Object.fromEntries(new FormData(form));for(const name of ['network','enable','start'])data[name]=String(Boolean(form.elements[name].checked));return data;}
async function previewNewService(button){
 const form=button.closest('form');if(!form.reportValidity())return;const args=serviceCreateArgs(form),node=form.dataset.node,version=modalVersion;
 if(node!==state.node)throw Error('Server changed');setButtonBusy(button,true);
 try{const preview=await managedJSON('service.preview',args);if(node!==state.node||version!==modalVersion||!form.isConnected||JSON.stringify(serviceCreateArgs(form))!==JSON.stringify(args))return;$('#service-create-preview').textContent=preview.content;$('#service-preview-details').open=true;}
 catch(error){if(form.isConnected)form.querySelector('.error').textContent=error.message;}
 finally{setButtonBusy(button,false);}
}
document.addEventListener('change',event=>{
 if(!event.target.matches('#service-create-form [name=template]'))return;
 const form=event.target.form,template=event.target.value;form.elements.enable.checked=template!=='manual';form.querySelector('[data-service-restart]').hidden=!['always','on-failure'].includes(template);
});
document.addEventListener('input',event=>{if(event.target.closest('#service-create-form .startup-form-fields')){const preview=$('#service-create-preview');if(preview)preview.textContent=magnetI18n.text('Configuration changed. Preview again to refresh.');}});

const cronAliases=new Set(['@reboot','@yearly','@annually','@monthly','@weekly','@daily','@midnight','@hourly']);
function validCronField(field,index){
 const bounds=[[0,59],[0,23],[1,31],[1,12],[0,7]][index],names=index===3?['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']:index===4?['SUN','MON','TUE','WED','THU','FRI','SAT']:[];
 const number=value=>{if(/^\d+$/.test(value))return Number(value);const position=names.indexOf(value.toUpperCase());return position<0?NaN:position+(index===3?1:0);};
 return field.split(',').every(part=>{
  const pieces=part.split('/');if(pieces.length>2||pieces.length===2&&(!/^\d+$/.test(pieces[1])||Number(pieces[1])<1||Number(pieces[1])>bounds[1]-bounds[0]+1))return false;
  if(pieces[0]==='*')return true;
  const range=pieces[0].split('-');if(range.length>2||pieces.length===2&&range.length!==2)return false;
  const values=range.map(number);return values.every(value=>Number.isInteger(value)&&value>=bounds[0]&&value<=bounds[1])&&(values.length===1||values[0]<=values[1]);
 });
}
function validCronSchedule(schedule){if(cronAliases.has(schedule))return true;const fields=schedule.trim().split(/\s+/);return fields.length===5&&fields.every(validCronField);}
function cronDocument(content=screenData.cronContent){
 const lines=content.split('\n'),tasks=[];let unrecognized=0;
 for(let index=0;index<lines.length;index++){
  const original=lines[index],paused=/^\s*# Magnet paused: /.test(original),line=paused?original.replace(/^\s*# Magnet paused: /,''):original.trim();
  if(!line||line.startsWith('#')||/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))continue;
  const match=line.match(/^(@\S+|\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
  if(!match||!validCronSchedule(match[1])){unrecognized++;continue;}
  const named=index>0&&lines[index-1].startsWith('# Magnet task: ');
  tasks.push({index,schedule:match[1].replace(/\s+/g,' '),command:match[2],paused,name:named?lines[index-1].slice(15):'',named,original});
 }
 return {lines,tasks,unrecognized};
}
function cronScheduleLabel(schedule){
 const aliases={'@reboot':'At server startup','@yearly':'Once a year','@annually':'Once a year','@monthly':'Monthly','@weekly':'Weekly','@daily':'Daily','@midnight':'Daily','@hourly':'Hourly'};
 if(aliases[schedule])return magnetI18n.text(aliases[schedule]);
 const [minute,hour,day,month,weekday]=schedule.split(' '),time=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
 if(schedule==='* * * * *')return magnetI18n.text('Every minute');
 if(/^\*\/[0-9]+ \* \* \* \*$/.test(schedule))return magnetI18n.text('Every N minutes').replace('N',minute.slice(2));
 if(/^\d+ \* \* \* \*$/.test(schedule))return magnetI18n.text('Hourly')+' · '+magnetI18n.text('Minute')+' '+minute;
 if(/^\d+ \d+ \* \* \*$/.test(schedule))return magnetI18n.text('Daily')+' · '+time;
 if(/^\d+ \d+ \* \* [0-7]$/.test(schedule))return magnetI18n.text(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(weekday)%7])+' · '+time;
 if(/^\d+ \d+ \* \* 1-5$/.test(schedule))return magnetI18n.text('Weekdays')+' · '+time;
 if(/^\d+ \d+ \d+ \* \*$/.test(schedule))return magnetI18n.text('Monthly')+' · '+magnetI18n.text('Day')+' '+day+' · '+time;
 return schedule;
}
function cronTasksHTML(){
 if(!screenData.cronLoaded)return '<div class="section-body"><p class="hint">Load scheduled tasks to manage them. Guided cron management requires MagnetLink 0.4.8 or newer.</p></div>';
 const parsed=cronDocument();
 return `<div class="section-body cron-context"><p><span>Run as Linux user</span>: <strong data-i18n-skip>${esc(screenData.cronUser)}</strong> · <span>Server timezone</span>: <span data-i18n-skip>${esc(screenData.cronTimezone)}</span></p><p class="hint">Schedules use the server timezone. Existing environment settings and comments are preserved. Cron must be installed and running.</p>${parsed.unrecognized?'<p class="notice">Some entries use unsupported syntax. They are preserved unchanged and remain available in the advanced editor.</p>':''}</div>${parsed.tasks.length?`<div class="table-scroll"><table class="cron-tasks-table"><thead><tr><th>Task</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody>${parsed.tasks.map(task=>`<tr><td><strong data-i18n-skip>${esc(task.name||task.command)}</strong>${task.name?`<small data-i18n-skip>${esc(task.command)}</small>`:''}</td><td><span data-i18n-skip>${esc(cronScheduleLabel(task.schedule))}</span><small data-i18n-skip>${esc(task.schedule)}</small></td><td>${badge(task.paused?'neutral':'online',task.paused?'Paused':'Enabled')}</td><td><div class="inline-controls">${button('Edit','cron-edit','',`data-line="${task.index}"`)}${button(task.paused?'Resume':'Pause','cron-toggle','',`data-line="${task.index}"`)}${button('Delete','cron-delete','danger',`data-line="${task.index}"`)}</div></td></tr>`).join('')}</tbody></table></div>`:'<div class="section-body"><p class="hint">No scheduled tasks yet. Create a task using a schedule preset.</p></div>'}`;
}
function cronManagerHTML(){return `<section class="panel editor-panel" id="cron-manager"><div class="toolbar"><h3>Scheduled tasks</h3><div class="toolbar-actions">${button('Reload','cron-reload')}${button('Create cron task','cron-create','primary',screenData.cronLoaded?'':'disabled')}</div></div><div id="cron-status">${screenStatus('cron')}</div><div id="cron-tasks">${cronTasksHTML()}</div><div class="section-body"><details class="cron-advanced"><summary>Advanced crontab editor</summary><p class="hint">Saving replaces the Link user’s crontab and keeps a backup. Save or discard advanced changes before using task actions.</p><textarea id="cron-content" ${screenData.cronLoaded?'':'disabled'} spellcheck="false" aria-label="Crontab editor" placeholder="# minute hour day month weekday command">${esc(screenData.cronContent)}</textarea><div class="form-actions">${button('Save crontab','cron-save','primary',screenData.cronLoaded?'':'disabled')}</div></details></div></section>`;}
function paintCronTasks(){const target=$('#cron-tasks');if(target)target.innerHTML=cronTasksHTML();const create=$('[data-action="cron-create"]'),save=$('[data-action="cron-save"]'),editor=$('#cron-content'),disabled=!screenData.cronLoaded||screenData.loading.has('cron');if(create)create.disabled=disabled;if(save)save.disabled=disabled;if(editor)editor.disabled=!screenData.cronLoaded;}
function requireCleanCron(){if(!screenData.cronLoaded)throw Error('Load scheduled tasks first');if(screenData.cronDirty)throw Error('Save advanced crontab changes or reload before using task actions');}
async function reloadCronTasks(){
 const node=state.node;
 const reload=async()=>{if(state.node!==node)return;screenData.cronDirty=false;screenData.cronLoaded=false;await loadCron();};
 if(screenData.cronDirty)confirmAction('Discard unsaved crontab changes?','Reload the crontab from the server.',reload);else await reload();
}
function cronPreset(task){
 if(!task)return 'daily';if(task.schedule==='@reboot')return 'startup';
 if(/^\*\/[0-9]+ \* \* \* \*$/.test(task.schedule)||task.schedule==='* * * * *')return 'minutes';
 if(/^\d+ \* \* \* \*$/.test(task.schedule))return 'hourly';
 if(/^\d+ \d+ \* \* \*$/.test(task.schedule))return 'daily';
 if(/^\d+ \d+ \* \* [0-7]$/.test(task.schedule))return 'weekly';
 if(/^\d+ \d+ \* \* 1-5$/.test(task.schedule))return 'weekdays';
 if(/^\d+ \d+ \d+ \* \*$/.test(task.schedule))return 'monthly';
 return 'custom';
}
function openCronTask(index=-1){
 requireCleanCron();const task=cronDocument().tasks.find(task=>task.index===index);if(index!==-1&&!task)throw Error('Task changed; reload the task list');
 const preset=cronPreset(task),fields=task?.schedule.split(' ')||['0','3','1','*','1'],minute=/^\d+$/.test(fields[0])?Number(fields[0]):0,hour=/^\d+$/.test(fields[1])?Number(fields[1]):3;
 modal(task?'Edit cron task':'Create cron task',`<form id="cron-task-form" data-node="${esc(state.node)}" data-line="${index}" data-revision="${esc(screenData.cronRevision)}"><fieldset class="startup-form-fields"><label>Task name (optional)<input name="name" maxlength="120" value="${esc(task?.name||'')}" placeholder="Nightly backup"></label><label>Command<input name="command" required maxlength="8192" value="${esc(task?.command||'')}" placeholder="/usr/local/bin/backup.sh" spellcheck="false"></label><p class="hint">Runs as the Link user. Use absolute paths. Escape literal percent signs as \\% (cron otherwise treats them as input separators).</p><label>Schedule<select name="preset">${[['minutes','Every few minutes'],['hourly','Hourly'],['daily','Daily'],['weekdays','Weekdays'],['weekly','Weekly'],['monthly','Monthly'],['startup','At server startup'],['custom','Custom cron expression']].map(([value,label])=>`<option value="${value}" ${preset===value?'selected':''}>${label}</option>`).join('')}</select></label><div class="form-grid"><label data-cron-field="minutes">Every N minutes<input name="interval" type="number" min="1" max="59" value="${preset==='minutes'?Number(fields[0].slice(2))||1:5}"></label><label data-cron-field="hourly">Minute of the hour<input name="minute" type="number" min="0" max="59" value="${minute}"></label><label data-cron-field="daily weekdays weekly monthly">Time<input name="time" type="time" value="${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}"></label><label data-cron-field="weekly">Day of week<select name="weekday">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name,i)=>`<option value="${i}" ${Number(fields[4])%7===i?'selected':''}>${name}</option>`).join('')}</select></label><label data-cron-field="monthly">Day of month<input name="day" type="number" min="1" max="31" value="${/^\d+$/.test(fields[2])?fields[2]:1}"></label></div><label data-cron-field="custom">Cron expression<input name="expression" value="${esc(task?.schedule||'0 3 * * *')}" spellcheck="false"><small>Minute · Hour · Day of month · Month · Day of week, or an @alias</small></label><p class="notice" data-cron-monthly hidden>Days 29–31 do not run in months that lack that day.</p><p class="hint" data-cron-custom hidden>When both day of month and day of week are restricted, cron runs when either matches. Clock changes can skip or repeat local times.</p><p class="cron-schedule-preview" role="status" data-cron-preview></p><p class="hint"><span>Server timezone</span>: <span data-i18n-skip>${esc(screenData.cronTimezone)}</span></p><label class="check"><input type="checkbox" name="enabled" ${task?.paused?'':'checked'}>Enabled</label></fieldset><p class="error" role="alert"></p><div class="form-actions">${button('Cancel','close-modal')}<button type="submit" class="primary">Save task</button></div></form>`,'cron-task-editor');
 updateCronSchedule($('#cron-task-form'));
}
function cronFormSchedule(form){
 const data=Object.fromEntries(new FormData(form)),[hour,minute]=(data.time||'').split(':').map(Number);
 switch(data.preset){
  case 'minutes':return Number(data.interval)===1?'* * * * *':`*/${Number(data.interval)} * * * *`;
  case 'hourly':return `${Number(data.minute)} * * * *`;
  case 'daily':return `${minute} ${hour} * * *`;
  case 'weekdays':return `${minute} ${hour} * * 1-5`;
  case 'weekly':return `${minute} ${hour} * * ${data.weekday}`;
  case 'monthly':return `${minute} ${hour} ${Number(data.day)} * *`;
  case 'startup':return '@reboot';
  default:return (data.expression||'').trim().replace(/\s+/g,' ');
 }
}
function updateCronSchedule(form){
 const preset=form.elements.preset.value;
 for(const label of form.querySelectorAll('[data-cron-field]')){const active=label.dataset.cronField.split(' ').includes(preset);label.hidden=!active;for(const input of label.querySelectorAll('input,select')){input.disabled=!active;input.required=active;}}
 form.querySelector('[data-cron-monthly]').hidden=preset!=='monthly';form.querySelector('[data-cron-custom]').hidden=preset!=='custom';
 const schedule=cronFormSchedule(form),preview=form.querySelector('[data-cron-preview]');preview.textContent=validCronSchedule(schedule)?cronScheduleLabel(schedule)+' · '+schedule:magnetI18n.text('Enter a valid schedule');
}
document.addEventListener('input',event=>{const form=event.target.closest('#cron-task-form');if(form)updateCronSchedule(form);});
document.addEventListener('change',event=>{const form=event.target.closest('#cron-task-form');if(form)updateCronSchedule(form);});
async function persistCrontab(content,revision,node){
 if(node!==state.node)throw Error('Server changed');
 const result=JSON.parse(await managedJob('cron.replace',{content,revision},node));
 if(state.node===node){screenData.cronContent=result.content;screenData.cronRevision=result.revision;screenData.cronLoaded=true;screenData.cronDirty=false;const editor=$('#cron-content');if(editor)editor.value=result.content;paintCronTasks();}
}
function changeCronTask(index,operation){
 requireCleanCron();const document=cronDocument(),task=document.tasks.find(task=>task.index===index);if(!task)throw Error('Task changed; reload the task list');
 const revision=screenData.cronRevision,node=state.node;
 confirmAction(operation==='delete'?'Delete scheduled task?':task.paused?'Resume scheduled task?':'Pause scheduled task?',task.name||task.command,async()=>{
  if(operation==='delete')document.lines.splice(task.named?index-1:index,task.named?2:1);else document.lines[index]=task.paused?task.original.replace(/^\s*# Magnet paused: /,''):'# Magnet paused: '+task.original;
  await persistCrontab(document.lines.join('\n'),revision,node);toast('Scheduled tasks saved');
 });
}
function saveAdvancedCrontab(){
 if(!screenData.cronLoaded)throw Error('Load scheduled tasks first');const node=state.node,content=$('#cron-content').value,revision=screenData.cronRevision;
 confirmAction('Replace the current crontab?','The current crontab will be backed up before replacement.',async()=>{await persistCrontab(content,revision,node);toast('Crontab saved');});
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['service-create-form','cron-task-form'].includes(form.id))return;event.preventDefault();
 if(form.dataset.saving==='true')return;
 const node=form.dataset.node,version=modalVersion,submit=form.querySelector('[type=submit]'),fieldset=form.querySelector('fieldset'),previewButton=form.querySelector('[data-action="service-preview"]'),current=()=>form.isConnected&&state.node===node&&version===modalVersion&&$('#modal').open;
 if(node!==state.node)return;
 try{
  const data=Object.fromEntries(new FormData(form));let content;
  if(form.id==='cron-task-form'){
   requireCleanCron();if(form.dataset.revision!==screenData.cronRevision)throw Error('Task list changed; reopen this editor');
   const schedule=cronFormSchedule(form);if(!validCronSchedule(schedule))throw Error('Enter a valid schedule');
   if(/[\r\n\x00]/.test(data.command)||!data.command.trim())throw Error('Command must be a single nonempty line');
   if(/[\r\n\x00]/.test(data.name))throw Error('Task name must be a single line');
   let line=schedule+' '+data.command;if(new TextEncoder().encode(line).length>998)throw Error('Cron task line exceeds 998 bytes');if(!data.enabled)line='# Magnet paused: '+line;
   const document=cronDocument(),index=Number(form.dataset.line),task=document.tasks.find(task=>task.index===index),replacement=data.name.trim()?['# Magnet task: '+data.name.trim(),line]:[line];
   if(index===-1){if(document.lines.at(-1)==='')document.lines.pop();document.lines.push(...replacement,'');}else{if(!task)throw Error('Task changed; reload the task list');document.lines.splice(task.named?index-1:index,task.named?2:1,...replacement);}
   content=document.lines.join('\n');
  }
  const serviceArgs=form.id==='service-create-form'?serviceCreateArgs(form):null;
  form.dataset.saving='true';setButtonBusy(submit,true);fieldset.disabled=true;if(previewButton)previewButton.disabled=true;form.querySelector('.error').textContent='';
  if(serviceArgs){const output=await managedJob('service.create',serviceArgs,node);if(current())closeModal();toast(output);if(state.node===node&&state.page==='startup')await loadServices();}
  else{await persistCrontab(content,form.dataset.revision,node);if(current())closeModal();toast('Scheduled tasks saved');}
 }catch(error){if(current())form.querySelector('.error').textContent=error.message;else toast(error.message);}
 finally{delete form.dataset.saving;fieldset.disabled=false;if(previewButton)previewButton.disabled=false;setButtonBusy(submit,false);}
});
