const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Vista web comparte firma de colaborador y jefe con Excel y PDF',()=>{
 const h=read('reportes.html'),w=read('assets/reports.js'),x=read('api/report-xlsx.js'),p=read('api/report-pdf.js'),api=read('api/report.js');
 assert.match(h,/id="sigEmployee"/);assert.match(h,/id="sigManager"/);
 assert.match(w,/signatures=x.signatures/);
 for(const s of [x,p]){assert.match(s,/reportSignatures\(company,employee\)/);assert.match(s,/signatures.elaboratedBy/);assert.match(s,/signatures.reviewedBy/);}
 assert.match(api,/reportSignatures\(r.company,r.employee\)/);
});
test('Tabla en Excel PDF y vista usa mismo arreglo de encabezados',()=>{
 for(const f of ['api/report-xlsx.js','api/report-pdf.js','assets/reports.js']){
  assert.match(read(f),/T\.(columns|head\((?:false)?\))/);
 }
 assert.match(read('api/report-pdf.js'),/fillAndStroke\('#334155'/);
});
test('APK reúne las acciones de Excel PDF WhatsApp y GPS en una sección',()=>{
 const s=read('android/app/src/main/assets/mobile.html').split('<section id="myReportSection"')[1].split('<section class="card"><h2>Guardados')[0];
 for(const id of ['myReportBtn','reportFormat','reportFrom','reportTo','downloadMyReport','shareMyReport','viewMyGpsReport'])assert.match(s,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(s,/data-page="gps"/);
 assert.match(read('android/app/src/main/assets/mobile.js'),/\$\('viewMyGpsReport'\)\.onclick/);
});