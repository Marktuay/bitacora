(()=>{
const $=id=>document.getElementById(id),pending=new Map();let serial=0,photoStart='',photoEnd='',supportName='',supportDisplayName='',activeId=null,loadedKey=null,draftTimer=null,refreshing=false,busyCount=0,stateCache=null,authCache=null,authCheckedAt=0,correctionOpen=false,serverEditOpen=false;
const initialFields=['areaRequest','managementType','origin','destination','orderReference','kmInitial'];
const finalFields=['kmFinal','result','observation'];
function call(action,body={}){return new Promise((resolve,reject)=>{const id=String(++serial);pending.set(id,{resolve,reject});NativeKM.postMessage(JSON.stringify({id,action,body}));})}
if(window.NativeKM)NativeKM.onmessage=e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(p){pending.delete(r.id);r.ok?p.resolve(r.data):p.reject(Error(r.error));}};
function message(text,error=false){$('message').hidden=false;$('message').className=error?'warn':'good';$('message').textContent=text;}
function clearMessage(){$('message').hidden=true;$('message').textContent='';}
async function busy(form,fn){if(busyCount)return;busyCount++;const buttons=form.querySelectorAll('button');buttons.forEach(x=>x.disabled=true);try{await fn()}catch(e){message(e.message,true)}finally{busyCount--;buttons.forEach(x=>x.disabled=false)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function collect(){const b={photoStart,photoEnd,supportName,supportDisplayName};for(const k of [...initialFields,...finalFields])b[k]=$(k).value;return b;}
async function saveDraft(){clearTimeout(draftTimer);if(loadedKey===null||!window.NativeKM)return;await call('draft',{tripId:activeId||'new',fields:collect()});}
function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraft().catch(e=>message('No se pudo guardar el borrador: '+e.message,true)),400);}
function reportPeriod(){
 return {from:$('reportFrom').value,to:$('reportTo').value};
}
function reportOptions(){
 $('downloadMyReport').textContent='Descargar '+($('reportFormat').value==='pdf'?'PDF':'Excel');
}
function totals(){if(activeId)$('kmFinal').min=$('kmInitial').value||'0';const a=Number($('kmInitial').value),b=Number($('kmFinal').value);$('kmCalc').textContent='Recorrido: '+($('kmInitial').value&&$('kmFinal').value&&Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a).toFixed(1):'—')+' km';}
function supportLabel(){$('supportLabel').textContent=supportName?'Guardado en el teléfono: '+supportDisplayName:'JPG, PNG, WebP o PDF. Máximo 3 MB.';$('removeSupportBtn').hidden=!supportName;}
function localDate(iso){return new Date(iso).toLocaleDateString('es-NI',{timeZone:'America/Managua'});}
function localTime(iso){return new Date(iso).toLocaleTimeString('es-NI',{timeZone:'America/Managua',hour:'2-digit',minute:'2-digit'});}
function companyName(slug){return ({blokon:'BLOKON',conaser:'CONASER',security:'NEW CENTURY SECURITY',newcentury:'NEW CENTURY'})[slug]||slug;}
async function loadAuth(force=false){if(!force&&authCache&&Date.now()-authCheckedAt<60000)return authCache;authCache=await call('auth');authCheckedAt=Date.now();return authCache;}
function currentAllowed(s,a){if(a.admin)return true;return (a.profiles||[]).some(p=>p.company===s.profile.company&&p.id===s.profile.employee.id);}
function vehicleText(v){return [v.type,v.brand,v.plate||'Placa pendiente'].filter(Boolean).join(' · ');}
function showVehicle(s,a){const p=s.profile;$('vehicle').value=p.vehicle.id;$('vehicleAuto').value=vehicleText(p.vehicle);}

function updateSwitchVehicles(){const p=authCache?.profiles?.[Number($('switchProfile').value)],assigned=(p?.vehicles||[]).filter(v=>v.employee_id===p.id),v=assigned.length===1?assigned[0]:null;$('switchVehicle').value=v?.id||'';$('switchVehicleAuto').value=v?vehicleText(v):'';$('switchVehicleAuto').placeholder='Sin vehículo asociado';$('switchVehicleHint').textContent=v?'Vehículo y placa cargados automáticamente.':assigned.length>1?'Administración debe definir un único vehículo habitual para este colaborador.':'Este colaborador necesita una asociación de vehículo en Administración.';}

function openSwitch(){if(!authCache)return;if(stateCache?.active)throw Error('Finalizá el recorrido activo antes de cambiar de colaborador.');if(Number(stateCache?.pendingTrips||0)>0||Number(stateCache?.pendingGps||0)>0)throw Error('Sincronizá las gestiones pendientes antes de cambiar de colaborador.');const profiles=(authCache.profiles||[]).map((p,index)=>({...p,index})).filter(p=>(p.vehicles||[]).filter(v=>v.employee_id===p.id).length===1);if(!profiles.length)throw Error('Esta cuenta no tiene colaboradores disponibles. Solicitá la asignación a Auditoría.');$('switchProfile').innerHTML=profiles.map(p=>`<option value="${p.index}">${esc(companyName(p.company))} · ${esc(p.name)}</option>`).join('');let idx=profiles.findIndex(p=>p.company===stateCache.profile?.company&&p.id===stateCache.profile?.employee?.id);$('switchProfile').value=String(profiles[idx>=0?idx:0].index);updateSwitchVehicles();$('switchCard').hidden=false;$('switchCard').scrollIntoView({behavior:'smooth',block:'start'});}
async function refresh(forceAuth=false){if(!window.NativeKM||refreshing)return;refreshing=true;try{const s=await call('state');stateCache=s;
 $('serverCurrent').textContent=s.serverUrl||'Sin configurar';
 $('serverToggle').hidden=!s.serverUrl;
 $('serverToggle').textContent=serverEditOpen?'Cancelar cambio':'Cambiar servidor';
 $('serverForm').hidden=!!s.serverUrl&&!serverEditOpen;
 $('serverUrlInput').required=!$('serverForm').hidden;
 let auth;try{auth=await loadAuth(forceAuth)}catch(e){authCache=null;authCheckedAt=0;$('authGate').hidden=false;$('sessionCard').hidden=true;$('workspace').hidden=true;$('switchCard').hidden=true;$('passwordCard').hidden=true;$('odometerCard').hidden=true;$('sessionEmail').textContent='—';return;}
 // La direccion del servidor solo se muestra al administrador una vez iniciada la sesion.
 // Si no hay servidor o no se puede iniciar sesion, se conserva la recuperacion manual.
 $('serverCard').hidden=true; // El servidor HTTPS corporativo se configura automaticamente.
 serverEditOpen=auth.admin&&serverEditOpen;
 const canManage=auth.admin||(auth.managedCompanies||[]).length>0;
 $('sessionCard').hidden=false;$('sessionEmail').textContent=auth.email||'Sesión activa';$('sessionRole').textContent=auth.admin?'Administrador':canManage?'Jefe de empresa':'Colaborador';
 $('auditBtn').hidden=!canManage;$('managerReportsBtn').hidden=!canManage;$('managerReportsBtn').textContent=auth.admin?'Bitácoras':'Bitácoras de mi empresa';
 const available=(auth.profiles||[]).filter(p=>(p.vehicles||[]).filter(v=>v.employee_id===p.id).length===1);
 $('changeUserBtn').hidden=available.length===0; // Permitir reconectar incluso si solo tiene un colaborador.
 if(auth.passwordChangeRequired){$('authGate').hidden=true;$('workspace').hidden=true;$('switchCard').hidden=true;$('passwordCard').hidden=false;$('cancelPasswordBtn').hidden=true;$('mobilePasswordTitle').textContent='Establecé tu propia contraseña';$('mobilePasswordHint').textContent='Antes de continuar, reemplazá tu contraseña inicial por una elegida por vos. Tus gestiones y fotos se conservan.';return;}
 $('cancelPasswordBtn').hidden=false;
 if(!s.configured){$('authGate').hidden=true;$('workspace').hidden=true;if(available.length&&!auth.admin&&$('switchCard').hidden)openSwitch();else if(!available.length&&!canManage)message('Tu cuenta todavía no tiene un colaborador y vehículo asignados.',true);return;}
 if(!currentAllowed(s,auth)){$('authGate').hidden=true;$('workspace').hidden=true;if(!canManage)message('Esta cuenta no corresponde al colaborador asignado al teléfono. Solicitá revisar la asignación.',true);return;}

 for(const id of ['startSection','activeSection'])$(id).hidden=false;
 $('authGate').hidden=true;$('workspace').hidden=false;$('sessionEmail').textContent=auth.email||'Sesión activa';
 const p=s.profile;$('company').value=companyName(p.company);$('employee').value=p.employee.name;$('employeeArea').value=p.employee.area||'—';showVehicle(s,auth);$('vehicleType').value=p.vehicle.type||'—';$('brand').value=p.vehicle.brand||'—';
 if(!$('areaRequest').options.length)$('areaRequest').innerHTML='<option value="">Seleccione</option>'+p.areas.map(a=>`<option>${esc(a)}</option>`).join('');
 const a=s.active,key=a?a.id:'new';activeId=a?a.id:null;
 if(loadedKey!==key){const fields={...(a?a.fields:{}),...(s.draft||{})};for(const k of [...initialFields,...finalFields])$(k).value=fields[k]||'';photoStart=fields.photoStart||'';photoEnd=fields.photoEnd||'';supportName=fields.supportName||'';supportDisplayName=fields.supportDisplayName||'';$('photoStartPreview').hidden=true;$('photoEndPreview').hidden=true;loadedKey=key;supportLabel();totals();}
 $('initialPhotoState').textContent=photoStart?'Foto inicial guardada en el teléfono.':'La foto inicial es obligatoria.';$('finalPhotoState').textContent=photoEnd?'Foto final guardada en el teléfono.':'La foto final es obligatoria.';
 $('date').value=a?localDate(a.startedAt):'';$('timeStart').value=a?localTime(a.startedAt):'';$('timeEnd').value=a&&a.endedAt?localTime(a.endedAt):'';
 const allowed=currentAllowed(s,auth);$('startFields').disabled=!!a||!allowed;$('stopGps').hidden=!a||a.phase!=='recording';$('stopGps').disabled=!allowed;$('finishFields').disabled=!a||!allowed;$('myReportBtn').disabled=!allowed;$('myReportFields').disabled=!allowed;
 $('startButton').textContent=a?'Inicio guardado':'Iniciar recorrido';
 $('activeRoute').textContent=a?a.fields.origin+' → '+a.fields.destination:'Estos campos se completan al terminar el recorrido.';
 const recording=a?.phase==='recording',enabled=s.locationEnabled===true,permitted=s.locationPermission===true,stale=s.gpsAgeSeconds==null||s.gpsAgeSeconds>30,imprecise=s.gpsAccuracy==null||s.gpsAccuracy>50;
 const healthy=enabled&&permitted&&s.tracking&&!stale&&!imprecise;
 $('appVersion').textContent='Versión '+(s.appVersion||'1.4.4');
 $('gpsStartStatus').className=enabled&&permitted?'muted':'warn';
 $('gpsStartStatus').textContent=!enabled?'La ubicación del teléfono está apagada. Activala antes de iniciar.':!permitted?'Falta permitir ubicación precisa y todo el tiempo. Al iniciar se solicitarán los permisos.':'Ubicación habilitada. Al iniciar, esperá la confirmación de GPS activo antes de moverte.';
 $('gpsStartStatus').hidden=!!a;
 const batteryRestricted=s.batteryOptimizationRestricted===true;
 $('batteryGpsWarning').hidden=!batteryRestricted;
 $('batteryGpsSettings').hidden=!batteryRestricted;
 $('gpsSettings').hidden=!!a||(enabled&&permitted);
 $('gpsSettings').textContent=enabled?'Revisar permisos de ubicación':'Activar ubicación';
 $('activeGpsSettings').hidden=!recording||(enabled&&permitted);
 $('activeGpsSettings').textContent=enabled?'Revisar permisos de ubicación':'Activar ubicación';
 $('gpsStatus').textContent=!a?(!enabled?'GPS APAGADO · SIN INICIAR':'PENDIENTE DE INICIAR'):!recording?'GPS DETENIDO · COMPLETAR CIERRE':!enabled?'GPS APAGADO · GESTIÓN ABIERTA':!permitted?'SIN PERMISO DE UBICACIÓN':!s.tracking?'GPS DETENIDO · GESTIÓN ABIERTA':stale?'SIN SEÑAL GPS RECIENTE':imprecise?'GPS CON POCA PRECISIÓN':'GPS ACTIVO · RECORRIDO EN CURSO';
 $('gpsStatus').className=recording&&!healthy?'tag warn':'tag';
 $('gpsQuality').textContent=recording?(s.gpsAgeSeconds==null?'Esperando señal GPS…':`Precisión del último punto: ${s.gpsAccuracy==null?'sin dato':Math.round(s.gpsAccuracy)+' m'} · Recibido hace ${s.gpsAgeSeconds} s`):a?.gpsEndFix===false?'El cierre no tuvo señal GPS precisa; revisá la cobertura del recorrido.':'';
 $('trackingWarning').hidden=!recording||healthy;
 $('trackingWarning').textContent=!enabled?'La ubicación del teléfono está apagada y no se está capturando el recorrido. Detenete en un lugar seguro para activarla.':!permitted?'Falta el permiso de ubicación precisa y todo el tiempo. Revisá los permisos para continuar capturando el recorrido.':!s.tracking?'El GPS no está registrando. Revisá la ubicación antes de continuar.':stale?'No se están recibiendo puntos GPS recientes. Revisá la ubicación y el ahorro de batería.':'La señal GPS tiene poca precisión. Mantené el teléfono en un lugar con mejor señal.';
 $('correctActiveOdometer').hidden=!a||!['recording','stopped'].includes(a.phase);
 if(a)$('kmFinal').min=$('kmInitial').value||a.fields.kmInitial;

 $('pendingTrips').textContent=s.pendingTrips;$('pendingGps').textContent=s.pendingGps;
 const deviceUnauthorized=/Dispositivo no autorizado/i.test(s.lastSyncError||'');
 $('reconnectDevice').hidden=!(s.configured&&deviceUnauthorized);
 $('reconnectHint').hidden=!(s.configured&&deviceUnauthorized);
 $('syncHint').textContent=s.lastSyncError||(!p.gpsReady?'Recepción GPS pendiente de configurar. Las ubicaciones se conservan en el teléfono.':'Los recorridos y GPS se envían automáticamente al servidor.');
 const labels={recording:'En curso',stopping:'Deteniendo GPS',stopped:'Falta cierre con foto',queued:'Guardada · pendiente de envío',gps_pending:'Gestión recibida · GPS terminando',synced:'Gestión recibida por el servidor'};
 $('history').innerHTML=s.trips.length?s.trips.map(t=>`<li><strong>${esc(t.origin)} → ${esc(t.destination)}</strong><br>${esc(localDate(t.startedAt)+' '+localTime(t.startedAt))}<br><span class="muted">${esc(labels[t.phase]||t.phase)} · Odómetro ${esc(t.kmInitial||'—')} → ${esc(t.kmFinal||'pendiente')}</span>${t.lastSyncError?`<p class="warn">${esc(t.lastSyncError)}</p>`:''}${['recording','stopped','queued'].includes(t.phase)?`<details class="muted"><summary>Opciones del recorrido (opcional)</summary><button type="button" data-correct-trip="${esc(t.id)}">Editar lectura del odómetro</button></details>`:''}</li>`).join(''):'<li>No hay gestiones guardadas.</li>';
 if(!allowed){message('La cuenta iniciada no corresponde al colaborador actualmente asignado. Elegí un colaborador autorizado para continuar.',true);try{openSwitch()}catch{}}
 }catch(e){message(e.message,true)}finally{refreshing=false}}

function showPassword(){ $('passwordCard').hidden=false;$('mobilePasswordTitle').textContent='Mi cuenta · contraseña';$('mobilePasswordMessage').textContent='';$('passwordCard').scrollIntoView({behavior:'smooth',block:'start'}); }
$('serverToggle').onclick=()=>{serverEditOpen=!serverEditOpen;$('serverForm').hidden=!serverEditOpen;if(serverEditOpen){$('serverUrlInput').value=stateCache?.serverUrl||'';$('serverUrlInput').focus();}};
$('serverForm').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{await saveDraft();await call('server',{url:$('serverUrlInput').value.trim()});serverEditOpen=false;authCache=null;authCheckedAt=0;loadedKey=null;message('Servidor PostgreSQL conectado. Iniciá sesión si se solicita.');await refresh(true);});};
$('myAccountBtn').onclick=showPassword;
$('cancelPasswordBtn').onclick=()=>{$('passwordCard').hidden=true;$('mobilePasswordForm').reset();};
$('mobileShowPassword').onchange=()=>{for(const id of ['mobileCurrentPassword','mobileNewPassword','mobileConfirmPassword'])$(id).type=$('mobileShowPassword').checked?'text':'password';};
$('mobilePasswordForm').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 $('mobilePasswordMessage').textContent='';
 if($('mobileNewPassword').value!==$('mobileConfirmPassword').value){$('mobilePasswordMessage').textContent='Las contraseñas no coinciden';return;}
 try{await call('password',{currentPassword:$('mobileCurrentPassword').value,password:$('mobileNewPassword').value,confirmation:$('mobileConfirmPassword').value});}
 catch(err){$('mobilePasswordMessage').textContent=err.message;return;}
 e.target.reset();for(const id of ['mobileCurrentPassword','mobileNewPassword','mobileConfirmPassword'])$(id).type='password';
 authCache=null;authCheckedAt=0;$('passwordCard').hidden=true;message('Contraseña personal guardada. Tus gestiones y fotos se conservaron.');await refresh(true);
})};
$('forgotPasswordBtn').onclick=()=>busy(document.body,async()=>{await saveDraft();await call('open',{page:'recovery'});});
async function openOdometer(id){
 await saveDraft();const trip=await call('odometer-details',{id});
 $('odometerTripId').value=id;$('correctKmInitial').value=trip.kmInitial;$('correctKmFinal').value=id===activeId?$('kmFinal').value:trip.kmFinal;
 $('correctKmFinal').required=trip.phase==='queued';$('odometerReason').value='Error de digitación';$('odometerMessage').textContent='';
 for(const [image,key] of [['correctPhotoStart','photoStart'],['correctPhotoEnd','photoEnd']]){$(image).hidden=!trip[key];$(image).src=trip[key]||'';}
 correctionOpen=true;$('odometerCard').hidden=false;$('odometerCard').scrollIntoView({behavior:'smooth',block:'start'});$('correctKmInitial').focus();
}
$('correctActiveOdometer').onclick=()=>busy(document.body,()=>openOdometer(activeId));
$('history').onclick=e=>{const button=e.target.closest('[data-correct-trip]');if(button)busy(document.body,()=>openOdometer(button.dataset.correctTrip));};
$('cancelOdometerBtn').onclick=()=>{correctionOpen=false;$('odometerCard').hidden=true;};
$('odometerForm').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const kmInitial=$('correctKmInitial').value,kmFinal=$('correctKmFinal').value;
 if(kmFinal&&Number(kmFinal)<Number(kmInitial)){$('odometerMessage').textContent='El KM final es menor al inicial. Corregí el valor según las fotos.';$('correctKmInitial').focus();return;}
 try{await call('correct-odometer',{id:$('odometerTripId').value,kmInitial,kmFinal,reason:$('odometerReason').value});}
 catch(err){$('odometerMessage').textContent=err.message;return;}
 correctionOpen=false;$('odometerCard').hidden=true;loadedKey=null;message('Odómetro corregido. Las fotos y el GPS se conservaron.');await refresh();
})};

$('loginBtn').onclick=()=>busy(document.body,async()=>{await call('login')});
$('logoutBtn').onclick=()=>busy(document.body,async()=>{await saveDraft();authCache=null;authCheckedAt=0;await call('logout')});
$('changeUserBtn').onclick=()=>{try{openSwitch()}catch(e){message(e.message,true)}};
$('cancelSwitchBtn').onclick=()=>{$('switchCard').hidden=true;};
$('switchProfile').onchange=updateSwitchVehicles;
$('switchForm').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{if(stateCache?.active)throw Error('Finalizá el recorrido activo antes de cambiar.');if(Number(stateCache?.pendingTrips||0)>0||Number(stateCache?.pendingGps||0)>0)throw Error('Sincronizá las gestiones pendientes antes de cambiar.');const p=authCache?.profiles?.[Number($('switchProfile').value)];if(!p)throw Error('Seleccioná un colaborador');const assigned=(p.vehicles||[]).filter(v=>v.employee_id===p.id);if(assigned.length!==1)throw Error('Este colaborador necesita un vehículo habitual asociado en Administración.');await call('switch',{company:p.company,employeeId:p.id,vehicleId:assigned[0].id});$('switchCard').hidden=true;loadedKey=null;authCache=null;authCheckedAt=0;message('Colaborador actualizado. Los datos anteriores se conservaron.');await refresh(true);})};

for(const kind of ['Start','End'])$('photo'+kind+'Btn').onclick=()=>busy(document.body,async()=>{await saveDraft();const p=await call('photo');if(kind==='Start')photoStart=p.name;else photoEnd=p.name;$('photo'+kind+'Preview').src=p.preview;$('photo'+kind+'Preview').hidden=false;await saveDraft();$('initialPhotoState').textContent=photoStart?'Foto inicial guardada en el teléfono.':'La foto inicial es obligatoria.';$('finalPhotoState').textContent=photoEnd?'Foto final guardada en el teléfono.':'La foto final es obligatoria.';});
$('supportBtn').onclick=()=>busy(document.body,async()=>{await saveDraft();const f=await call('attachment');supportName=f.name;supportDisplayName=f.displayName;supportLabel();await saveDraft();message('Soporte copiado al teléfono. Se enviará junto con la gestión.');});
$('removeSupportBtn').onclick=()=>busy(document.body,async()=>{supportName='';supportDisplayName='';supportLabel();await saveDraft();});
for(const k of [...initialFields,...finalFields]){$(k).addEventListener('input',()=>{totals();scheduleDraft()});$(k).addEventListener('change',scheduleDraft);}
$('startForm').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{if(!photoStart)throw Error('Tomá la foto inicial');clearTimeout(draftTimer);await saveDraft();const ready=await call('state');if(ready.locationEnabled!==true)throw Error('La ubicación del teléfono está apagada. Tocá Activar ubicación y volvé a iniciar. El recorrido no se inició.');message('Buscando una ubicación precisa. Esperá la confirmación de GPS activo antes de moverte.');await call('start',collect());message('GPS activo e inicio guardado. Ya podés comenzar el recorrido.');await refresh()})};
$('kmFinal').addEventListener('invalid',e=>{if(activeId&&$('kmFinal').validity.rangeUnderflow){e.preventDefault();message('El KM final es menor al inicial. Revisá las lecturas digitadas; si el KM inicial es incorrecto, usá el botón de corrección.',true);$('kmFinal').focus();}});
$('finishForm').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{if(!photoEnd)throw Error('Tomá la foto final');const km=Number($('kmFinal').value);if(!$('kmFinal').value||!Number.isFinite(km)||km<Number($('kmInitial').value)){message('Revisá el KM inicial y final: el final debe ser igual o mayor. No se modificó ninguna lectura ni se abrió una corrección.',true);$('kmFinal').focus();return;}await saveDraft();await call('finish',collect());message('Gestión guardada en el teléfono. El envío automático continúa en segundo plano; consultá el estado abajo.');await refresh()})};
$('stopGps').onclick=()=>busy(document.body,async()=>{await saveDraft();await call('stop');message('GPS detenido. Completá el odómetro y la foto final para guardar la gestión.');await refresh();});
$('reconnectDevice').onclick=()=>busy(document.body,async()=>{
 await saveDraft();
 await call('reconnect');
 message('Dispositivo reautorizado. Enviando gestiones y GPS pendientes…');
 const r=await call('sync');
 authCache=null;authCheckedAt=0;
 await refresh(true);
 if(Number(r.pendingTrips||0)===0&&Number(r.pendingGpsFinal||0)===0&&Number(r.pendingGps||0)===0)
  message('Conexión recuperada y todos los registros recibidos por el servidor.');
 else message('Conexión recuperada; quedan datos pendientes que se reintentarán automáticamente.');
});
$('sync').onclick=()=>busy(document.body,async()=>{await saveDraft();message('Sincronizando ahora…');const r=await call('sync');if(Number(r.pendingTrips||0)===0&&Number(r.pendingGpsFinal||0)===0&&Number(r.pendingGps||0)===0)message('Sincronización completada. La gestión ya está en el servidor.');else if(Number(r.pendingTrips||0)===0)message(r.lastSyncError||'La gestión ya llegó; el GPS está terminando de confirmar sus puntos.');else message(r.lastSyncError||'La gestión sigue guardada en el teléfono y se reintentará.',true);await refresh()});
$('myReportBtn').onclick=()=>{
 if(!$('reportFrom').value||!$('reportTo').value){
  const d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Managua'}));
  const month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  const today=month+'-'+String(d.getDate()).padStart(2,'0');
  if(!$('reportFrom').value)$('reportFrom').value=month+'-01';
  if(!$('reportTo').value)$('reportTo').value=today;
 }
 reportOptions();$('myReportForm').hidden=false;$('myReportForm').scrollIntoView({behavior:'smooth',block:'start'});
};
$('closeMyReport').onclick=()=>{$('myReportForm').hidden=true;};
$('viewMyGpsReport').onclick=()=>busy(document.body,async()=>{await saveDraft();await call('open',{page:'gps'});});
['reportFormat','reportFrom','reportTo'].forEach(id=>$(id).addEventListener('change',reportOptions));
$('myReportForm').onsubmit=e=>{e.preventDefault();const shareWhatsApp=e.submitter?.id==='shareMyReport';busy(e.target,async()=>{const {from,to}=reportPeriod();if(!from||!to||from>to)throw Error('Elegí fechas válidas: Desde debe ser anterior o igual a Hasta.');await saveDraft();const r=await call('download',{format:$('reportFormat').value,from,to,shareWhatsApp});message(r.sharingWhatsApp?'Bitácora lista en WhatsApp. Elegí el destinatario y confirmá el envío.':r.whatsAppUnavailable?'WhatsApp no está instalado o no pudo abrirse. Elegí dónde guardar la bitácora.':'Elegí dónde guardar tu bitácora en el teléfono.');})};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>busy(document.body,async()=>{await saveDraft();await call('open',{page:b.dataset.page});}));
document.querySelectorAll('[data-location-settings]').forEach(b=>b.onclick=()=>busy(document.body,async()=>{await saveDraft();await call('location-settings');}));
$('batteryGpsSettings').onclick=()=>busy(document.body,async()=>{await saveDraft();await call('battery-settings');});
window.addEventListener('km-resume',()=>{if(!busyCount)refresh(false)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft().catch(()=>{});});
window.addEventListener('pagehide',()=>{saveDraft().catch(()=>{});});
refresh(true);setInterval(()=>{if(!busyCount)refresh(false)},5000);
})();
