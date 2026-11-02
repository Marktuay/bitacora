const C = require('../api/_config');
const A = require('./auth');
const M = require('./mobile-api');

function configured() {
  if(!require('./traccar-relay').direct())return C.dbReady();
  return Boolean(process.env.TRACCAR_BASE_URL && process.env.TRACCAR_INGEST_URL &&
    (process.env.TRACCAR_GATEWAY_TOKEN || process.env.TRACCAR_TOKEN || process.env.TRACCAR_USER && process.env.TRACCAR_PASSWORD));
}
async function request(path, params) {
  if(!require('./traccar-relay').direct())return require('./traccar-relay').call(path.split('/').at(-1),Object.fromEntries(params));
  const base = process.env.TRACCAR_BASE_URL?.replace(/\/$/, '');
  if (!base) throw A.fail(503, 'Falta conectar el servidor Traccar');
  const response = await fetch(`${base}/api/${path}?${params}`, {
    headers: { ...M.traccarHeaders(), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw A.fail(503, 'Traccar no está disponible. Intentá nuevamente.');
  const data = await response.json();
  if (!Array.isArray(data)) throw A.fail(503, 'Respuesta de Traccar inválida');
  return data;
}
function haversineMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function accuracyOf(point) {
  if (point.accuracy == null || point.accuracy === '') return null;
  const value = Number(point.accuracy);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function calculateRouteDistance(points, options = {}) {
  const MAX_ACCURACY_M = options.maxAccuracyM ?? 50;
  const MAX_SPEED_KMH = options.maxSpeedKmh ?? 160;
  const MAX_GAP_SECONDS = options.maxGapSeconds ?? 120;
  const NOISE_SCALE = options.noiseScale ?? 1;
  const NOISE_CAP_M = options.noiseCapM ?? 25;
  let meters = 0, rejected = 0, jitter = 0, gaps = 0, duplicates = 0, links = 0;
  let firstTime = null, maxInterval = 0, maxLinkedInterval = 0;
  let anchor = null, prev = null, lastTime = null, segment = [];
  const segments = [], gapDetails = [];
  let accepted = 0;
  // A retry or a batched Android upload can arrive out of order. For the same fix
  // timestamp use the most precise sample deterministically, never both samples.
  const ordered = points.filter(p => p.valid !== false && p.latitude != null && p.longitude != null &&
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) &&
    Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180)
    .slice().sort((a,b) => Date.parse(a.fixTime)-Date.parse(b.fixTime) ||
      (accuracyOf(a) ?? Infinity)-(accuracyOf(b) ?? Infinity) ||
      Number(a.latitude)-Number(b.latitude) || Number(a.longitude)-Number(b.longitude));
  let previousFix = null;
  for (const point of ordered) {
    const time = Date.parse(point.fixTime);
    if (Number.isFinite(time) && time === previousFix) { duplicates++; continue; }
    previousFix = time;
    const accuracy = accuracyOf(point);
    if (!Number.isFinite(time) || (accuracy !== null && accuracy > MAX_ACCURACY_M)) { rejected++; continue; }
    const current = { latitude: Number(point.latitude), longitude: Number(point.longitude), accuracy, time };
    if (!anchor) {
      anchor = current; prev = current; firstTime = time; lastTime = time; accepted++;
      segment.push([current.longitude, current.latitude]);
      continue;
    }
    const seconds = (time - lastTime) / 1000;
    if (!(seconds > 0)) { rejected++; continue; }
    if (seconds > MAX_GAP_SECONDS) {
      maxInterval = Math.max(maxInterval, seconds);
      gaps++;
      // These endpoints describe missing coverage, never measured travel.
      // Keep them separate from both the distance sum and the recorded polyline.
      gapDetails.push({ from: new Date(lastTime).toISOString(), to: new Date(time).toISOString(),
        seconds, start: [prev.longitude, prev.latitude], end: [current.longitude, current.latitude],
        straight_distance_m: Number(haversineMeters(prev, current).toFixed(1)) });
      if (segment.length) segments.push(segment);
      segment = [[current.longitude, current.latitude]];
      anchor = current; prev = current; lastTime = time; accepted++;
      continue;
    }
    const step = haversineMeters(prev, current);
    if (step / seconds * 3.6 > MAX_SPEED_KMH) { rejected++; continue; }
    maxInterval = Math.max(maxInterval, seconds);
    maxLinkedInterval = Math.max(maxLinkedInterval, seconds);
    links++;
    const distance = haversineMeters(anchor, current);
    const threshold = Math.max(5, Math.min(NOISE_CAP_M, Math.max(anchor.accuracy ?? 5, accuracy ?? 5) * NOISE_SCALE));
    segment.push([current.longitude, current.latitude]);
    accepted++;
    lastTime = time;
    prev = current;
    if (distance < threshold) { jitter++; continue; }
    meters += distance;
    anchor = current;
  }
  if (segment.length) segments.push(segment);
  return { meters, segments, accepted, rejected, jitter, gaps, gapDetails, duplicates, links,
    firstTime, lastTime, maxInterval, maxLinkedInterval,
    max_accuracy_m: MAX_ACCURACY_M, max_speed_kmh: MAX_SPEED_KMH, max_gap_seconds: MAX_GAP_SECONDS };
}
async function report(company, entry) {
  const trip = await M.one('km_mobile_trips', { entry_id: `eq.${entry.id}`, company: `eq.${company.slug}` });
  const device = trip ? await M.one('km_mobile_devices', { id: `eq.${trip.device_id}` }) : null;
  const vehicle = !device ? await M.one(company.vehicles, { id: `eq.${entry.vehicle_id}` }) : null;
  const deviceId = device ? await M.ensureTraccar(device) : Number(vehicle?.traccar_device_id);
  if (!deviceId) return { distance_km: null, duration_seconds: null, segments: [], provider: 'traccar',
    status: 'sin_gps_suficiente', message: 'Este registro no tiene dispositivo Traccar asociado.' };
  const start = trip ? Date.parse(trip.started_at) : Date.parse(`${entry.date}T${String(entry.time_start).slice(0, 8)}-06:00`);
  let end = trip ? Date.parse(trip.ended_at) : Date.parse(`${entry.date}T${String(entry.time_end).slice(0, 8)}-06:00`);
  if (!trip && end < start) end += 86400000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw A.fail(422, 'Horarios del recorrido inválidos');
  const params = new URLSearchParams({ deviceId: String(deviceId), from: new Date(start).toISOString(), to: new Date(end).toISOString() });
  const [route, summaries] = await Promise.all([request('reports/route', params), request('reports/summary', params).catch(() => [])]);
  // Older relays and direct Traccar return arrays. A local OSRM relay adds an
  // advisory estimate without changing the source positions or persisted distance.
  const positions=Array.isArray(route)?route:route?.positions;
  if(!Array.isArray(positions))throw A.fail(503,'Respuesta GPS inválida');
  const roadMatch=Array.isArray(route)?null:route.road_match;
  const points = positions.filter(p => Number(p.deviceId) === deviceId && p.valid !== false &&
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180 &&
    Date.parse(p.fixTime) >= start && Date.parse(p.fixTime) <= end).map(p => ({...p, latitude:Number(p.latitude), longitude:Number(p.longitude)}))
    .sort((a, b) => Date.parse(a.fixTime) - Date.parse(b.fixTime));
  const strict = calculateRouteDistance(points);
  const localRecovery = recoverCoverageGaps(points, strict);
  // Recuperación controlada para teléfonos que mantienen una ruta continua pero reportan
  // precisión degradada (p. ej. 60–200 m). No se usa en rutas normales y conserva el
  // límite de velocidad para eliminar saltos imposibles.
  const recovered = calculateRouteDistance(points, { maxAccuracyM: 200, noiseScale: 0.5, noiseCapM: 100 });
  const strictKm = strict.links > 0 ? Number((strict.meters / 1000).toFixed(3)) : null;
  const recoveredKm = recovered.links > 0 ? Number((recovered.meters / 1000).toFixed(3)) : null;
  const uniquePointCount = points.length - strict.duplicates;
  const strictCoverage = uniquePointCount ? strict.accepted / uniquePointCount : 0;
  const recoveryUsed = recoveredKm !== null && recovered.accepted >= 6 && strictCoverage < 0.60 &&
    (strictKm === null || recoveredKm > strictKm * 1.35 + 0.5);
  const localRecoveryUsed = !recoveryUsed && localRecovery.recoveredGaps.length > 0;
  const calculated = recoveryUsed ? recovered : localRecoveryUsed ? localRecovery : strict;
  const routeKm = recoveryUsed ? recoveredKm : localRecoveryUsed ? Number((calculated.meters / 1000).toFixed(3)) : strictKm;
  const summary = summaries.find(s => Number(s.deviceId) === deviceId);
  const summaryMeters = summary?.distance == null ? NaN : Number(summary.distance);
  const summaryKm = Number.isFinite(summaryMeters) && summaryMeters >= 0 ? Number((summaryMeters / 1000).toFixed(3)) : null;
  // Normal tracks always use filtered Traccar positions. The raw summary includes
  // the very noise we removed; proximity alone is not evidence of better accuracy.
  // Keep the existing degraded-signal recovery envelope, explicitly marked for review.
  const rejectedLimit = Math.max(3, Math.ceil(uniquePointCount * 0.25));
  const summarySane = recoveryUsed && routeKm !== null && routeKm >= 0.5 && summaryKm !== null &&
    calculated.gaps === 0 && calculated.rejected <= rejectedLimit &&
    summaryKm >= routeKm && summaryKm <= routeKm * 1.18 + 0.25;
  const measuredKm = summarySane ? summaryKm : routeKm;
  const duration = (end - start) / 1000;
  const startGap = calculated.firstTime == null ? null : Math.max(0, (calculated.firstTime-start)/1000);
  const endGap = calculated.lastTime == null ? null : Math.max(0, (end-calculated.lastTime)/1000);
  const roadAdvice=roadMatch?.source==='openstreetmap-osrm'&&roadMatch.estimated===true?
    {...roadMatch,...((startGap>30||endGap>30)&&roadMatch.distance_km!=null?{partial:true,status:'partial'}:{})}:null;
  const qualityIssue = recoveryUsed || localRecoveryUsed || calculated.gaps > 0 || calculated.rejected > rejectedLimit ||
    startGap > 30 || endGap > 30 || calculated.maxInterval > 30;
  // Todos los empleados, incluido Alejandro, usan la distancia GPS habitual de Traccar.
  // El ajuste OSRM se conserva solamente como dato de diagnóstico; nunca sustituye el kilometraje.
  const roadAdjusted=false;
  const km=measuredKm;
  return { provider: 'traccar', distance_km: km, filtered_distance_km: routeKm,
    measured_distance_km:measuredKm,road_adjustment_used:roadAdjusted,
    ...(roadAdvice?{road_match:roadAdvice}:{}),
    strict_distance_km: strictKm, recovered_distance_km: recoveredKm, recovery_used: recoveryUsed || localRecoveryUsed,
    recovered_gap_count: localRecoveryUsed ? localRecovery.recoveredGaps.length : 0,
    recovered_gap_km: localRecoveryUsed ? Number((localRecovery.recoveredMeters / 1000).toFixed(3)) : 0,
    recovered_gap_details: localRecoveryUsed ? localRecovery.recoveredGaps : [],
    strict_point_count: strict.accepted, recovered_point_count: recovered.accepted,
    summary_distance_km: summaryKm, duration_seconds: duration,
    segments: calculated.segments, point_count: calculated.accepted, points_received: points.length,
    points_rejected: calculated.rejected, stationary_or_small_moves: calculated.jitter, gaps: calculated.gaps,
    duplicate_points: calculated.duplicates, start_gap_seconds: startGap, end_gap_seconds: endGap,
    gap_details: calculated.gapDetails,
    incomplete: calculated.gaps > 0 || startGap > 30 || endGap > 30,
    max_interval_seconds: calculated.maxInterval, requires_review: qualityIssue,
    calculation_version: '1.4.6',
    calculation: roadAdjusted ? 'traccar_osrm_validated_v1' : summarySane ? 'summary_degraded_recovery_v5' :
      recoveryUsed ? 'route_haversine_recovered_v5' : localRecoveryUsed ? 'route_local_gap_recovery_v6' : 'route_haversine_filtered_v5',
    max_accuracy_m: calculated.max_accuracy_m, max_speed_kmh: calculated.max_speed_kmh, max_gap_seconds: calculated.max_gap_seconds,
    status: km === null ? 'sin_gps_suficiente' : duration < 180 ? 'recorrido_menor_3_minutos' :
      qualityIssue ? 'gps_incompleto_o_por_revisar' : 'gps_registrado' };
}
function recoverCoverageGaps(points, strict) {
  const result={...strict,segments:[...strict.segments],gapDetails:[],recoveredGaps:[],recoveredMeters:0};
  for(const gap of strict.gapDetails){
    const from=Date.parse(gap.from),to=Date.parse(gap.to);
    const candidates=points.filter(p=>Date.parse(p.fixTime)>=from&&Date.parse(p.fixTime)<=to);
    const route=calculateRouteDistance(candidates,{maxAccuracyM:200,noiseScale:.5,noiseCapM:100});
    // Recover only a locally supported track, anchored by precise fixes. A direct
    // line with no intermediate readings is never added. Never relax the entire trip
    // because poor readings while stopped would manufacture kilometers elsewhere.
    const unique=candidates.length-route.duplicates;
    const coherent=route.firstTime===from&&route.lastTime===to&&route.accepted>=4&&
      route.accepted>=unique*.5&&route.gaps===0&&route.maxInterval<=90&&
      gap.straight_distance_m>=600&&route.meters>=gap.straight_distance_m*.95&&
      route.meters<=gap.straight_distance_m*1.25;
    if(!coherent){result.gapDetails.push(gap);continue;}
    result.recoveredGaps.push({...gap,distance_km:Number((route.meters/1000).toFixed(3)),points:route.accepted,max_interval_seconds:route.maxInterval});
    result.recoveredMeters+=route.meters;result.meters+=route.meters;
    result.segments.push(...route.segments);result.accepted+=route.accepted-2;
    result.rejected=Math.max(0,result.rejected-(route.accepted-2));result.links+=route.links;
  }
  result.gaps=result.gapDetails.length;
  result.maxInterval=Math.max(strict.maxLinkedInterval,...result.gapDetails.map(g=>g.seconds),...result.recoveredGaps.map(g=>g.max_interval_seconds));
  if(result.recoveredGaps.length)result.max_accuracy_m=200;
  return result;
}
module.exports = { configured, report, calculateRouteDistance, recoverCoverageGaps };
