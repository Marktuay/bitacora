const crypto = require('crypto');
const { verifyEvidence } = require('../lib/evidence');
const { getCompany, dbReady, readJson, send, sb, requireAudit, tablePath, validPeriod, allRows } = require('./_config');

async function lookup(table, id) {
  const p = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await sb(tablePath(table, p));
  return rows?.[0] || null;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const company = getCompany(url.searchParams.get('company'));
  if (!company) return send(res, 400, { error: 'Empresa inválida' });

  if (req.method === 'GET') {
    const A=require('../lib/auth'),M=require('../lib/manager-area');
    let auth;try{auth=await A.session(req,res);}catch(error){return send(res,error.status||401,{error:error.message||'Permiso de revisión requerido'});}
    if (!A.canReview(auth,company.slug)) return send(res, 401, { error: 'Permiso de revisión requerido para esta empresa' });
    if (!dbReady()) return send(res, 200, { items: [], demo: true });
    try {
      const p = new URLSearchParams({ select: '*', order: 'date.desc,time_start.desc', limit: '500' });
      const employeeId = url.searchParams.get('employeeId');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const status = url.searchParams.get('status');
      if (employeeId) p.set('employee_id', `eq.${employeeId}`);
      if (from) p.set('date', `gte.${from}`);
      if (to) p.append('date', `lte.${to}`);
      if (status) p.set('review_status', `eq.${status}`);
      if ((from || to) && !validPeriod(from, to)) return send(res,400,{error:'Período inválido'});
      p.set('order','date.desc,time_start.desc,id.desc');
      const rows = await allRows(company.trips, p);
      const items = auth.admin ? rows : rows.filter(x=>M.allowed(auth,company.slug,x.area_employee));
      return send(res, 200, { items, demo: false });
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: 'No fue posible consultar las bitácoras' });
    }
  }

  if (req.method === 'POST') {
    if (!dbReady()) return send(res, 503, { error: 'La base Supabase aún no está conectada', code: 'DATABASE_NOT_CONFIGURED' });
    try {
      const body = await readJson(req);
      const required = ['date','employeeId','vehicleId','areaRequest','origin','destination','timeStart','timeEnd','kmInitial','kmFinal','odometerStartPath','odometerEndPath'];
      const missing = required.filter(k => body[k] === undefined || body[k] === null || String(body[k]).trim() === '');
      if (missing.length) return send(res, 400, { error: `Faltan campos: ${missing.join(', ')}` });
      const kmInitial = Number(body.kmInitial), kmFinal = Number(body.kmFinal);
      if (!Number.isFinite(kmInitial) || !Number.isFinite(kmFinal) || kmInitial < 0 || kmFinal < kmInitial) {
        return send(res, 400, { error: 'El kilometraje final debe ser igual o mayor al inicial' });
      }
      if (!validPeriod(body.date, body.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.timeStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.timeEnd)) return send(res,400,{error:'Fecha u hora inválida'});
      if (body.timeEnd < body.timeStart && !req.mobileContext) return send(res,400,{error:'Para un recorrido que cruza medianoche, registrá un tramo por fecha'});
      const photos = await Promise.all([
        verifyEvidence(body.odometerStartPath, company.slug, 'odometer-start'),
        verifyEvidence(body.odometerEndPath, company.slug, 'odometer-end')
      ]);
      if (!photos.every(Boolean)) return send(res,400,{error:'Debés cargar ambas fotos del odómetro antes de guardar'});
      if(body.supportPath&&!await verifyEvidence(body.supportPath,company.slug,'support'))return send(res,400,{error:'El soporte adicional no existe o no corresponde a esta empresa'});
      const [employee, vehicle] = await Promise.all([
        lookup(company.employees, body.employeeId), lookup(company.vehicles, body.vehicleId)
      ]);
      if (!employee || employee.active === false) return send(res, 400, { error: 'Colaborador inválido o inactivo' });
      if (!vehicle || vehicle.active === false) return send(res, 400, { error: 'Vehículo inválido o inactivo' });
      // El teléfono ya fue autorizado al inscribirse o cambiar su asignación.
      // Auditoría puede autorizar el uso de otro vehículo sin alterar su asociación habitual.
      if (vehicle.employee_id && vehicle.employee_id !== employee.id && !req.mobileContext && !await requireAudit(req,res)) return send(res, 400, { error: 'El vehículo está asignado a otro colaborador' });
      const kmTravel = Number((kmFinal - kmInitial).toFixed(2));
      const row = {
        id: req.mobileContext?.id || crypto.randomUUID(), date: body.date, employee_id: employee.id, employee_name: employee.name,
        company: company.name, area_employee: employee.area, vehicle_id: vehicle.id, vehicle_type: vehicle.type,
        brand: vehicle.brand, plate: vehicle.plate,
        area_request: body.areaRequest, origin: body.origin, destination: body.destination,
        time_start: body.timeStart, time_end: body.timeEnd, km_initial: kmInitial, km_final: kmFinal,
        km_travel: kmTravel, management_type: body.managementType || null, order_reference: body.orderReference || null,
        result: body.result || null, employee_observation: body.observation || null,
        odometer_start_path: body.odometerStartPath, odometer_end_path: body.odometerEndPath,
        support_path: body.supportPath || null, review_status: 'Pendiente'
      };
      if(req.mobileContext)row.created_at=req.mobileContext.startedAt;
      const inserted = await sb(tablePath(company.trips), {
        method: 'POST', headers: { 'Content-Type':'application/json', Prefer:'return=representation' }, body: JSON.stringify(row)
      });
      return send(res, 201, { item: inserted?.[0] || row });
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: 'No fue posible guardar la gestión' });
    }
  }

  if (req.method === 'DELETE') {
    if (!dbReady()) return send(res, 503, { error: 'Base no configurada' });
    try {
      const A = require('../lib/auth');
      const auth = await A.session(req,res);
      const ownerEmail = 'auditor-general@newcenturyni.com';
      if (!auth.admin || String(auth.user?.email || '').trim().toLowerCase() !== ownerEmail) {
        return send(res, 403, { error: 'Solo el Auditor Corporativo puede eliminar registros' });
      }
      const body = await readJson(req);
      if (!/^[a-f0-9-]{36}$/i.test(body.id || '')) return send(res,400,{error:'ID requerido'});
      const current = await lookup(company.trips, body.id);
      if (!current) return send(res,404,{error:'Gestión no encontrada'});

      await sb(tablePath('km_mobile_trips', new URLSearchParams({ entry_id:`eq.${body.id}`, company:`eq.${company.slug}` })), {
        method:'DELETE', headers:{ Prefer:'return=minimal' }
      });

      const deleted = await sb(tablePath(company.trips, new URLSearchParams({ id:`eq.${body.id}` })), {
        method:'DELETE', headers:{ Prefer:'return=representation' }
      });

      const { bucket, safePath } = require('../lib/evidence');
      for (const path of [current.odometer_start_path,current.odometer_end_path,current.support_path].filter(Boolean)) {
        await sb(`/storage/v1/object/${encodeURIComponent(bucket())}/${safePath(path)}`, { method:'DELETE' }).catch(()=>{});
      }
      return send(res,200,{ok:true,item:deleted?.[0]||current});
    } catch (error) {
      console.error(error);
      return send(res,error.status||500,{error:error.status?error.message:'No fue posible eliminar el registro'});
    }
  }

  if (req.method === 'PATCH') {
    const A=require('../lib/auth'),M=require('../lib/manager-area');
    let auth;try{auth=await A.session(req,res);}catch(error){return send(res,error.status||401,{error:error.message||'Permiso de revisión requerido'});}
    if (!A.canReview(auth,company.slug)) return send(res, 401, { error: 'Permiso de revisión requerido para esta empresa' });
    if (!dbReady()) return send(res, 503, { error: 'Base no configurada' });
    try {
      const body = await readJson(req);
      if (!body.id) return send(res, 400, { error: 'ID requerido' });
      const patch = {};
      const current = await lookup(company.trips, body.id);
      if (!current) return send(res,404,{error:'Gestión no encontrada'});
      if (!auth.admin&&!M.allowed(auth,company.slug,current.area_employee)) return send(res,403,{error:'No tenés acceso a recorridos de esta área'});
      if (body.reviewStatus) {
        if (!['Pendiente','Aprobado','Revisar','Rechazado'].includes(body.reviewStatus)) return send(res,400,{error:'Estado inválido'});
        patch.review_status = body.reviewStatus;
      }
      if (body.kmTraccar !== undefined && body.kmTraccar !== null && body.kmTraccar !== '') patch.km_traccar = Number(body.kmTraccar);
      if (patch.km_traccar !== undefined) {
        if (!Number.isFinite(patch.km_traccar) || patch.km_traccar < 0) return send(res,400,{error:'KM de GPS inválidos'});
        patch.difference_km = current.km_travel == null ? null : Number((patch.km_traccar - Number(current.km_travel)).toFixed(2));
      }
      patch.reviewed_at = new Date().toISOString();
      const p = new URLSearchParams({ id: `eq.${body.id}` });
      const updated = await sb(tablePath(company.trips, p), { method:'PATCH', headers:{'Content-Type':'application/json', Prefer:'return=representation'}, body:JSON.stringify(patch) });
      return send(res, 200, { item: updated?.[0] || null });
    } catch (error) {
      console.error(error); return send(res, 500, { error: 'No fue posible actualizar la revisión' });
    }
  }

  return send(res, 405, { error: 'Método no permitido' });
};
