'use strict';
const {sb,tablePath}=require('../api/_config');
async function savedFuel(company,employeeId,from,to){
 const params=new URLSearchParams({
  select:'voucher_number,voucher_date,fuel_type,fuel_amount,fuel_price,liters,km_since,km_period,km_per_liter,next_amount,odometer_initial,odometer_final',
  company:'eq.'+company,employee_id:'eq.'+employeeId,
  period_from:'eq.'+from,period_to:'eq.'+to,status:'neq.Anulado',limit:'1'
 });
 try{return (await sb(tablePath('km_fuel_renditions',params)))?.[0]||null;}
 catch(error){console.error('No se pudo agregar el vale al reporte',error);return null;}
}
function fuelPairs(item){
 if(!item)return [];
 const money=x=>'C$'+Number(x||0).toFixed(2);
 const decimal=x=>Number(x||0).toFixed(2);
 const type={super:'Gasolina súper',regular:'Gasolina regular',diesel:'Diésel'};
 return [
  ['Número del vale',item.voucher_number||'—'],
  ['Fecha del vale',item.voucher_date||'—'],
  ['Combustible',type[item.fuel_type]||'—'],
  ['Último vale',money(item.fuel_amount)],
  ['Precio por litro',money(item.fuel_price)],
  ['Litros asignados',decimal(item.liters)+' L'],
  ['Odómetro inicial',decimal(item.odometer_initial)+' km'],
  ['Odómetro final',decimal(item.odometer_final)+' km'],
  ['KM entre odómetros',decimal(item.km_since)+' km'],
  ['KM laborales (suma de recorridos)',decimal(item.km_period)+' km'],
  ['Rendimiento estimado',decimal(item.km_per_liter)+' km/L'],
  ['Litros estimados para el próximo vale',item.km_per_liter>0?decimal(Number(item.km_period)/Number(item.km_per_liter))+' L':'—'],
  ['Próximo vale estimado',money(item.next_amount)]
 ];
}
module.exports={savedFuel,fuelPairs};
