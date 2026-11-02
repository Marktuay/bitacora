const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {Writable}=require('node:stream');
const {finished}=require('node:stream/promises');
const ExcelJS=require('exceljs');
const C=require('../api/_config'),A=require('../lib/auth');
const saved={sb:C.sb,allRows:C.allRows};
const rows=[
 {id:'r1',employee_id:'e1',employee_name:'Auditor Uno',area_employee:'AUDITORIA',date:'2026-10-03',time_start:'08:00:00',time_end:'09:00:00',origin:'A',destination:'B',km_initial:100,km_final:110,km_travel:10,review_status:'Aprobado'},
 {id:'r2',employee_id:'e2',employee_name:'Auditor Dos',area_employee:'LEGAL',date:'2026-10-04',time_start:'09:00:00',time_end:'10:00:00',origin:'B',destination:'C',km_initial:200,km_final:215,km_travel:15,review_status:'Pendiente'}
];
const admin={admin:true,user:{id:'a',app_metadata:{bitacora_role:'admin'}},token:'test'};
const other={admin:false,user:{id:'u',app_metadata:{bitacora_role:'manager',bitacora_managed_companies:['newcentury'],bitacora_managed_areas:['AUDITORIA']}},token:'test'};
const q='?company=newcentury&from=2026-10-01&to=2026-10-15';
C.sb=async path=>{
 const u=new URL(path,'http://test.invalid');
 if(u.pathname.endsWith('/employees_newcentury'))return [{id:'e1',name:'Auditor Uno',area:'AUDITORIA'}].filter(x=>'eq.'+x.id===u.searchParams.get('id'));
 throw Error('Consulta inesperada: '+u.pathname);
};
C.allRows=async (table,params)=>{
 assert.equal(table,'bitacora_newcentury');
 assert.equal(params.get('date'),'gte.2026-10-01');
 assert.ok(params.getAll('date').includes('lte.2026-10-15'));
 const employee=params.get('employee_id');
 return employee?rows.filter(x=>'eq.'+x.employee_id===employee):rows;
};
async function call(route,actor=admin,query=q){
 const chunks=[],headers={};
 const res=new Writable({write(chunk,enc,cb){chunks.push(Buffer.from(chunk));cb();}});
 res.statusCode=200;
 res.setHeader=(k,v)=>{headers[k.toLowerCase()]=v;};
 const req={method:'GET',url:'/api/'+route+query,headers:{},kmSession:actor};
 const done=finished(res);
 await require('../api/'+route)(req,res);
 await done;
 const bytes=Buffer.concat(chunks);
 return {status:res.statusCode,bytes,data:headers['content-type']?.includes('application/json')?JSON.parse(bytes.toString('utf8')):null};
}
test('El administrador consulta todos los colaboradores sin employeeId',async()=>{
 const r=await call('report');
 assert.equal(r.status,200);
 assert.deepEqual(r.data.items.map(x=>x.employee_name),['Auditor Uno','Auditor Dos']);
 const filtered=await call('report',admin,q+'&reviewStatus=approved');
 assert.deepEqual(filtered.data.items.map(x=>x.employee_name),['Auditor Uno']);
});
test('El administrador conserva la selección individual',async()=>{
 const r=await call('report',admin,q+'&employeeId=e1');
 assert.equal(r.status,200);
 assert.equal(r.data.items.length,1);
 assert.equal(r.data.items[0].employee_id,'e1');
});
test('El no administrador no puede solicitar todos los colaboradores',async()=>{
 await assert.rejects(A.reportData({method:'GET',url:'/api/report'+q,headers:{},kmSession:other},{}),e=>e.status===400);
 const r=await call('report',other);
 assert.equal(r.status,403);
});
test('El administrador exporta Excel y PDF consolidados sin colaborador',async()=>{
 const xlsx=await call('report-xlsx');assert.equal(xlsx.status,200);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(xlsx.bytes);
 const sheet=wb.worksheets[0];
 assert.equal(sheet.getCell('G3').value,'Todos los colaboradores');
 assert.equal(sheet.getCell('H10').value,25);
 const pdf=await call('report-pdf');assert.equal(pdf.status,200);
 assert.equal(pdf.bytes.subarray(0,5).toString('ascii'),'%PDF-');
});
test('El formulario ofrece Todos al administrador y conserva el filtro individual',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const code=fs.readFileSync(path.join(__dirname,'../assets/reports.js'),'utf8');
 assert.match(code,/access\.admin\?'Todos los colaboradores':'Seleccione'/);
 assert.match(code,/if\(!access\.admin&&catalog\.employees\.length===1\)/);
 assert.match(code,/document\.querySelector\('\.fuel-vale-card'\)\.hidden=isAllEmployees\(\)/);
});
after(()=>{C.sb=saved.sb;C.allRows=saved.allRows;});
