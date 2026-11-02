(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KMComparison=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  const title='BITÁCORA DE RECORRIDO POR KILÓMETRO';
  const columns=['Fecha','Colaborador','Vehículo','Área solicita','Desde / Hasta','Hora','Odómetro','KM odómetro','KM GPS','Diferencia','Estado','Observaciones'];
  const number=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
  const km=value=>number(value)==null?'—':Number(value).toFixed(1);
  const difference=row=>number(row.km_traccar)==null||number(row.km_travel)==null?null:Number(row.km_traccar)-Number(row.km_travel);
  const signed=value=>number(value)==null?'—':`${Number(Number(value).toFixed(1))>0?'+':''}${Number(Number(value).toFixed(1)).toFixed(1)}`;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function reportMeta(company,employee,items){
    const list=key=>[...new Set(items.map(x=>x[key]).filter(Boolean))].join(', ')||'—';
    return [
      {label:'Empresa',value:company.name},
      {label:'Colaborador',value:employee.name},
      {label:'Área',value:employee.area||'—'},
      {label:'Placa',value:list('plate')},
      {label:'Tipo de vehículo',value:list('vehicle_type')},
      {label:'Marca',value:list('brand')}
    ];
  }
  function vehicle(row){
    const type=String(row.vehicle_type??'').trim();
    const brand=String(row.brand??'').trim();
    const plate=String(row.plate??'').trim();
    return [type,brand,plate].filter(Boolean).join(' · ')||'—';
  }
  function values(row){const time=row.time_start&&row.time_end?`${String(row.time_start).slice(0,5)}–${String(row.time_end).slice(0,5)}`:'—';return [row.date||'',row.employee_name||row.employee_id||'',vehicle(row),row.area_request||'',`${row.origin||''} → ${row.destination||''}`,time,`${km(row.km_initial)} → ${km(row.km_final)}`,km(row.km_travel),km(row.km_traccar),signed(difference(row)),row.review_status||'Pendiente',String(row.employee_observation??'').trim()||'—'];}
  function totals(items){
    const measured=items.filter(row=>number(row.km_traccar)!=null);
    const comparable=measured.filter(row=>number(row.km_travel)!=null);
    return {count:items.length,km:items.reduce((sum,row)=>sum+Number(row.km_travel||0),0),
      gps:measured.length?measured.reduce((sum,row)=>sum+Number(row.km_traccar),0):null,
      difference:comparable.length?comparable.reduce((sum,row)=>sum+difference(row),0):null,
      measured:measured.length,comparable:comparable.length,missing:items.length-measured.length};
  }
  function note(total){
    if(!total.measured)return total.missing?'Los recorridos de esta consulta todavía no tienen distancia GPS; la diferencia no está disponible.':'';
    const notes=[];
    if(total.missing)notes.push(`GPS: total parcial de ${total.measured} de ${total.count} recorridos.`);
    if(total.comparable<total.measured)notes.push(`Diferencia GPS menos odómetro: disponible para ${total.comparable} de ${total.measured} recorridos con GPS.`);
    else if(total.missing)notes.push('La diferencia compara GPS menos odómetro solo donde ambos valores están disponibles.');
    return notes.join(' ');
  }
  function head(showActions=true){return '<tr>'+columns.map(label=>`<th>${escape(label)}</th>`).join('')+(showActions?'<th class="no-print">Acción</th>':'')+'</tr>';}
  function rows(items,actions,showActions=true){
    if(!items.length)return `<tr><td colspan="${showActions?13:12}" class="empty">Sin registros para el período.</td></tr>`;
    return items.map(row=>'<tr>'+values(row).map((value,index)=>{
      const content=index===10?`<span class="status ${value==='Aprobado'?'approved':value==='Pendiente'?'pending':'review'}">${escape(value)}</span>`:index===7?`<strong>${escape(value)}</strong>`:escape(value);
      return `<td${[0,5,6,7,8,9].includes(index)?' class="nowrap"':''}>${content}</td>`;
    }).join('')+(showActions?`<td class="no-print"><div class="actions">${actions?actions(row):''}</div></td>`:'')+'</tr>').join('');
  }
  function footer(total,showActions=true){return `<tr><th scope="row" colspan="7">Total (${total.count} ${total.count===1?'recorrido':'recorridos'})</th><td id="totalKm">${km(total.km)}</td><td id="totalGps">${km(total.gps)}</td><td id="totalDifference" title="GPS menos odómetro">${signed(total.difference)}</td><td></td><td></td>${showActions?'<td class="no-print"></td>':''}</tr>`;}
  function csv(items){
    const total=totals(items),label=`Total (${total.count} ${total.count===1?'recorrido':'recorridos'})`;
    const lines=[columns,...items.map(values),[label,'','','','','','',km(total.km),km(total.gps),signed(total.difference),'','']];
    if(total.missing)lines.push([note(total),...Array(11).fill('')]);
    return '\uFEFF'+lines.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  }
  return {title,columns,reportMeta,vehicle,number,km,difference,signed,values,totals,note,head,rows,footer,csv};
});
