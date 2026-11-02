const C = require('../api/_config');
const PUBLIC_KEY = 'sb_publishable_75GpPlJ3soeIW7eV1Q_fTQ_Uwc6Ltke';
const fail = (status, message) => Object.assign(new Error(message), {status});
function publicKey() { return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || PUBLIC_KEY; }
function csrf(req) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return;
  if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403,'Solicitud no autorizada');
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw fail(403,'Solicitud no autorizada');
}
function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i=part.indexOf('='); if(i<0)continue;
    try { result[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1)); } catch {}
  }
  return result;
}
function setSession(req,res,session,extraCookies=[]) {
  const secure = process.env.NODE_ENV !== 'test' && !/^localhost(?::|$)|^127\.0\.0\.1(?::|$)/.test(req.headers.host||'');
  const options = `; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}; Max-Age=${session?31536000:0}`;
  res.setHeader('Set-Cookie',[
    `km_access=${encodeURIComponent(session?.access_token||'')}${options}`,
    `km_refresh=${encodeURIComponent(session?.refresh_token||'')}${options}`,
    ...extraCookies
  ]);
  res.setHeader('Cache-Control','no-store');
}
async function authFetch(path, options={}) {
  if(!process.env.SUPABASE_URL)throw fail(503,'Acceso pendiente de configurar');
  const response=await fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/'+path,{
    ...options,headers:{apikey:publicKey(),'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok&&path==='user'&&options.method==='PUT'){
    const messages={same_password:'La nueva contraseña debe ser distinta a la actual',weak_password:'La contraseña no cumple los requisitos. Usá al menos 8 caracteres con letras, números y un símbolo.',reauthentication_needed:'Volvé a ingresar con tu contraseña actual para cambiarla',reauthentication_not_valid:'La verificación de la cuenta venció. Volvé a ingresar.',invalid_credentials:'La contraseña actual es incorrecta'};
    throw Object.assign(fail(response.status===429?429:response.status>=500?503:400,messages[data.code]||'No se pudo cambiar la contraseña. Volvé a ingresar e intentá nuevamente.'),{code:data.code});
  }
  if(!response.ok)throw fail(response.status===429?429:response.status>=500?503:401,
    response.status===429?'Demasiados intentos. Esperá unos minutos.':response.status>=500?'Servicio de acceso no disponible':'Correo o contraseña incorrectos, o sesión vencida');
  return data;
}
async function session(req,res) {
  if(req.kmSession){passwordGate(req,req.kmSession.user);return req.kmSession;}
  csrf(req);
  const c=cookies(req); let token=c.km_access;
  if(!token&&!c.km_refresh)throw fail(401,'Iniciá sesión para continuar');
  let user;
  try { if(!token)throw fail(401,'Sesión vencida'); user=await authFetch('user',{headers:{Authorization:'Bearer '+token}}); }
  catch(e) {
    if(e.status!==401||!c.km_refresh)throw e;
    const fresh=await authFetch('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:c.km_refresh})});
    setSession(req,res,fresh);token=fresh.access_token;
    user=await authFetch('user',{headers:{Authorization:'Bearer '+token}});
  }
  if(!user.id)throw fail(401,'Iniciá sesión para continuar');
  passwordGate(req,user);
  return req.kmSession={user,token,admin:user.app_metadata?.bitacora_role==='admin'};
}
function passwordGate(req,user){
  if(user.app_metadata?.bitacora_password_pending!==true)return;
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/session'||u.pathname==='/api/traccar'&&u.searchParams.get('action')==='mobile-session'&&req.method==='GET')return;
  throw fail(428,'Establecé tu propia contraseña en Mi cuenta antes de continuar');
}
async function isAdmin(req,res) { try { return (await session(req,res)).admin; } catch(e) { if(e.status===401||e.status===403)return false; throw e; } }
function managedCompanies(auth){
 if(auth.admin)return Object.keys(C.COMPANY);
 const meta=auth.user?.app_metadata||{},scopes=meta.bitacora_managed_companies;
 return meta.bitacora_role==='manager'&&Array.isArray(scopes)&&scopes.length===1&&C.getCompany(scopes[0])?[scopes[0]]:[];
}
function canReview(auth,company){return managedCompanies(auth).includes(company);}
async function requireCompanyManager(req,res,company){const auth=await session(req,res);if(!canReview(auth,company))throw fail(403,'No tenés permiso para administrar esta empresa');return auth;}
async function reviewAllowed(req,res,company){try{return canReview(await session(req,res),company)}catch(e){if(e.status===401||e.status===403)return false;throw e;}}
async function asUser(auth,path,options={}) {
  return C.sb(path,{...options,headers:{...options.headers,apikey:publicKey(),Authorization:'Bearer '+auth.token}});
}
async function assignments(auth) {
  const p=new URLSearchParams({select:'company,employee_id',user_id:`eq.${auth.user.id}`,active:'eq.true'});
  const links=await asUser(auth,C.tablePath('km_report_access',p));
  const profiles=[];
  for(const link of links) {
    const c=C.getCompany(link.company); if(!c)continue;
    const rows=await asUser(auth,C.tablePath(c.employees,new URLSearchParams({select:'id,name,area',id:`eq.${link.employee_id}`,active:'eq.true'})));
    if(rows[0])profiles.push({...rows[0],company:c.slug});
  }
  return profiles;
}
async function reportData(req,res) {
  const auth=await session(req,res),u=new URL(req.url,'http://localhost');
  const company=C.getCompany(u.searchParams.get('company')),employeeId=u.searchParams.get('employeeId');
  const from=u.searchParams.get('from'),to=u.searchParams.get('to');
  if(!company||!C.validPeriod(from,to)||Date.parse(to)-Date.parse(from)>365*86400000||(!employeeId&&!auth.admin))throw fail(400,'Elegí colaborador y período válido, de hasta un año');
  if(canReview(auth,company.slug)) {
    const employee=employeeId
      ?(await C.sb(C.tablePath(company.employees,new URLSearchParams({select:'id,name,area',id:`eq.${employeeId}`}))))?.[0]
      :{id:null,name:'Todos los colaboradores',area:'Todas las áreas'};
    if(!employee)throw fail(404,'Colaborador no encontrado');
    const p=new URLSearchParams({select:'*',date:`gte.${from}`,order:'date.asc,time_start.asc,id.asc'});
    if(employeeId)p.set('employee_id',`eq.${employeeId}`);
    p.append('date',`lte.${to}`);
    return {company,employee,from,to,items:require('./report-status').filter(await C.allRows(company.trips,p),u.searchParams.get('reviewStatus')||'all')};
  }
  const profiles=await assignments(auth),employee=profiles.find(p=>p.company===company.slug&&p.id===employeeId);
  if(!employee)throw fail(403,'No tenés acceso a esta bitácora');
  const result=await asUser(auth,'/rest/v1/rpc/km_my_report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_from:from,p_to:to})});
  return {company,employee,from,to,items:require('./report-status').filter(result.items.filter(x=>x.company===company.name&&x.employee_id===employeeId),u.searchParams.get('reviewStatus')||'all')};
}
module.exports={fail,csrf,publicKey,cookies,setSession,authFetch,session,isAdmin,asUser,assignments,reportData,managedCompanies,canReview,requireCompanyManager,reviewAllowed};
