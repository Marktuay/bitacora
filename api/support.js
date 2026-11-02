const crypto = require('node:crypto');
const { dbReady, getCompany, readJson, send, requireAudit, sb, tablePath } = require('./_config');
const { bucket, safePath, detectedType } = require('../lib/evidence');
module.exports = async function handler(req, res) {
  if (!dbReady()) return send(res,503,{error:'Supabase no configurado'});
  if (req.method === 'POST') {
    try {
      const body = await readJson(req), company = getCompany(body.company), kind = body.kind || 'support';
      if (!company || !['support','odometer-start','odometer-end'].includes(kind) || typeof body.base64 !== 'string') return send(res,400,{error:'Archivo o empresa inválidos'});
      const raw = body.base64.includes(',') ? body.base64.split(',').pop() : body.base64;
      if (!raw || raw.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return send(res,400,{error:'Archivo inválido'});
      const bytes = Buffer.from(raw,'base64');
      if (bytes.length > 3 * 1024 * 1024) return send(res,413,{error:'El soporte no debe superar 3 MB'});
      const type = detectedType(bytes);
      if (!type || type !== body.contentType || (kind !== 'support' && !type.startsWith('image/'))) return send(res,400,{error:'Usá una foto JPG, PNG o WebP; PDF solamente para soporte adicional'});
      const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[type];
      let path = `${company.slug}/${kind}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
      if(body.uploadId){
        const d=await require('../lib/mobile-api').device(req.headers['x-device-token']);
        if(!d||d.company!==company.slug||!/^[a-f0-9-]{36}$/.test(body.uploadId))return send(res,401,{error:'Carga móvil no autorizada'});
        path=`${company.slug}/${kind}/mobile/${body.uploadId}-${crypto.createHash('sha256').update(bytes).digest('hex')}.${ext}`;
        try{await sb(`/storage/v1/object/info/${encodeURIComponent(bucket())}/${safePath(path)}`);return send(res,200,{path});}catch(e){if(!/Supabase (400|404):/.test(e.message))throw e;}
      }
      try{await sb(`/storage/v1/object/${encodeURIComponent(bucket())}/${safePath(path)}`,{method:'POST',headers:{'Content-Type':type,'x-upsert':'false'},body:bytes});}
      catch(e){if(!body.uploadId||!/Supabase (400|409):/.test(e.message))throw e;await sb(`/storage/v1/object/info/${encodeURIComponent(bucket())}/${safePath(path)}`);}
      return send(res,201,{path});
    } catch(error) { console.error(error); return send(res,500,{error:'No fue posible cargar el soporte'}); }
  }
  if (req.method === 'GET') {
    const path = new URL(req.url,'http://localhost').searchParams.get('path'),slug=path?.split('/')[0],company=getCompany(slug);
    if (!path || path.includes('..') || !company) return send(res,400,{error:'Ruta inválida'});
    try {
      const A=require('../lib/auth'),M=require('../lib/manager-area'),auth=await A.session(req,res);
      if(!A.canReview(auth,company.slug))return send(res,401,{error:'Permiso de revisión requerido para esta empresa'});
      if(!auth.admin){
        let trip=null;
        for(const field of ['odometer_start_path','odometer_end_path','support_path']){
          const rows=await sb(tablePath(company.trips,new URLSearchParams({select:'area_employee',[field]:`eq.${path}`,limit:'1'})));
          if(rows?.[0]){trip=rows[0];break;}
        }
        if(!trip||!M.allowed(auth,company.slug,trip.area_employee))return send(res,403,{error:'No tenés acceso a soportes de esta área'});
      }
      const data = await sb(`/storage/v1/object/sign/${encodeURIComponent(bucket())}/${safePath(path)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});
      const signed = data.signedURL || data.signedUrl;
      if (!signed) throw new Error('URL de soporte no disponible');
      const base = process.env.SUPABASE_URL.replace(/\/$/,'');
      return send(res,200,{url:signed.startsWith('http') ? signed : `${base}${signed.startsWith('/storage/v1/') ? '' : '/storage/v1'}${signed}`});
    } catch(error) { console.error(error); return send(res,error.status||500,{error:error.status?error.message:'No fue posible abrir el soporte'}); }
  }
  return send(res,405,{error:'Método no permitido'});
};
