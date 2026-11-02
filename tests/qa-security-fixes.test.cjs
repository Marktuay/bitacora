const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Test Suite for Security Audit Fixes (Cloudflare Security Audit Remediation)
test('Seguridad Fix 1: Rate Limiting en /api/session?action=login bloquea tras 5 intentos fallidos', async () => {
  const RL = require('../lib/rate-limit');
  RL.clearAll();

  const sessionHandler = require('../api/session');

  async function mockLoginRequest(ip, email, password) {
    let statusCode = 200;
    let headers = {};
    let responseBody = null;

    const req = {
      method: 'POST',
      url: '/api/session?action=login',
      headers: {
        host: 'localhost',
        'x-forwarded-for': ip,
        'content-type': 'application/json'
      },
      body: { email, password }
    };

    const res = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      set statusCode(v) { statusCode = v; },
      end(payload) {
        try { responseBody = JSON.parse(payload); } catch { responseBody = payload; }
      }
    };

    await sessionHandler(req, res);
    return { statusCode, headers, body: responseBody };
  }

  // Realizar 5 intentos fallidos (con credenciales dummy que fallan o provocan 503/400)
  for (let i = 1; i <= 5; i++) {
    const res = await mockLoginRequest('192.168.1.100', 'hacker@test.com', 'badpwd' + i);
    assert.ok([400, 401, 503].includes(res.statusCode), `Intento ${i} debe fallar con 400, 401 o 503`);
  }

  // El 6to intento debe ser bloqueado con HTTP 429 Too Many Requests
  const blockedRes = await mockLoginRequest('192.168.1.100', 'hacker@test.com', 'badpwd6');
  assert.equal(blockedRes.statusCode, 429, 'El sexto intento consecutivo debe recibir HTTP 429');
  assert.ok(blockedRes.headers['retry-after'], 'Debe incluir cabecera Retry-After');
  assert.match(blockedRes.body.error, /Demasiados intentos/i);

  // Una IP diferente NO debe estar bloqueada
  const otherIpRes = await mockLoginRequest('192.168.1.101', 'otro@test.com', 'badpwd');
  assert.notEqual(otherIpRes.statusCode, 429, 'Otra IP distinta no debe verse afectada por el bloqueo');

  // Limpiar contadores
  RL.clearAll();
});

test('Seguridad Fix 2: Caddyfile incluye cabeceras HSTS/CSP y restringe acceso a Traccar', () => {
  const caddyfilePath = path.join(__dirname, '../deployment/Caddyfile');
  const content = fs.readFileSync(caddyfilePath, 'utf8');

  // Verificar presencia de HSTS y cabeceras de endurecimiento
  assert.ok(content.includes('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"'), 'Debe incluir HSTS con max-age 1 año');
  assert.ok(content.includes('X-Content-Type-Options "nosniff"'), 'Debe incluir X-Content-Type-Options nosniff');
  assert.ok(content.includes('X-Frame-Options "DENY"'), 'Debe incluir X-Frame-Options DENY');

  // Verificar restricción de rutas en Traccar
  assert.ok(content.includes('@allowedMobile path /api/socket /api/positions /api/session'), 'Debe limitar rutas públicas en dominio GPS');
  assert.ok(content.includes('respond "Acceso restringido a la red interna corporativa" 403'), 'Debe bloquear la consola de administración con 403');
});

test('Seguridad Fix 3: android/app/build.gradle.kts exige keystore corporativo para release', () => {
  const gradlePath = path.join(__dirname, '../android/app/build.gradle.kts');
  const content = fs.readFileSync(gradlePath, 'utf8');

  assert.ok(content.includes('keyAlias = System.getenv("BITACORA_KEY_ALIAS") ?: "bitacora-km"'), 'Release debe usar por defecto keyAlias corporativo bitacora-km');
  assert.ok(content.includes('BITACORA_STORE_PASSWORD no configurada para release corporativo'), 'Debe exigir contraseña corporativa para release');
});

test('Seguridad Fix 4: package.json y package-lock.json fuerzan uuid >= 11.1.1', () => {
  const pkg = require('../package.json');
  assert.ok(pkg.overrides && pkg.overrides.uuid, 'package.json debe definir override para uuid');

  const lock = require('../package-lock.json');
  assert.equal(lock.packages['node_modules/uuid'].version, '11.1.1', 'uuid en node_modules debe ser 11.1.1');
});
