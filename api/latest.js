const { getCompany, dbReady, send, sb, tablePath } = require('./_config');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });
  const url = new URL(req.url, 'http://localhost');
  const company = getCompany(url.searchParams.get('company'));
  const employeeId = url.searchParams.get('employeeId');
  const vehicleId = url.searchParams.get('vehicleId');
  if (!company || !employeeId || !vehicleId) return send(res, 400, { error: 'Datos incompletos' });
  if (!dbReady()) return send(res, 200, { item: null, demo: true });
  try {
    const p = new URLSearchParams({
      select: 'date,km_final', employee_id: `eq.${employeeId}`, vehicle_id: `eq.${vehicleId}`,
      order: 'date.desc,time_end.desc', limit: '1'
    });
    const rows = await sb(tablePath(company.trips, p));
    return send(res, 200, { item: rows?.[0] || null });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'No fue posible consultar el odómetro anterior' });
  }
};
