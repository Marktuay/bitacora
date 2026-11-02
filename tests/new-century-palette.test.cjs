const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'..','assets/styles.css'),'utf8');
const auth=fs.readFileSync(path.join(__dirname,'..','assets/auth.js'),'utf8');
test('Restaurar exactamente el esquema de colores anterior de Bitácora KM',()=>{
 assert.match(css,/--brand:#123f62;/);
 assert.match(css,/--accent:#1769aa;/);
 assert.match(css,/background:linear-gradient\(180deg,#112a48,#21446d\)/);
 assert.doesNotMatch(css,/--nc-red/);
});
test('Sustituir los emblemas NC por el logo real de New Century',()=>{
 assert.ok(fs.existsSync(path.join(__dirname,'..','assets/new-century.png')));
 assert.match(auth,/mark\.className='sidebar-company-logo';mark\.src='\/assets\/new-century\.png'/);
 assert.match(auth,/logo\.className='km-company-logo';/);
 assert.match(auth,/headerMark\.replaceChildren\(logo\)/);
 assert.match(css,/\.km-sidebar \.sidebar-brand \.sidebar-company-logo/);
 assert.match(css,/\.topbar \.brand \.km-company-logo/);
});
test('Conservar navegación, controles y diseño responsive existente',()=>{
 assert.match(auth,/nav\.replaceChildren\(\.\.\.sections\)/);
 assert.match(auth,/const manager=data\.admin\|\|/);
 assert.match(css,/@media screen and \(max-width:850px\)/);
 assert.match(css,/@media print\s*\{\s*\.km-sidebar,\.km-menu-toggle,\.km-sidebar-backdrop/);
 assert.match(css,/\.km-table-scroll\s*\{[^}]*max-height:[^;]+;[^}]*overflow-x:auto;[^}]*overflow-y:auto;/s);
});
