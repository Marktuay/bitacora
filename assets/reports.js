(async()=>{
  const B=window.BITACORA,T=window.KMComparison,$=id=>document.getElementById(id);
  const access=await KMAuth.require();
  if(!access.admin&&!(access.managedCompanies||[]).length){document.querySelector('.brand h1').textContent='Mi bitácora';document.querySelector('.brand p').textContent='Descargá tu bitácora en Excel o PDF por rango de fechas';}
  let catalog={employees:[],vehicles:[]},items=[],searchId=0,gpsBusy=false,signatures=null;
  if(!access.admin&&!(access.managedCompanies||[]).length){$('company').innerHTML=[...new Set(access.profiles.map(p=>p.company))].map(c=>`<option value="${B.escape(c)}">${B.escape(B.companies[c].name)}</option>`).join('');}
  if(!access.admin&&(access.managedCompanies||[]).length){$('company').innerHTML=access.managedCompanies.map(c=>`<option value="${B.escape(c)}">${B.escape(B.companies[c].name)}</option>`).join('');document.querySelector('.brand h1').textContent='Bitácoras de mi empresa';}
  const headers=()=>({});
  const isAllEmployees=()=>access.admin&&!$('employee').value;
  const hasReportTarget=()=>access.admin||Boolean($('employee').value);
  function reportParams(extra={}){
    const {from,to}=resolvePeriod();
    const q=new URLSearchParams({company:$('company').value,from,to,reviewStatus:$('reviewFilter').value,...extra});
    if($('employee').value)q.set('employeeId',$('employee').value);
    return q;
  }

  function fuelQuery(){
    const {from,to}=resolvePeriod();
    return new URLSearchParams({company:$('company').value,employeeId:$('employee').value,from,to});
  }
  function clearFuel(){
    $('fuelAmount').value='';$('fuelType').value='super';$('fuelVoucherNumber').value='';$('fuelVoucherDate').value='';
    $('fuelPrint').hidden=true;$('fuelPrintDetails').innerHTML='';$('fuelResults').hidden=true;
    $('fuelResults').innerHTML='';$('fuelAction').disabled=true;
    $('fuelNotice').textContent='Generá el reporte para consultar la rendición del último vale.';
  }
  function fuelSummary(row){
    if(!row){$('fuelResults').hidden=true;$('fuelResults').innerHTML='';$('fuelPrint').hidden=true;$('fuelPrintDetails').innerHTML='';return;}
    const money=value=>B.money(Number(value||0));
    const km=value=>Number(value||0).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});
    const num=value=>Number(value||0).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});
    const metrics=[
      ['KM inicial del período',km(row.odometer_initial)],
      ['KM final del período',km(row.odometer_final)],
      ['Diferencia de odómetro',km(row.km_since)+' km'],
      ['KM laborales (suma de recorridos)',km(row.km_period)+' km'],
      ['Litros del último vale',num(row.liters)+' L'],
      ['Rendimiento estimado',num(row.km_per_liter)+' km/L'],
      ['Litros para KM laborales',num(Number(row.km_period)/Number(row.km_per_liter))+' L'],
      ['Próximo vale estimado',money(row.next_amount)]
    ];
    $('fuelResults').innerHTML=metrics.map(([label,value],i)=>`<div class="fuel-metric${i===metrics.length-1?' fuel-metric-highlight':''}"><span>${B.escape(label)}</span><strong>${B.escape(value)}</strong></div>`).join('');
    const type={super:'Gasolina súper',regular:'Gasolina regular',diesel:'Diésel'};
    const printMetrics=[
      ['Número de vale',row.voucher_number||'—'],
      ['Fecha del vale',row.voucher_date||'—'],
      ['Combustible',type[row.fuel_type]||'—'],
      ['Monto del vale',money(row.fuel_amount)],
      ['Precio por litro',money(row.fuel_price)],
      ['Litros asignados',num(row.liters)+' L'],
      ...metrics
    ];
    $('fuelPrintDetails').innerHTML=printMetrics.map(([label,value])=>`<div class="fuel-print-cell"><span>${B.escape(label)}</span><strong>${B.escape(value)}</strong></div>`).join('');
    // Si una pestaña conserva una versión anterior del HTML, elimina la nota heredada.
    $('fuelPrint').querySelectorAll('p.hint').forEach(note=>note.remove());
    $('fuelPrint').hidden=false;
    $('fuelResults').hidden=false;
  }
  async function loadFuel(current){
    if(!$('employee').value)return;
    try{
      const r=await B.api('/api/report?fuel=1&'+fuelQuery(),{headers:headers()});
      if(current!==searchId)return;
      if(r.item){
        $('fuelAmount').value=r.item.fuel_amount;
        $('fuelType').value=r.item.fuel_type||'super';
        $('fuelVoucherNumber').value=r.item.voucher_number||'';
        $('fuelVoucherDate').value=r.item.voucher_date||'';
        fuelSummary(r.item);
        $('fuelNotice').textContent='Vale registrado para este período · rendimiento y próximo vale estimados. Podés continuar normalmente con tu bitácora.';
      }else{
        $('fuelNotice').textContent=items.length?'No hay vale registrado para este período. Podés dejarlo vacío.':'Sin recorridos para calcular el vale; el reporte sigue disponible.';
      }
    }catch(e){
      if(current===searchId)$('fuelNotice').textContent='No se pudo consultar el vale. La bitácora y las descargas siguen disponibles.';
    }
  }
  async function saveFuel(){
    if(!$('employee').value||!items.length){B.toast('Primero generá el reporte del período con recorridos','warn');return;}
    const amount=Number($('fuelAmount').value),fuelType=$('fuelType').value;
    const voucherNumber=$('fuelVoucherNumber').value.trim(),voucherDate=$('fuelVoucherDate').value;
    if(!$('fuelAmount').value||!Number.isFinite(amount)||amount<=0){B.toast('Digitá el monto del último vale','warn');return;}
    if(!voucherNumber){B.toast('Digitá el número del vale','warn');return;}
    if(!voucherDate){B.toast('Seleccioná la fecha del vale','warn');return;}
    const current=searchId,button=$('fuelAction');button.disabled=true;button.textContent='Calculando…';
    try{
      const response=await B.api('/api/report?fuel=1&'+fuelQuery(),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({amount,fuelType,voucherNumber,voucherDate})
      });
      if(current!==searchId)return;
      fuelSummary(response.item);
      $('fuelNotice').textContent='Vale registrado. Este cálculo es estimado: no presupone que se consumió todo el combustible.';
      B.toast('Vale y rendimiento estimado guardados');
    }catch(e){
      if(current===searchId){$('fuelNotice').textContent=e.message+' · El registro de recorridos no se afecta.';B.toast(e.message,'bad');}
    }finally{if(current===searchId){button.textContent='Calcular y guardar vale';button.disabled=!items.length;}}
  }


  function setDefaultDates(){
    const d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Managua'}));
    const year=d.getFullYear(),month=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    $('from').value=`${year}-${month}-01`;
    $('to').value=`${year}-${month}-${day}`;
  }
  function resolvePeriod(){
    return {from:$('from').value,to:$('to').value};
  }
  async function loadCatalog(){
    const company=$('company').value;
    catalog=(access.admin||(access.managedCompanies||[]).includes(company))?await B.api(`/api/catalog?company=${company}`):{employees:access.profiles.filter(p=>p.company===company),vehicles:[]};
    $('employee').innerHTML='<option value="">'+(access.admin?'Todos los colaboradores':'Seleccione')+'</option>'+catalog.employees.map(x=>`<option value="${B.escape(x.id)}">${B.escape(x.name)}</option>`).join('');
    if(!access.admin&&catalog.employees.length===1)$('employee').value=catalog.employees[0].id;
    clearReport();if(hasReportTarget())await search();
  }
  function clearReport(){
    searchId++;gpsBusy=false;signatures=null;$('gpsComparisonStatus').textContent='';items=[];clearFuel();document.querySelector('.fuel-vale-card').hidden=isAllEmployees();$('approvalSummary').textContent='';$('rows').innerHTML='<tr><td colspan="12" class="empty">Genere el reporte para consultar los recorridos.</td></tr>';
    $('comparisonHead').innerHTML=T.head(false);$('comparisonTotals').innerHTML=T.footer(T.totals([]),false);$('comparisonTotals').hidden=true;$('totalsNote').hidden=true;$('rCompany').textContent='—';$('rEmployee').textContent='—';$('rArea').textContent='—';$('rPlate').textContent='—';$('rVehicleType').textContent='—';$('rBrand').textContent='—';$('periodLabel').textContent='Seleccione un colaborador y genere el reporte.';$('sigEmployee').textContent='Colaborador';$('sigManager').textContent='Jefe pendiente de identificar';$('xlsxBtn').disabled=true;$('printBtn').disabled=true;$('pdfBtn').disabled=true;
  }
  function render(){
    const emp=catalog.employees.find(x=>x.id===$('employee').value);
    const vehicleIds=[...new Set(items.map(x=>x.vehicle_id).filter(Boolean))];
    const vehicles=vehicleIds.map(id=>catalog.vehicles.find(v=>v.id===id)).filter(Boolean);
    const plates=[...new Set(items.map(x=>x.plate).filter(Boolean))];
    const types=[...new Set(items.map(x=>x.vehicle_type).filter(Boolean))];
    const brands=[...new Set(items.map(x=>x.brand).filter(Boolean))];
    const {from,to}=resolvePeriod();
    $('rCompany').textContent=B.companies[$('company').value].name;
    $('rEmployee').textContent=isAllEmployees()?'Todos los colaboradores':emp?.name||'—';
    $('rArea').textContent=isAllEmployees()?'Todas las áreas':emp?.area||'—';
    $('rPlate').textContent=plates.length?plates.join(', '):(vehicles.map(v=>v.plate).join(', ')||'—');
    $('rVehicleType').textContent=types.length?types.join(', '):(vehicles.map(v=>v.type).join(', ')||'—');
    $('rBrand').textContent=brands.length?brands.join(', '):(vehicles.map(v=>v.brand).join(', ')||'—');
    $('periodLabel').textContent=`Período: ${from||'—'} al ${to||'—'}`;
    $('sigEmployee').textContent=signatures?.elaboratedBy||(isAllEmployees()?'Administración':emp?.name||'Colaborador');
    $('sigManager').textContent=signatures?.reviewedBy||'Jefe pendiente de identificar';
    $('comparisonHead').innerHTML=T.head(false);
    $('rows').innerHTML=T.rows(items,null,false);
    const approved=items.filter(x=>x.review_status==='Aprobado').length;$('approvalSummary').textContent=`Gestiones aprobadas: ${approved} de ${items.length} · Sin aprobar: ${items.length-approved}`;
    const total=T.totals(items);$('comparisonTotals').innerHTML=T.footer(total,false);$('comparisonTotals').hidden=!items.length;$('totalsNote').textContent=T.note(total);$('totalsNote').hidden=!total.missing;
    $('xlsxBtn').disabled=gpsBusy||!items.length;$('printBtn').disabled=gpsBusy||!items.length;$('pdfBtn').disabled=gpsBusy||!items.length;$('fuelAction').disabled=isAllEmployees()||!items.length;
  }
  async function search(retry=true){
    if(!hasReportTarget()){B.toast('Seleccione un colaborador','warn');return}
    const {from,to}=resolvePeriod();
    if(!from||!to||from>to){B.toast('Defina un período válido','warn');return}
    const current=++searchId,company=$('company').value;gpsBusy=false;$('gpsComparisonStatus').textContent='';
    const q=reportParams();
    try{
      const x=await B.api(`/api/report?${q}`,{headers:headers()});if(current!==searchId)return;items=x.items||[];signatures=x.signatures||null;render();if(!isAllEmployees()){await loadFuel(current);await KMGpsComparison.complete({company,items,isCurrent:()=>current===searchId,onUpdate:render,onStatus:(message,busy)=>{gpsBusy=busy;$('gpsComparisonStatus').textContent=message;render();}});}
    }catch(e){
      B.toast(e.message,'bad');
    }
  }
  async function downloadXlsx(retry=true){
    if(!hasReportTarget()||!items.length)return;
    const {from,to}=resolvePeriod();
    const q=reportParams();
    try{
      const r=await fetch(`/api/report-xlsx?${q}`,{headers:headers()});
      if(!r.ok){let msg='No fue posible generar el Excel';try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg)}
      const blob=await r.blob();const cd=r.headers.get('content-disposition')||'';const match=cd.match(/filename="?([^";]+)"?/i);const name=match?.[1]||`bitacora-${$('employee').value||'todos'}-${from}-${to}.xlsx`;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }catch(e){B.toast(e.message,'bad')}
  }

  async function downloadPdf(retry=true){
    if(!hasReportTarget()||!items.length)return;
    const {from,to}=resolvePeriod();
    const q=reportParams({hideFuel:'1'});
    try{
      const r=await fetch(`/api/report-pdf?${q}`,{headers:headers()});
      if(!r.ok){let msg='No fue posible generar el PDF';try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg)}
      const blob=await r.blob();const cd=r.headers.get('content-disposition')||'';const match=cd.match(/filename="?([^";]+)"?/i);const name=match?.[1]||`bitacora-${$('employee').value||'todos'}-${from}-${to}.pdf`;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }catch(e){B.toast(e.message,'bad')}
  }

  window.addEventListener('beforeprint',()=>{$('fuelPrint').querySelectorAll('p.hint').forEach(note=>note.remove());});
  $('fuelAction').addEventListener('click',saveFuel);
  $('company').onchange=()=>loadCatalog().catch(e=>B.toast(e.message,'bad'));['employee','from','to','reviewFilter'].forEach(id=>$(id).addEventListener('change',()=>{clearReport();if(hasReportTarget())search()}));$('searchBtn').onclick=search;$('xlsxBtn').onclick=downloadXlsx;$('pdfBtn').onclick=downloadPdf;$('printBtn').onclick=()=>window.print();
  setDefaultDates();loadCatalog().catch(e=>B.toast(e.message,'bad'));
})().catch(e=>window.BITACORA.toast(e.message,'bad'));
