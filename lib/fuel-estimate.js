'use strict';
const FUEL_PRICES=Object.freeze({super:49.03,regular:47.84,diesel:43.22});
const round=(value,digits)=>Number(value.toFixed(digits));
function estimateFuel(items,amount,fuelType){
  const price=FUEL_PRICES[fuelType];
  const value=Number(amount);
  if(!price)throw new Error('Seleccioná gasolina súper, regular o diésel');
  if(!Number.isFinite(value)||value<=0||value>1000000)throw new Error('Ingresá un monto del vale válido y mayor que cero');
  if(!Array.isArray(items)||!items.length)throw new Error('No hay recorridos en el período seleccionado para estimar el rendimiento');
  const rows=[...items].sort((a,b)=>(String(a.date||'')+' '+String(a.time_start||'')+' '+String(a.id||'')).localeCompare(String(b.date||'')+' '+String(b.time_start||'')+' '+String(b.id||'')));
  const vehicles=[...new Set(rows.map(r=>String(r.vehicle_id||'').trim()))];
  if(vehicles.length!==1||!vehicles[0])throw new Error('Los recorridos del período corresponden a más de un vehículo o no tienen vehículo identificado');
  const first=Number(rows[0].km_initial),last=Number(rows[rows.length-1].km_final);
  if(!Number.isFinite(first)||!Number.isFinite(last)||last<=first)throw new Error('Revisá los odómetros: el KM final del período debe ser mayor que el inicial');
  const kmLabor=rows.reduce((total,row)=>{
    const km=Number(row.km_travel);
    if(!Number.isFinite(km)||km<0)throw new Error('Hay kilómetros de recorrido inválidos en el período');
    return total+km;
  },0);
  const distance=last-first;
  const liters=value/price;
  const efficiency=distance/liters;
  const nextLiters=kmLabor/efficiency;
  return {vehicleKey:vehicles[0],odometerInitial:first,odometerFinal:last,
    kmOdometer:round(distance,2),kmLabor:round(kmLabor,2),
    fuelType,fuelPrice:price,fuelAmount:round(value,2),
    litersAssigned:round(liters,6),kmPerLiter:round(efficiency,6),
    litersRecommended:round(nextLiters,6),nextAmount:round(nextLiters*price,2)};
}
module.exports={FUEL_PRICES,estimateFuel};
