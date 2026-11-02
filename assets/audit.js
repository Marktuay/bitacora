(async()=>{const B=window.BITACORA,T=window.KMComparison,$=id=>document.getElementById(id);let catalog={employees:[],vehicles:[]},items=[],searchId=0,gpsBusy=false,reviewId=null,reviewDraft=null;const savingIds=new Set();const access=await KMAuth.require('manage');const canDelete=access.admin&&String(access.email||'').trim().toLowerCase()==='auditor-general@newcenturyni.com';if(!access.admin)document.querySelector('a[href="/android"]')?.remove();function headers(){return {}}
function period(){const d=new Date();const y=d.getFullYear(),month=d.getMonth(),m=String(month+1).padStart(2,'0');const day=d.getDate();$('from').value=`${y}-${m}-${day<=15?'01':'16'}`;const endDay=day<=15?15:new Date(y,month+1,0).getDate();$('to').value=`${y}-${m}-${String(endDay).padStart(2,'0')}`}
async function loadCatalog(){const company=$('company').value;catalog=await B.api(`/api/catalog?company=${company}`);$('employee').innerHTML='<option value="">Todos</option>'+catalog.employees.map(x=>`<option value="${B.escape(x.id)}">${B.escape(x.name)}</option>`).join('')}
function statusClass(s){return s==='Aprobado'?'approved':s==='Revisar'?'review':'pending'}

function actionHtml(x){
 const id=B.escape(x.id),expanded=reviewId===x.id,approved=x.review_status==='Aprobado',saving=savingIds.has(x.id);
 const buttons='<div class="review-action-buttons">'+
  '<button type="button" class="btn btn-compact" data-review="'+id+'" aria-expanded="'+expanded+'" '+(saving?'disabled':'')+'>'+(expanded?'Ocultar':'Revisar')+'</button>'+
  (approved?'<span class="status approved">Aprobado</span>':'<button type="button" class="btn ok btn-compact" data-approve="'+id+'" '+(saving?'disabled':'')+'>Aprobar</button>')+
 '</div>';
 const links='<div class="review-row-links"><a href="/recorrido.html?company='+encodeURIComponent($('company').value)+'&id='+encodeURIComponent(x.id)+'" target="_blank" rel="noopener">Ver recorrido GPS ↗</a>'+
 '<details class="review-support-details"><summary>Fotos y opciones</summary><div class="review-support-items">'+
 (x.odometer_start_path?'<button type="button" class="btn ghost btn-compact" data-support="'+B.escape(x.odometer_start_path)+'">Odo. inicial</button>':'')+
 (x.odometer_end_path?'<button type="button" class="btn ghost btn-compact" data-support="'+B.escape(x.odometer_end_path)+'">Odo. final</button>':'')+
 (x.support_path?'<button type="button" class="btn ghost btn-compact" data-support="'+B.escape(x.support_path)+'">Soporte</button>':'')+
 (canDelete?'<button type="button" class="btn ghost btn-compact" data-delete="'+id+'">Eliminar</button>':'')+
 '</div></details></div>';
 if(!expanded)return buttons+links;
 const d=reviewDraft||{status:x.review_status||'Pendiente',km:x.km_traccar==null?'':String(x.km_traccar)};
 const options=['Pendiente','Aprobado','Revisar','Rechazado'].map(s=>'<option value="'+s+'" '+(s===d.status?'selected':'')+'>'+s+'</option>').join('');
 const compare='<div class="review-mini-summary">Odómetro: <b>'+T.km(x.km_travel)+'</b> · GPS: <b>'+T.km(x.km_traccar)+'</b> · Diferencia: <b>'+T.signed(T.difference(x))+'</b></div>';
 const editor='<div class="review-inline-editor" role="group" aria-label="Editar revisión del recorrido">'+compare+
 '<label>Decisión<select data-review-status="'+id+'" '+(saving?'disabled':'')+'>'+options+'</select></label>'+
 '<label>KM GPS (opcional)<input type="number" min="0" step="0.01" data-review-km="'+id+'" value="'+B.escape(d.km)+'" '+(saving?'disabled':'')+'></label>'+
 '<div class="review-action-buttons"><button type="button" class="btn primary btn-compact" data-review-save="'+id+'" '+(saving?'disabled':'')+'>'+(saving?'Guardando…':'Guardar revisión')+'</button>'+
 '<button type="button" class="btn btn-compact" data-review-cancel="'+id+'" '+(saving?'disabled':'')+'>Cancelar</button></div></div>';
 return buttons+links+editor;
}


function render(){
 const vehicleMap=new Map(catalog.vehicles.map(x=>[x.id,x]));
 const displayItems=items.map(x=>({...x,plate:x.plate||vehicleMap.get(x.vehicle_id)?.plate||''}));
 const total=T.totals(items);
 $('comparisonHead').innerHTML=T.head();
 $('rows').innerHTML=T.rows(displayItems,actionHtml);
 $('comparisonTotals').innerHTML=T.footer(total);$('comparisonTotals').hidden=!items.length;
 $('totalsNote').textContent=T.note(total);$('totalsNote').hidden=!total.missing;
 $('mCount').textContent=items.length;$('mKm').textContent=T.km(total.km);$('mGps').textContent=T.km(total.gps);
 $('mApproved').textContent=items.filter(x=>x.review_status==='Aprobado').length;$('mReview').textContent=items.filter(x=>x.review_status==='Revisar').length;
 const emp=$('employee').selectedOptions[0]?.textContent||'Todos';$('printMeta').textContent=`${B.companies[$('company').value].name} · ${emp} · ${$('from').value||'—'} al ${$('to').value||'—'}`;
 document.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>review(b.dataset.review));
 document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>quickApprove(b.dataset.approve));
 document.querySelectorAll('[data-review-save]').forEach(b=>b.onclick=()=>saveInline(b.dataset.reviewSave));
 document.querySelectorAll('[data-review-cancel]').forEach(b=>b.onclick=()=>{reviewId=null;reviewDraft=null;render()});
 document.querySelectorAll('[data-review-status]').forEach(el=>el.onchange=()=>{if(reviewId===el.dataset.reviewStatus&&reviewDraft)reviewDraft.status=el.value});
 document.querySelectorAll('[data-review-km]').forEach(el=>el.oninput=()=>{if(reviewId===el.dataset.reviewKm&&reviewDraft)reviewDraft.km=el.value,reviewDraft.kmDirty=true});
 document.querySelectorAll('[data-support]').forEach(b=>b.onclick=()=>openSupport(b.dataset.support));
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteEntry(b.dataset.delete));
}
async function search(retry=true){const current=++searchId;$('gpsComparisonStatus').textContent='';gpsBusy=false;$('printBtn').disabled=false;$('csvBtn').disabled=false;const company=$('company').value;const q=new URLSearchParams({company});if($('employee').value)q.set('employeeId',$('employee').value);if($('from').value)q.set('from',$('from').value);if($('to').value)q.set('to',$('to').value);try{const x=await B.api(`/api/entries?${q}`,{headers:headers()});if(current!==searchId)return;items=x.items||[];render();await KMGpsComparison.complete({company,items,isCurrent:()=>current===searchId,onUpdate:render,onStatus:(message,busy)=>{gpsBusy=busy;$('gpsComparisonStatus').textContent=message;$('printBtn').disabled=busy;$('csvBtn').disabled=busy;}})}catch(e){if(current===searchId)B.toast(e.message,'bad')}}
function review(id){
 const item=items.find(x=>x.id===id);if(!item||savingIds.has(id))return;
 if(reviewId===id){reviewId=null;reviewDraft=null;}
 else{reviewId=id;reviewDraft={status:item.review_status||'Pendiente',km:item.km_traccar==null?'':String(item.km_traccar),kmDirty:false};}
 render();
}
async function quickApprove(id){
 const item=items.find(x=>x.id===id);if(!item||item.review_status==='Aprobado'||savingIds.has(id))return;
 const comparison='Odómetro: '+T.km(item.km_travel)+' km · GPS: '+T.km(item.km_traccar)+' km · Diferencia: '+T.signed(T.difference(item))+' km';
 if(!confirm('¿Aprobar este recorrido?\n\n'+(item.employee_name||'')+' · '+item.date+'\n'+comparison))return;
 await persistReview(id,'Aprobado');
}
async function saveInline(id){
 if(reviewId!==id||!reviewDraft)return;
 await persistReview(id,reviewDraft.status,reviewDraft.kmDirty?reviewDraft.km:undefined);
}
async function persistReview(id,status,kmInput){
 const item=items.find(x=>x.id===id);if(!item||savingIds.has(id))return;
 const payload={id,reviewStatus:status};
 if(kmInput!==undefined&&kmInput!==''){
  const km=Number(kmInput);
  if(!Number.isFinite(km)||km<0){B.toast('Ingrese un valor de KM GPS válido','bad');return;}
  if(item.km_traccar==null||km!==Number(item.km_traccar))payload.kmTraccar=km;
 }
 savingIds.add(id);render();
 try{
  await B.api('/api/entries?company='+encodeURIComponent($('company').value),{method:'PATCH',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify(payload)});
  if(reviewId===id){reviewId=null;reviewDraft=null;}
  B.toast(status==='Aprobado'?'Recorrido aprobado':'Revisión guardada');
  await search(false);
 }catch(e){B.toast(e.message,'bad')}
 finally{savingIds.delete(id);render();}
}

async function openSupport(path){try{const x=await B.api(`/api/support?path=${encodeURIComponent(path)}`,{headers:headers()});window.open(x.url,'_blank','noopener')}catch(e){B.toast(e.message,'bad')}}
async function deleteEntry(id){
 const item=items.find(x=>x.id===id);if(!item)return;
 const label=`${item.employee_name||item.employee_id} · ${item.date} · ${item.origin} → ${item.destination}`;
 if(!confirm(`¿Eliminar definitivamente este recorrido?\n\n${label}\n\nEsta acción no se puede deshacer.`))return;
 try{
  await B.api(`/api/entries?company=${$('company').value}`,{method:'DELETE',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify({id})});
  B.toast('Registro eliminado');await search(false);
 }catch(e){B.toast(e.message,'bad')}
}
function csv(){if(!items.length||gpsBusy)return;const vehicles=new Map(catalog.vehicles.map(x=>[x.id,x]));const text=T.csv(items.map(x=>({...x,plate:x.plate||vehicles.get(x.vehicle_id)?.plate||''})));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=`bitacora-${$('company').value}-${$('from').value}-${$('to').value}.csv`;a.click();URL.revokeObjectURL(a.href)}
$('company').onchange=async()=>{reviewId=null;reviewDraft=null;await loadCatalog();await search()};['employee','from','to'].forEach(id=>$(id).onchange=()=>{reviewId=null;reviewDraft=null;search()});$('searchBtn').onclick=()=>search();$('printBtn').onclick=()=>window.print();$('csvBtn').onclick=csv;period();loadCatalog().then(search).catch(e=>B.toast(e.message,'bad'));})().catch(e=>window.BITACORA.toast(e.message,'bad'));
