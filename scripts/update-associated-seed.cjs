// Refresh the bundled catalog using the administrator's reviewed associations.
const fs=require('node:fs'),seed=require('../api/_seed'),rows=require('../supabase/associated-vehicles.json');
const names={blokon:'BLOKON',conaser:'CONASER',security:'NEW CENTURY SECURITY',newcentury:'NEW CENTURY'};
for(const e of [{id:'BLO-CARLOS-DIAZ',name:'CARLOS JOSE DIAZ MORENO',company:'BLOKON'},{id:'NC-GABRIELA-BLANDON',name:'GABRIELA BLANDON',company:'NEW CENTURY'}])if(!seed.employees.some(x=>x.id===e.id))seed.employees.push({...e,area:null,role:null,active:true});
for(const a of rows){let v=seed.vehicles.find(x=>x.id===a.vehicle_id);if(!v){v={id:a.vehicle_id,company:names[a.company],plate:null,traccar_device_id:null,rate:null,active:true};seed.vehicles.push(v);}Object.assign(v,{employee_id:a.employee_id,type:a.type,brand:a.brand});}
fs.writeFileSync('api/_seed.js','module.exports = '+JSON.stringify(seed,null,2)+';\n');
