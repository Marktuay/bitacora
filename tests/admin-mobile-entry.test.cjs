const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const mobile=fs.readFileSync(path.join(root,'android/app/src/main/assets/mobile.js'),'utf8');
const html=fs.readFileSync(path.join(root,'android/app/src/main/assets/mobile.html'),'utf8');
test('Administrador entra sin selección obligatoria de colaborador',()=>{
 assert.match(mobile,/if\(available.length&&!auth.admin&&\$\('switchCard'\).hidden\)openSwitch\(\)/);
 assert.match(mobile,/\$\('managerReportsBtn'\).hidden=!canManage/);
 assert.match(mobile,/\$\('auditBtn'\).hidden=!canManage/);
 assert.match(html,/id="managerReportsBtn" data-page="reports"/);
 assert.match(html,/id="auditBtn" data-page="audit"/);
});
test('GPS y reportes del jefe disponibles sin vincular un teléfono a un colaborador',()=>{
 const start=html.indexOf('id="sessionCard"'),end=html.indexOf('id="workspace"');
 assert.ok(start>=0&&end>start);
 assert.match(html.slice(start,end),/id="managerReportsBtn"/);
 assert.match(html.slice(start,end),/id="auditBtn"/);
});
