const test=require('node:test');
const assert=require('node:assert/strict');
const {fuelPairs}=require('../lib/fuel-report');
const {estimateFuel}=require('../lib/fuel-estimate');
const trips=[
 {id:'1',vehicle_id:'v1',date:'2026-09-01',time_start:'08:00',km_initial:34152,km_final:34300,km_travel:100},
 {id:'2',vehicle_id:'v1',date:'2026-09-09',time_start:'17:00',km_initial:34300,km_final:34497,km_travel:150}
];
test('fecha documental no afecta al cálculo del período',()=>{
 const base=estimateFuel(trips,600,'super');
 const original={...base,voucher_number:'R-538',voucher_date:'2026-08-28',
  km_since:base.kmOdometer,km_period:base.kmLabor,liters:base.litersAssigned,
  km_per_liter:base.kmPerLiter,next_amount:base.nextAmount,
  fuel_amount:600,fuel_price:49.03,fuel_type:'super',odometer_initial:34152,odometer_final:34497};
 const changed={...original,voucher_date:'2026-09-25'};
 assert.equal(base.kmOdometer,345);
 assert.equal(base.kmLabor,250);
 assert.equal(base.nextAmount,434.78);
 assert.equal(original.next_amount,changed.next_amount);
 assert.equal(original.km_per_liter,changed.km_per_liter);
 const labels=fuelPairs(original);
 assert.ok(labels.some(([k,v])=>k==='Número del vale'&&v==='R-538'));
 assert.ok(labels.some(([k,v])=>k==='Fecha del vale'&&v==='2026-08-28'));
 assert.ok(labels.some(([k,v])=>k==='Próximo vale estimado'&&v==='C$434.78'));
});
test('si falta el vale no se debe imprimir bloque de combustible',()=>assert.deepEqual(fuelPairs(null),[]));
