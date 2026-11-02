'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Writable } = require('node:stream');
const { finished } = require('node:stream/promises');

const C = require('../api/_config');
const A = require('../lib/auth');
const M = require('../lib/manager-area');

Object.assign(process.env, {
  SUPABASE_URL: 'https://test-qa.invalid',
  SUPABASE_SECRET_KEY: 'server-qa-test-key',
  NODE_ENV: 'test'
});

const mockDB = {
  tables: {},
  users: [],
  logs: []
};

// Setup initial multi-company mock database
for (const c of Object.keys(C.COMPANY)) {
  mockDB.tables['employees_' + c] = [
    { id: 'emp-' + c + '-1', name: 'JUAN PEREZ ' + c.toUpperCase(), area: 'AUDITORIA', active: true },
    { id: 'emp-' + c + '-2', name: 'MARIA LOPEZ ' + c.toUpperCase(), area: 'LEGAL', active: true }
  ];
  mockDB.tables['vehicles_' + c] = [
    { id: 'veh-' + c + '-1', type: 'Moto', brand: 'Yamaha', plate: 'M1234', employee_id: 'emp-' + c + '-1', active: true },
    { id: 'veh-' + c + '-2', type: 'Camioneta', brand: 'Toyota', plate: 'M5678', employee_id: 'emp-' + c + '-2', active: true }
  ];
  mockDB.tables['bitacora_' + c] = [
    {
      id: crypto.randomUUID(),
      employee_id: 'emp-' + c + '-1',
      employee_name: 'JUAN PEREZ ' + c.toUpperCase(),
      company: C.COMPANY[c].name,
      area_employee: 'AUDITORIA',
      date: '2026-10-25',
      vehicle_id: 'veh-' + c + '-1',
      origin: 'Sede Central',
      destination: 'Sucursal Norte',
      km_initial: 100,
      km_final: 120,
      km_travel: 20,
      time_start: '08:00:00',
      time_end: '09:00:00',
      review_status: 'Pendiente',
      odometer_start_path: `${c}/odometer-start/valid-photo-1.jpg`,
      odometer_end_path: `${c}/odometer-end/valid-photo-2.jpg`,
      support_path: `${c}/support/valid-support.pdf`
    }
  ];
}
mockDB.tables.km_mobile_devices = [
  {
    id: 'dev-active-1',
    company: 'newcentury',
    employee_id: 'emp-newcentury-1',
    vehicle_id: 'veh-newcentury-1',
    token_hash: crypto.createHash('sha256').update('valid-token-64-bytes-000000000000000000000000000000000000000000000000').digest('hex'),
    label: 'Samsung Galaxy A54',
    active: true
  },
  {
    id: 'dev-revoked-2',
    company: 'newcentury',
    employee_id: 'emp-newcentury-1',
    vehicle_id: 'veh-newcentury-1',
    token_hash: crypto.createHash('sha256').update('revoked-token-bytes-000000000000000000000000000000000000000000000000').digest('hex'),
    label: 'Xiaomi Redmi Note 10',
    active: false
  }
];
mockDB.tables.km_report_access = [
  { user_id: 'usr-colab-1', company: 'newcentury', employee_id: 'emp-newcentury-1', active: true }
];

function createActor(role, company, area = 'AUDITORIA') {
  const user = {
    id: 'usr-' + role + '-' + company,
    email: `${role}.${company}@newcentury.invalid`,
    app_metadata: {
      bitacora_role: role,
      ...(role === 'manager' ? { bitacora_managed_companies: [company], bitacora_managed_areas: [area] } : {})
    }
  };
  mockDB.users.push(user);
  return {
    admin: role === 'admin',
    user,
    token: 'jwt-token-' + role
  };
}

const adminActor = createActor('admin', 'all');
const managerNC = createActor('manager', 'newcentury', 'AUDITORIA');
const managerBlokon = createActor('manager', 'blokon', 'AUDITORIA');
const colabNC = { admin: false, user: { id: 'usr-colab-1', email: 'colab@newcentury.invalid', app_metadata: { bitacora_role: 'collaborator' } }, token: 'jwt-colab-1' };

// Mock database layer
C.allRows = async (t, p) => C.sb(C.tablePath(t, p));
C.sb = async (raw, options = {}) => {
  const url = new URL(raw, 'http://test-qa');
  const path = url.pathname;
  const table = path.split('/').at(-1);
  let body = null;
  if (options.body && typeof options.body === 'string') {
    try { body = JSON.parse(options.body); } catch {}
  }

  if (path.startsWith('/storage/v1/object/sign/')) {
    return { signedURL: '/storage/v1/object/sign/temp-valid-signed-token' };
  }
  if (path.startsWith('/storage/v1/object/')) {
    return { Key: 'stored-file' };
  }
  if (path === '/rest/v1/rpc/km_my_report') {
    return {
      items: mockDB.tables['bitacora_newcentury'].filter(x => x.employee_id === 'emp-newcentury-1')
    };
  }

  if (!mockDB.tables[table]) {
    throw new Error('Tabla desconocida: ' + table);
  }

  let items = mockDB.tables[table];
  const queryParams = [...url.searchParams];

  const matched = items.filter(r => queryParams.every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) return true;
    const dot = v.indexOf('.');
    const op = dot >= 0 ? v.slice(0, dot) : 'eq';
    const val = dot >= 0 ? v.slice(dot + 1) : v;
    if (op === 'eq') return String(r[k]) === val;
    if (op === 'gte') return r[k] >= val;
    if (op === 'lte') return r[k] <= val;
    return true;
  }));

  if (options.method === 'PATCH') {
    matched.forEach(r => Object.assign(r, body));
    return matched;
  }
  if (options.method === 'POST') {
    items.push(body);
    return [body];
  }
  return matched;
};

// Dispatcher helper
async function requestAPI(endpoint, { method = 'GET', auth = null, query = '', body = null, headers = {} } = {}) {
  const chunks = [];
  const resHeaders = {};
  const res = new Writable({
    write(chunk, enc, cb) { chunks.push(Buffer.from(chunk)); cb(); }
  });
  res.statusCode = 200;
  res.setHeader = (k, v) => { resHeaders[k.toLowerCase()] = v; };

  const done = finished(res);
  const reqHeaders = {
    host: 'localhost:4173',
    origin: 'http://localhost:4173',
    ...headers
  };

  const fullUrl = `/api/${endpoint}${query}`;
  const req = {
    method,
    url: fullUrl,
    headers: reqHeaders,
    ...(auth ? { kmSession: auth } : {}),
    body
  };

  const handler = require(`../api/${endpoint}`);
  await handler(req, res);
  await done;

  const rawBytes = Buffer.concat(chunks);
  let parsed = null;
  const isJson = String(resHeaders['content-type'] || '').includes('application/json');
  if (isJson && rawBytes.length > 0) {
    try { parsed = JSON.parse(rawBytes.toString('utf8')); } catch { parsed = rawBytes.toString('utf8'); }
  }
  return { status: res.statusCode, headers: resHeaders, body: parsed, bytes: rawBytes };
}

// ==========================================
// SECCIÓN 1: PRUEBAS DE CALIDAD DE SERVICIO (QoS) Y ENDPOINTS
// ==========================================

test('QoS: Endpoint /api/health responde con estado operacional y headers correctos', async () => {
  const r = await requestAPI('health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('QoS: Métodos no permitidos devuelven 405 Method Not Allowed', async () => {
  const r = await requestAPI('catalog', { method: 'POST', auth: managerNC, query: '?company=newcentury' });
  assert.equal(r.status, 405);
  assert.match(r.body.error, /Método no permitido/i);
});

test('QoS: Manejo de empresas inválidas devuelve 400 Bad Request', async () => {
  const r = await requestAPI('catalog', { auth: managerNC, query: '?company=empresa_fantasma' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Empresa inválida/i);
});

test('QoS: Rechazo estricto de períodos de fecha incoherentes o mayores a 1 año', async () => {
  // Fecha final menor a fecha inicial
  const rInverted = await requestAPI('entries', { auth: managerNC, query: '?company=newcentury&from=2026-10-30&to=2026-10-01' });
  assert.equal(rInverted.status, 400);

  // Período superior a 365 días
  const rTooLong = await requestAPI('report', { auth: managerNC, query: '?company=newcentury&employeeId=emp-newcentury-1&from=2024-01-01&to=2026-01-01' });
  assert.equal(rTooLong.status, 400);
  assert.match(rTooLong.body.error, /hasta un año/i);
});

// ==========================================
// SECCIÓN 2: CONTROL DE ACCESO (BOLA / IDOR)
// ==========================================

test('IDOR: Un jefe de Blokon NO puede listar bitácoras de New Century', async () => {
  const r = await requestAPI('entries', { auth: managerBlokon, query: '?company=newcentury' });
  assert.equal(r.status, 401);
  assert.match(r.body.error, /Permiso de revisión requerido/i);
});

test('IDOR: Un jefe de área Auditoría NO puede consultar expedientes de Legal', async () => {
  const r = await requestAPI('report', {
    auth: managerNC,
    query: '?company=newcentury&employeeId=emp-newcentury-2&from=2026-10-01&to=2026-10-31'
  });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /No tenés acceso a/i);
});

test('IDOR: Un colaborador NO puede ver bitácoras completas ni aprobar revisiones', async () => {
  // Intento de listar todos
  const rList = await requestAPI('entries', { auth: colabNC, query: '?company=newcentury' });
  assert.equal(rList.status, 401);

  // Intento de aprobar su propio viaje
  const tripId = mockDB.tables.bitacora_newcentury[0].id;
  const rPatch = await requestAPI('entries', {
    method: 'PATCH',
    auth: colabNC,
    query: '?company=newcentury',
    body: { id: tripId, reviewStatus: 'Aprobado' }
  });
  assert.equal(rPatch.status, 401);
});

test('IDOR en Fotos/Soportes: Un jefe no puede acceder a fotos de soportes de otra área', async () => {
  const r = await requestAPI('support', {
    auth: managerNC,
    query: '?path=newcentury/odometer-start/legal-classified-odometer.jpg'
  });
  // Si la ruta pertenece a un empleado de Legal, debe bloquearse con 403
  assert.ok([401, 403, 404].includes(r.status));
});

// ==========================================
// SECCIÓN 3: SEGURIDAD CONTRA INYECCIÓN Y SUBIDA DE ARCHIVOS
// ==========================================

test('Path Traversal: Intentos de salto de directorio (../) en descarga de soportes son bloqueados', async () => {
  const attempts = [
    '../../etc/passwd',
    '..%2F..%2Fetc%2Fpasswd',
    'newcentury/../../../config/database.json',
    'newcentury/odometer-start/../../secret.env'
  ];

  for (const path of attempts) {
    const r = await requestAPI('support', { auth: adminActor, query: `?path=${encodeURIComponent(path)}` });
    assert.equal(r.status, 400, `Debe rechazar ${path}`);
    assert.match(r.body.error, /Ruta inválida/i);
  }
});

test('File Upload / Magic Bytes: Archivos con extensión .jpg falsa pero contenido malicioso son rechazados', async () => {
  // Payload malicioso (texto HTML o ejecutable disfrazado)
  const fakeJpg = Buffer.from('<?php echo "malware"; ?>', 'utf8').toString('base64');
  const r = await requestAPI('support', {
    method: 'POST',
    body: {
      company: 'newcentury',
      kind: 'odometer-start',
      contentType: 'image/jpeg',
      base64: fakeJpg
    }
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /foto JPG, PNG o WebP/i);
});

test('File Upload: Archivos reales JPEG con cabecera JFIF válida son aceptados y reciben UUID aleatorio', async () => {
  // JPEG Magic Bytes: FF D8 FF E0 .. .. 4A 46 49 46 (JFIF header)
  const validJpgHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
  const dummyPayload = Buffer.concat([validJpgHeader, Buffer.alloc(100, 0xAA)]).toString('base64');

  const r = await requestAPI('support', {
    method: 'POST',
    body: {
      company: 'newcentury',
      kind: 'odometer-start',
      contentType: 'image/jpeg',
      base64: dummyPayload
    }
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.path.startsWith('newcentury/odometer-start/'));
  // Confirmar que el nombre asignado es un UUID v4 seguro
  const fileName = r.body.path.split('/').pop();
  assert.match(fileName, /^[0-9a-f-]{36}\.jpg$/);
});

test('Payload Limit: Archivos mayores a 3 MB son rechazados con 413 Payload Too Large', async () => {
  const giantBase64 = Buffer.alloc(3.5 * 1024 * 1024, 'A').toString('base64');
  const r = await requestAPI('support', {
    method: 'POST',
    body: {
      company: 'newcentury',
      kind: 'support',
      contentType: 'application/pdf',
      base64: giantBase64
    }
  });
  assert.equal(r.status, 413);
  assert.match(r.body.error, /no debe superar 3 MB/i);
});

// ==========================================
// SECCIÓN 4: PROTECCIÓN CSRF Y CONTROL DE DISPOSITIVOS MÓVILES
// ==========================================

test('CSRF: Peticiones POST desde sitios externos (Sec-Fetch-Site: cross-site) son rechazadas', async () => {
  const r = await requestAPI('session', {
    method: 'POST',
    query: '?action=login',
    headers: { 'sec-fetch-site': 'cross-site' },
    body: { email: 'admin@newcentury.invalid', password: 'test' }
  });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Solicitud no autorizada/i);
});

test('CSRF: Orígenes con Host no concordante son bloqueados', async () => {
  const r = await requestAPI('session', {
    method: 'POST',
    query: '?action=login',
    headers: { origin: 'http://malicious-attacker-domain.com' },
    body: { email: 'admin@newcentury.invalid', password: 'test' }
  });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Solicitud no autorizada/i);
});

test('Seguridad Móvil: Dispositivo con token revocado NO puede re-enrolarse (v2.0.6 fix)', async () => {
  const mobileApi = require('../lib/mobile-api');
  // Token hexadecimal válido de 64 caracteres
  const revokedTokenHex = 'a'.repeat(64);
  const revokedHash = crypto.createHash('sha256').update(revokedTokenHex).digest('hex');
  mockDB.tables.km_mobile_devices.push({
    id: 'dev-revoked-test',
    company: 'newcentury',
    employee_id: 'emp-newcentury-1',
    vehicle_id: 'veh-newcentury-1',
    token_hash: revokedHash,
    active: false
  });

  let responseStatus = 200;
  let responseData = null;
  const req = {
    method: 'POST',
    url: '/api/traccar?action=mobile-enroll',
    headers: { host: 'localhost:4173', origin: 'http://localhost:4173' },
    kmSession: colabNC,
    body: {
      company: 'newcentury',
      employeeId: 'emp-newcentury-1',
      vehicleId: 'veh-newcentury-1',
      deviceToken: revokedTokenHex
    }
  };
  const res = {
    setHeader: () => {},
    get statusCode() { return responseStatus; },
    set statusCode(code) { responseStatus = code; },
    end: (data) => { if (data) try { responseData = JSON.parse(data); } catch { responseData = data; } }
  };

  await mobileApi.handler(req, res);
  assert.equal(responseStatus, 403);
  assert.match(responseData.error, /Dispositivo revocado/i);
});

test('Privilegios: Intentos de elevación inyectando admin en user_metadata son neutralizados', () => {
  const tamperedSession = {
    admin: false,
    user: {
      id: 'attacker-1',
      user_metadata: { bitacora_role: 'admin', bitacora_managed_companies: ['blokon', 'newcentury'] },
      app_metadata: { bitacora_role: 'collaborator' }
    }
  };
  // canReview debe leer de app_metadata y rechazar el intento
  assert.equal(A.canReview(tamperedSession, 'blokon'), false);
  assert.equal(A.canReview(tamperedSession, 'newcentury'), false);
  assert.deepEqual(A.managedCompanies(tamperedSession), []);
});
