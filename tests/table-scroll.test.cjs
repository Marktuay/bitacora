const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const source=file=>readFileSync(path.join(__dirname,'..',file),'utf8');

test('Revisión y bitácoras tienen contenedores de tabla con scroll vertical',()=>{
 const audit=source('auditoria.html'),report=source('reportes.html');
 assert.match(audit,/<div class="table-wrap km-table-scroll(?: review-table-scroll)?"><table class="audit-table">/);
 assert.match(report,/<div class="table-wrap report-table-wrap km-table-scroll">/);
 assert.match(audit,/id="comparisonTotals"/);
 assert.match(report,/id="comparisonTotals"/);
});

test('Desplazamiento vertical y horizontal, títulos pegados y sin recorte al imprimir',()=>{
 const css=source('assets/styles.css');
 assert.match(css,/\.km-table-scroll\s*\{[^}]*max-height:[^;]+;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*auto;/s);
 assert.match(css,/\.km-table-scroll \.audit-table thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
 assert.match(css,/@media print\s*\{\s*\.km-table-scroll\s*\{[^}]*max-height:\s*none!important;[^}]*overflow:\s*visible!important;/s);
});

test('Bitácoras no muestran acción GPS, pero Auditoría conserva acceso autorizado',()=>{
 const reports=source('assets/reports.js');
 const compare=source('assets/trip-comparison.js');
 const audit=source('assets/audit.js');
 assert.match(reports,/T\.head\(false\)/);
 assert.match(reports,/T\.rows\(items,null,false\)/);
 assert.match(compare,/function head\(showActions=true\)/);
 assert.match(compare,/function rows\(items,actions,showActions=true\)/);
 assert.doesNotMatch(reports,/report-gps-link/);
 assert.match(audit,/Ver recorrido GPS/);
 assert.match(audit,/T\.rows\(displayItems,actionHtml\)/);
});
