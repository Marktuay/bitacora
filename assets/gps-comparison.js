(function(root){
  async function complete({company,items,isCurrent=()=>true,onUpdate=()=>{},onStatus=()=>{},delay=ms=>new Promise(resolve=>root.setTimeout(resolve,ms))}){
    const missing=items.filter(row=>(row.km_traccar==null||row.km_traccar==='')&&row.result!=='GPS pendiente de digitación manual');
    if(!missing.length)return;
    let next=0,done=0,remaining=0;
    const status=()=>onStatus(`Comparando GPS automáticamente: ${done} de ${missing.length} recorridos…`,true);
    status();
    async function worker(){
      while(next<missing.length&&isCurrent()){
        const row=missing[next++];
        try{
          let result;
          for(let attempt=0;attempt<8&&isCurrent();attempt++){
            result=await root.BITACORA.api('/api/traccar?action=compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company,id:row.id})});
            if(!isCurrent())return;
            if(!result.pending||attempt===7)break;
            onStatus('El GPS se está sincronizando. La comparación se completará automáticamente…',true);
            const seconds=Math.max(1,Math.min(15,Number(result.retry_after_seconds)||15));
            await delay(seconds*1000);
          }
          if(!isCurrent())return;
          if(result.entry?.km_traccar!=null){Object.assign(row,result.entry);onUpdate();}
          else remaining++;
        }catch{remaining++;}
        done++;if(isCurrent())status();
      }
    }
    await Promise.all([worker(),worker()]);
    if(isCurrent())onStatus(remaining?`${remaining} ${remaining===1?'recorrido sigue':'recorridos siguen'} sin GPS disponible. Se volverá a consultar al filtrar.`:'Comparación GPS actualizada.',false);
  }
  root.KMGpsComparison={complete};
})(window);
