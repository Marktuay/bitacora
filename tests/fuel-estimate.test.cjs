const test=require('node:test');
const assert=require('node:assert/strict');
const {estimateFuel,FUEL_PRICES}=require('../lib/fuel-estimate');
const trips=[
 {id:'1',date:'2026-09-01',time_start:'08:00',vehicle_id:'v1',km_initial:34152,km_final:34300,km_travel:148},
 {id:'2',date:'2026-09-09',time_start:'17:00',vehicle_id:'v1',km_initial:34300,km_final:34497,km_travel:197}
];
test('Andrew: odómetro 345 km, vale C$600, 12.24 L y 28.19 km/L',()=>{
 const r=estimateFuel(trips,600,'super');
 assert.equal(r.kmOdometer,345);
 assert.equal(r.kmLabor,345);
 assert.equal(r.litersAssigned,Number((600/49.03).toFixed(6)));
 assert.equal(r.kmPerLiter,Number((345/(600/49.03)).toFixed(6)));
 assert.equal(r.nextAmount,600);
});
test('KM laborales son la suma de los tramos, no diferencia de odómetro',()=>{
 const changed=[{...trips[0],km_travel:100},{...trips[1],km_travel:150}];
 const r=estimateFuel(changed,600,'super');
 assert.equal(r.kmOdometer,345);assert.equal(r.kmLabor,250);
 assert.equal(r.nextAmount,Number((250/345*600).toFixed(2)));
});
test('Tarifas súper, regular, diésel',()=>assert.deepEqual(FUEL_PRICES,{super:49.03,regular:47.84,diesel:43.22}));
test('Sin vale no hay cálculo obligatorio',()=>assert.throws(()=>estimateFuel(trips,'','super'),/monto/));
test('No mezcla vehículos',()=>assert.throws(()=>estimateFuel([{...trips[0],vehicle_id:'a'},{...trips[1],vehicle_id:'b'}],600,'super'),/más de un vehículo/));
test('Odómetro invertido se rechaza',()=>assert.throws(()=>estimateFuel([{...trips[0],km_initial:35000},{...trips[1]}],600,'super'),/KM final/));
