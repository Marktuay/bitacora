window.BITACORA = {
  companies: {
    newcentury: { name:'NEW CENTURY', short:'NEW CENTURY' },
    blokon: { name:'BLOKON', short:'BLOKON' },
    conaser: { name:'CONASER', short:'CONASER' },
    security: { name:'NEW CENTURY SECURITY', short:'SECURITY' },
  },
  companyFromLocation(){
    const q=new URLSearchParams(location.search).get('company'); if(q&&this.companies[q]) return q;
    const p=location.pathname.toLowerCase(); if(p.includes('newcentury')) return 'newcentury'; if(p.includes('blokon')) return 'blokon'; if(p.includes('conaser')) return 'conaser'; if(p.includes('security')) return 'security'; return null;
  },
  money(n){return new Intl.NumberFormat('es-NI',{style:'currency',currency:'NIO'}).format(Number(n||0));},
  escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));},
  toast(message,type='ok'){
    const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; document.body.appendChild(el); setTimeout(()=>el.classList.add('show'),10); setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250)},3200);
  },
  async api(path, options={}){
    const r=await fetch(path,options); let data={}; try{data=await r.json()}catch{}
    if(!r.ok){const e=new Error(data.error||`Error ${r.status}`); e.status=r.status;if(r.status===401&&['/auditoria','/reportes','/android','/accesos.html','/recorrido.html','/colaboradores.html','/jefes.html'].some(p=>location.pathname.startsWith(p)))location.assign('/login.html?next='+encodeURIComponent(location.pathname+location.search)); e.code=data.code; e.data=data; throw e;} return data;
  }
};
