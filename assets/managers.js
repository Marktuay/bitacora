(async()=>{const B=BITACORA,$=id=>document.getElementById(id);await KMAuth.require(true);let cache={items:[],areasByCompany:{}};
 function fillAreas(){const company=$('company').value,areas=cache.areasByCompany?.[company]||[];$('area').replaceChildren(new Option('Seleccione un área',''));for(const a of areas)$('area').add(new Option(a,a));}
 async function load(){
  cache=await B.api('/api/team?action=managers');fillAreas();$('managerList').replaceChildren();
  for(const m of cache.items){
   const p=document.createElement('p'),companies=m.companies.map(c=>B.companies[c].name).join(', '),areas=(m.areas||[]).join(', ')||'Sin área asignada';
   p.textContent=(m.name||'Nombre pendiente')+' · '+m.email+' · '+companies+' · '+areas+' ';
   const edit=document.createElement('button');edit.type='button';edit.className='btn ghost';edit.textContent='Editar nombre';edit.onclick=async()=>{const name=prompt('Nombre completo del jefe para reportes:',m.name||'');if(name===null)return;try{await B.api('/api/team?action=managers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:m.email,company:m.companies[0],area:m.areas[0],name:name.trim()})});await load();}catch(e){B.toast(e.message,'bad');}};p.appendChild(edit);
   const b=document.createElement('button');b.type='button';b.className='btn ghost';b.textContent='Quitar permiso';b.onclick=async()=>{if(!confirm('¿Quitar el permiso de jefe a '+m.email+'? La cuenta conserva su bitácora individual.'))return;try{await B.api('/api/team?action=managers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:m.email,revoke:true})});await load();}catch(e){B.toast(e.message,'bad');}};p.appendChild(b);$('managerList').appendChild(p);
  }
  if(!cache.items.length)$('managerList').textContent='Todavía no hay jefes habilitados.';
 }
 $('company').onchange=fillAreas;
 $('managerForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const r=await B.api('/api/team?action=managers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,company:$('company').value,area:$('area').value,name:$('managerName').value.trim()})});$('result').textContent=`Permiso habilitado para ${r.email}\nEmpresa: ${B.companies[r.company].name}\nÁrea: ${r.area}\nSolo puede registrar, consultar y aprobar recorridos de colaboradores de esta área.`+(r.password?`\nContraseña inicial: ${r.password}\nGuardala y entregala al jefe.`:'\nLa cuenta conserva su contraseña actual.');await load();}catch(error){$('result').textContent=error.message;}finally{b.disabled=false;}};
 await load();})().catch(e=>BITACORA.toast(e.message,'bad'));
