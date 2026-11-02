const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'android/app/src/main/assets/mobile.html'),'utf8');
const js=fs.readFileSync(path.join(root,'android/app/src/main/assets/mobile.js'),'utf8');
const gradle=fs.readFileSync(path.join(root,'android/app/build.gradle.kts'),'utf8');
test('Mi bitácora APK muestra solo Desde y Hasta para elegir el rango de fechas',()=>{
 const section=html.slice(html.indexOf('<section id="myReportSection"'),html.indexOf('<section class="card"><h2>Guardados'));
 assert.match(section,/<label for="reportFrom">Desde<\/label><input id="reportFrom" type="date" required>/);
 assert.match(section,/<label for="reportTo">Hasta<\/label><input id="reportTo" type="date" required>/);
 assert.doesNotMatch(section,/reportCut|reportMonth|Primer corte|Segundo corte|>Período<|>Mes</);
 assert.ok(!section.includes('id="reportDates" class="grid" hidden'));
});
test('El reporte usa las fechas seleccionadas incluso cuando abarcan meses diferentes',()=>{
 const definition=js.match(/function reportPeriod\(\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(definition,'Falta reportPeriod');
 const values={reportFrom:{value:'2026-09-21'},reportTo:{value:'2026-10-17'}};
 const period=Function('$',definition+';return reportPeriod();')(id=>values[id]);
 assert.deepEqual(period,{from:'2026-09-21',to:'2026-10-17'});
 assert.doesNotMatch(js,/reportCut|reportMonth|reportMonthField|reportPeriodLabel/);
 assert.match(js,/call\('download',\{format:\$\('reportFormat'\)\.value,from,to,shareWhatsApp\}\)/);
});
test('El APK siguiente tiene una versión superior para instalar la actualización',()=>{
 assert.match(gradle,/versionCode = 22; versionName = "1\.4\.11"/);
 assert.match(html,/Versión 1\.4\.11/);
});
