const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('El menú de KM mantiene todos los accesos según los permisos',()=>{
 const home=source('index.html'),auth=source('assets/auth.js');
 assert.match(home,/data-auth-nav aria-label="Módulos y acceso"/);
 for(const id of ['sessionUser','logoutBtn','connection'])assert.ok(home.includes('id="'+id+'"'));
 assert.match(auth,/const manager=data\.admin\|\|/);
 assert.match(auth,/\['managerLink','Permisos de jefes','\/jefes\.html',data\.admin\]/);
 assert.doesNotMatch(auth,/Teléfonos Android|androidLink/);
});
test('Los módulos desplegables conservan acciones de auditoría y sesión',()=>{
 const auth=source('assets/auth.js');
 for(const [title,ids] of [
  ['Operación',["'reportLink'"]],['Revisión y control',["'reviewLink'","'teamLink'"]],['Administración',["'accessLink'","'managerLink'"]]
 ]){
  const line=auth.split('\n').find(x=>x.includes("['"+title+"',"));
  assert.ok(line,'Falta '+title);
  for(const id of ids)assert.ok(line.includes(id));
 }
 assert.match(auth,/const accountItems=\['sessionUser','changePasswordBtn','logoutBtn','connection'\]/);
 assert.match(auth,/document\.createElement\('details'\)/);
 assert.match(auth,/nav\.replaceChildren\(\.\.\.sections\)/);
 assert.match(auth,/extraControls=\[\.\.\.nav\.querySelectorAll\('button'\)\]\.filter\(el=>el\.id!=='logoutBtn'\)/);
});
test('Menú azul fijo PC y lateral desplegable celular, invisible al imprimir',()=>{
 const css=source('assets/styles.css'),auth=source('assets/auth.js');
 assert.match(css,/\.km-sidebar\s*\{[^}]*position:fixed;[^}]*width:250px;/s);
 assert.match(css,/@media screen and \(max-width:850px\)/);
 assert.match(css,/body\.km-menu-open \.km-sidebar\s*\{transform:translateX\(0\);\}/);
 assert.match(css,/@media print\s*\{\s*\.km-sidebar/);
 assert.match(auth,/nav\.inert=mobile\.matches&&!expanded/);
 assert.match(auth,/document\.body\.prepend\(nav\)/);
});
