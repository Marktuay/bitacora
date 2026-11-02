const COMPANY = {
  newcentury: { slug: 'newcentury', name: 'NEW CENTURY', employees: 'employees_newcentury', vehicles: 'vehicles_newcentury', trips: 'bitacora_newcentury', accent: '#334155' },
  blokon: { slug: 'blokon', name: 'BLOKON', employees: 'employees_blokon', vehicles: 'vehicles_blokon', trips: 'bitacora_blokon', accent: '#0f4c81' },
  conaser: { slug: 'conaser', name: 'CONASER', employees: 'employees_conaser', vehicles: 'vehicles_conaser', trips: 'bitacora_conaser', accent: '#0d6b5c' },
  security: { slug: 'security', name: 'NEW CENTURY SECURITY', employees: 'employees_security', vehicles: 'vehicles_security', trips: 'bitacora_security', accent: '#334155' },
};

function getCompany(value) {
  const key = String(value || '').toLowerCase().trim();
  return COMPANY[key] || null;
}

function supabaseKey() { return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }

function dbReady() { return Boolean(process.env.SUPABASE_URL && supabaseKey()); }

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { throw new Error('JSON inválido'); } }
  if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { throw new Error('JSON inválido'); } }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('JSON inválido'); }
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function sb(path, options = {}) {
  if (!dbReady()) throw new Error('SUPABASE_NOT_CONFIGURED');
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}${path}`;
  const headers = {
    apikey: supabaseKey(),
    ...(supabaseKey().startsWith('eyJ') ? { Authorization: `Bearer ${supabaseKey()}` } : {}),
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data : (data?.message || data?.error || JSON.stringify(data));
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  return data;
}

async function requireAudit(req,res) { return require('../lib/auth').isAdmin(req,res); }
function validPeriod(from, to) {
  const valid = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  return valid(from) && valid(to) && from <= to;
}
async function allRows(table, params) {
  const items = [], p = new URLSearchParams(params), pageSize = 500;
  p.set('limit', String(pageSize));
  for (let offset = 0; ; offset += pageSize) {
    p.set('offset', String(offset));
    const page = await sb(tablePath(table, p));
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}

function tablePath(table, params = new URLSearchParams()) {
  const qs = params.toString();
  return `/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;
}

module.exports = { COMPANY, getCompany, dbReady, readJson, send, sb, requireAudit, tablePath, validPeriod, allRows, supabaseKey };
