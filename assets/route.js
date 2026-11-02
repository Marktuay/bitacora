(async()=>{
 const access=await KMAuth.require();const q=new URLSearchParams(location.search),B=BITACORA,$=id=>document.getElementById(id),company=q.get('company')||'',id=q.get('id')||'';
 const canReview=(access.managedCompanies||[]).includes(company);if(canReview)$('recalculate').hidden=false;
 const map=L.map('map').setView([12.13,-86.25],12);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors',referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);let routes=L.featureGroup().addTo(map);
 const names={gps_finalizado:'GPS finalizado',gps_registrado:'GPS registrado',sin_gps_suficiente:'Todavía no hay suficientes puntos GPS',recorrido_menor_3_minutos:'Recorrido menor de 3 minutos',gps_incompleto_o_por_revisar:'GPS incompleto o con puntos por revisar'};
 async function load(){try{
  const r=await B.api('/api/traccar?'+new URLSearchParams({action:'route',company,id})),g=r.gps;
  const saved=r.entry.km_traccar==null?null:Number(r.entry.km_traccar),candidate=g.distance_km==null?null:Number(g.distance_km),shown=saved==null?candidate:saved,label=g.incomplete?'GPS parcial':saved==null?'GPS provisional':'GPS guardado';
  $('routeTitle').textContent=`${r.entry.origin} → ${r.entry.destination}`;
  $('metrics').textContent=`${label}: ${shown==null?'Pendiente':shown.toFixed(3)+' km'} · Tiempo: ${g.duration_seconds==null?'—':Math.floor(g.duration_seconds/60)+' min '+Math.floor(g.duration_seconds%60)+' s'} · Odómetro: ${Number(r.entry.km_travel).toFixed(1)} km`;
  const warning=$('coverageWarning');warning.hidden=!(g.incomplete||g.recovered_gap_count);
  warning.textContent=g.incomplete?'GPS incompleto: la distancia mostrada solo suma los tramos con puntos útiles. Las líneas naranjas indican cortes de cobertura y no se suman como kilómetros recorridos.':g.recovered_gap_count?`GPS por revisar: se recuperaron ${g.recovered_gap_count} tramos usando sus puntos intermedios de menor precisión. La distancia conserva esa limitación de calidad.`:'';
  const detail=[];if(g.points_received!=null)detail.push(`${g.point_count||0}/${g.points_received} puntos útiles`);if(g.points_rejected)detail.push(`${g.points_rejected} descartados`);if(g.gaps)detail.push(`${g.gaps} cortes de señal`);if(g.recovery_used)detail.push(`recuperación por precisión degradada · filtro estricto ${Number(g.strict_distance_km||0).toFixed(2)} km`);
  if(g.recovered_gap_count)detail.push(`${g.recovered_gap_count} tramos recuperados con puntos de precisión degradada: ${Number(g.recovered_gap_km).toFixed(3)} km, por revisar`);
  if(g.filtered_distance_km!=null)detail.push(`ruta filtrada ${Number(g.filtered_distance_km).toFixed(3)} km`);
  if(g.summary_distance_km!=null)detail.push(`resumen bruto GPS ${Number(g.summary_distance_km).toFixed(3)} km`);
  const road=g.road_match;
  if(g.road_adjustment_used)detail.push(`GPS validado por calles: ${Number(g.distance_km).toFixed(3)} km · medición antes del ajuste: ${Number(g.measured_distance_km).toFixed(3)} km · OpenStreetMap / OSRM`);
  if(road?.distance_km!=null)detail.push(`estimación por calles${road.partial?' (PARCIAL, no comparable con GPS)':''}: ${Number(road.distance_km).toFixed(3)} km · ${road.matched_points}/${road.points_received} puntos · cobertura ${road.points_received?Math.round(100*road.matched_points/road.points_received):0}% · línea verde · no reemplaza GPS`);
  else if(road)detail.push(road.status==='unavailable'?'Ajuste por calles temporalmente no disponible; se conserva el GPS registrado':'No hay suficientes puntos continuos para estimar la ruta por calles');
  if(g.start_gap_seconds>30)detail.push(`primer punto útil ${Math.round(g.start_gap_seconds)} s después del inicio`);
  if(g.end_gap_seconds>30)detail.push(`faltan puntos en los últimos ${Math.round(g.end_gap_seconds)} s`);
  if(g.max_interval_seconds>30)detail.push(`hasta ${Math.round(g.max_interval_seconds)} s entre puntos útiles`);
  const stale=saved!=null&&candidate!=null&&Math.abs(saved-candidate)>Math.max(.5,Math.abs(candidate)*.03);if(stale)detail.push(`cálculo actual ${candidate.toFixed(3)} km · el valor guardado no cambia hasta recalcular`);
  for(const gap of g.gap_details||[])detail.push(`corte de ${Math.floor(gap.seconds/60)} min ${Math.round(gap.seconds%60)} s · extremos separados ${(gap.straight_distance_m/1000).toFixed(2)} km en línea recta, sin sumar`);
  $('quality').textContent=[g.message||names[g.status]||g.status,detail.join(' · ')].filter(Boolean).join(' · ');
  routes.clearLayers();for(const segment of g.segments||[]){if(segment.length>1)L.polyline(segment.map(p=>[p[1],p[0]]),{color:'#243563',weight:5}).bindTooltip('Puntos GPS registrados').addTo(routes);}for(const segment of road?.segments||[]){if(segment.length>1)L.polyline(segment.map(p=>[p[1],p[0]]),{color:'#07864c',weight:3,dashArray:'5 5'}).bindTooltip('Estimación por calles · OpenStreetMap / OSRM').addTo(routes);}for(const gap of g.gap_details||[]){L.polyline([[gap.start[1],gap.start[0]],[gap.end[1],gap.end[0]]],{color:'#c46b08',weight:3,dashArray:'7 9'}).bindTooltip(`Sin cobertura: ${Math.round(gap.seconds)} s. Separación recta ${(gap.straight_distance_m/1000).toFixed(2)} km; no es una ruta registrada.`).addTo(routes);}if(routes.getLayers().length)map.fitBounds(routes.getBounds(),{padding:[24,24]});
 }catch(e){$('quality').textContent=e.message;}}
 async function recalculate(){
  if(!confirm('¿Recalcular y reemplazar el GPS final guardado con los puntos recibidos actualmente?'))return;
  try{$('recalculate').disabled=true;B.toast('Recalculando GPS final…','warn');const r=await B.api('/api/traccar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company,id,force:true})});B.toast(r.traccar?`GPS final actualizado: ${Number(r.traccar.km).toFixed(3)} km`:'No hay GPS suficiente','warn');await load();}catch(e){B.toast(e.message,'bad')}finally{$('recalculate').disabled=false}
 }
 $('reload').onclick=load;$('recalculate').onclick=recalculate;await load();
})().catch(e=>BITACORA.toast(e.message,'bad'));
