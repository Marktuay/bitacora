const {test,after}=require('node:test'),assert=require('node:assert/strict');
const ExcelJS=require('exceljs'),A=require('../lib/auth'),T=require('../assets/trip-comparison');
const original=A.reportData;
const entries=[
 {km_travel:17,km_traccar:17.71},
 {km_travel:5,km_traccar:3.49},
 {km_travel:15,km_traccar:17.64},
].map((x,i)=>({...x,id:String(i),date:'2026-10-03',employee_name:'Andrew Rosales',plate:'M253788',origin:'Origen',destination:'Destino',time_start:'08:00:00',time_end:'08:30:00',km_initial:100,km_final:100+x.km_travel,review_status:'Pendiente'}));
async function excel(items){
 A.reportData=async()=>({company:{name:'NEW CENTURY'},employee:{name:'Andrew Rosales',area:'AUDITORIA'},from:'2026-10-01',to:'2026-10-15',items});
 const kmSession={admin:true,user:{id:'test-admin',email:'admin@example.invalid',app_metadata:{bitacora_role:'admin'}},token:'test'};
 let bytes,status;await require('../api/report-xlsx')({method:'GET',url:'/api/report-xlsx',headers:{},kmSession},{set statusCode(x){status=x},setHeader(){},end(x){bytes=x}});
 assert.equal(status,200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);return wb.worksheets[0];
}
test('Vehículo incluye tipo, marca y placa en tabla, CSV y Excel',async()=>{
 const entry={...entries[0],vehicle_type:'Moto',brand:'Genesis HJ1506',plate:'M253788'};
 const expected='Moto · Genesis HJ1506 · M253788';
 assert.equal(T.vehicle(entry),expected);
 assert.equal(T.values(entry)[2],expected);
 assert.equal(T.vehicle({...entry,vehicle_type:null,brand:null}),'M253788');
 assert.equal(T.vehicle({...entry,vehicle_type:null,brand:null,plate:null}),'—');
 assert.ok(T.rows([entry]).includes(expected));
 assert.ok(T.csv([entry]).includes(expected));
 const sheet=await excel([entry]);
 assert.equal(sheet.getCell('C8').value,expected);
 assert.ok(sheet.getColumn(3).width>=28);
 assert.ok(sheet.getRow(8).height>=19);
});

test('La tabla compartida conserva odómetro, GPS y diferencia con signo',()=>{
 assert.deepEqual(T.columns,['Fecha','Colaborador','Vehículo','Área solicita','Desde / Hasta','Hora','Odómetro','KM odómetro','KM GPS','Diferencia','Estado','Observaciones']);
 const total=T.totals(entries);
 assert.equal(T.km(total.km),'37.0');assert.equal(T.km(total.gps),'38.8');assert.equal(T.signed(total.difference),'+1.8');
 assert.deepEqual(entries.map(x=>T.values(x).slice(7,10)),[['17.0','17.7','+0.7'],['5.0','3.5','-1.5'],['15.0','17.6','+2.6']]);
});
test('Encabezados de identificación únicos en Excel y PDF para todas las funciones',async()=>{
 const fields=T.reportMeta({name:'NEW CENTURY'},{name:'Andrew Rosales',area:'AUDITORIA'},entries);
 assert.equal(T.title,'BITÁCORA DE RECORRIDO POR KILÓMETRO');
 assert.deepEqual(fields.map(x=>x.label),['Empresa','Colaborador','Área','Placa','Tipo de vehículo','Marca']);
 assert.deepEqual(fields.map(x=>x.value),['NEW CENTURY','Andrew Rosales','AUDITORIA','M253788','—','—']);
 const sheet=await excel(entries);
 assert.equal(sheet.getCell('A1').value,T.title);
 for(const [row,index] of [[3,0],[4,2],[5,4]]){
  assert.equal(sheet.getCell(row,1).value,fields[index].label);
  assert.equal(sheet.getCell(row,2).value,fields[index].value);
  assert.equal(sheet.getCell(row,6).value,fields[index+1].label);
  assert.equal(sheet.getCell(row,7).value,fields[index+1].value);
 }
});

test('El Excel imprime las mismas columnas y tres totales que revisión',async()=>{
 const sheet=await excel(entries);
 assert.deepEqual(Array.from({length:12},(_,i)=>sheet.getCell(7,i+1).value),T.columns);
 assert.equal(sheet.getCell('H11').value,37);assert.equal(Number(sheet.getCell('I11').value.toFixed(2)),38.84);assert.equal(Number(sheet.getCell('J11').value.toFixed(2)),1.84);
 assert.equal(sheet.getCell('K8').value,'Pendiente');assert.equal(sheet.getCell('L8').value,'—');assert.equal(sheet.getCell('J9').value,-1.5099999999999998);
 assert.equal(sheet.pageSetup.orientation,'landscape');assert.equal(sheet.pageSetup.printTitlesRow,undefined,'No repetir encabezados en páginas finales de rendición y firmas');
});
test('GPS ausente no se convierte en cero ni resta el odómetro de otra gestión',async()=>{
 const items=[entries[0],{...entries[1],km_traccar:null}],total=T.totals(items),sheet=await excel(items);
 assert.equal(total.km,22);assert.equal(total.measured,1);assert.equal(T.signed(total.difference),'+0.7');
 assert.equal(sheet.getCell('I9').value,'—');assert.equal(sheet.getCell('J9').value,'—');assert.match(sheet.getCell('A11').value,/1 de 2 recorridos/);
 const zero=T.totals([{km_travel:5,km_traccar:0}]);assert.equal(zero.gps,0);assert.equal(zero.difference,-5);
 assert.equal(T.totals([{km_travel:5,km_traccar:null}]).difference,null);
});
test('La tabla escapa las descripciones y normaliza el redondeo negativo a cero',()=>{
 const html=T.rows([{...entries[0],origin:'<img src=x onerror=alert(1)>',employee_name:'<script>bad</script>'}]);
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img'));
 assert.equal(T.signed(-0.01),'0.0');
});
test('CSV usa los rótulos GPS y los mismos valores y totales de la tabla',()=>{
 const lines=T.csv(entries).replace(/^\uFEFF/,'').split('\r\n');
 assert.equal(lines[0],T.columns.map(x=>`"${x}"`).join(','));
 assert.equal(lines[1],T.values(entries[0]).map(x=>`"${x}"`).join(','));
 assert.ok(lines.at(-1).endsWith('"37.0","38.8","+1.8","",""'));
 assert.ok(!T.csv(entries).toLowerCase().includes('traccar'));
 assert.match(T.csv([{...entries[0],km_traccar:null}]),/todavía no tienen distancia GPS/);
});
after(()=>{A.reportData=original});

test('Las observaciones se muestran completas en revisión, CSV y Excel',async()=>{
 const observation='Desvío por reparación de calle; verificado con supervisión.\nSe visitaron dos ubicaciones adicionales.';
 const entry={...entries[0],employee_observation:observation};
 assert.equal(T.values(entry)[11],observation);
 assert.ok(T.head().includes('Observaciones'));
 assert.ok(T.rows([entry]).includes('Se visitaron dos ubicaciones adicionales.'));
 assert.ok(T.csv([entry]).includes('Se visitaron dos ubicaciones adicionales.'));
 const sheet=await excel([entry]);
 assert.equal(sheet.getCell('L7').value,'Observaciones');
 assert.equal(sheet.getCell('L8').value,observation);
 assert.ok(sheet.getRow(8).height>19);
 assert.equal(T.values({...entry,employee_observation:null})[11],'—');
 const escaped=T.rows([{...entry,employee_observation:'<script>observación</script>'}]);
 assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('&lt;script&gt;'));
 assert.equal((T.head().match(/<th/g)||[]).length,T.columns.length+1);
});
