// Street matching on the PC running the GPS relay. Keeps original coordinates.
// The API may use a fully validated match; partial matches never fill missing coverage.
function localEndpoint(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('OSRM_URL debe ser un servicio local: http://127.0.0.1:5000');
  return url.origin;
}
function meters(a, b) {
  const rad = Math.PI / 180, dLat = (b.latitude-a.latitude)*rad, dLon = (b.longitude-a.longitude)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1, h)));
}
function continuousChunks(points) {
  const ordered = points.slice().sort((a,b) => Date.parse(a.fixTime)-Date.parse(b.fixTime) ||
    (Number(a.accuracy)||0)-(Number(b.accuracy)||0));
  const chunks = []; let group = [], previousTime = null, excluded = 0;
  const finish = () => { if (group.length >= 3) chunks.push(group); group = []; };
  for (const p of ordered) {
    const time = Math.floor(Date.parse(p.fixTime)/1000);
    if (Number.isFinite(time) && time === previousTime) continue;
    previousTime = time;
    const accuracy = p.accuracy == null || p.accuracy === '' ? 25 : Number(p.accuracy);
    if (p.valid === false || p.latitude == null || p.longitude == null ||
        !Number.isFinite(Number(p.latitude)) || !Number.isFinite(Number(p.longitude)) ||
        Math.abs(Number(p.latitude))>90 || Math.abs(Number(p.longitude))>180 ||
        !Number.isFinite(time) || !Number.isFinite(accuracy) || accuracy<0 || accuracy>50) {
      finish(); excluded++; continue;
    }
    const current = {latitude:Number(p.latitude), longitude:Number(p.longitude), time, accuracy};
    const previous = group.at(-1);
    if (previous && (time-previous.time>30 || time<=previous.time ||
        meters(previous,current)/(time-previous.time)*3.6>160)) { finish(); excluded++; }
    group.push(current);
    // Short windows isolate low-confidence fixes instead of rejecting the whole route.
    // Adjacent windows overlap at one boundary point, counted only once.
    if (group.length === 20) { chunks.push(group); group = [current]; }
  }
  // A two-point tail overlaps the previous chunk and needs one more observation.
  if (group.length === 2 && chunks.length && chunks.at(-1).at(-1) === group[0]) {
    const prior = chunks.pop(); chunks.push(prior.slice(0,-1)); group.unshift(prior.at(-2));
  }
  finish();
  return {chunks, excluded};
}
function checkedMatch(data, chunk) {
  if (data?.code !== 'Ok' || data.matchings?.length !== 1 || data.tracepoints?.length !== chunk.length) return null;
  const match = data.matchings[0], distance = Number(match.distance), confidence = Number(match.confidence);
  const coordinates = match.geometry?.type === 'LineString' ? match.geometry.coordinates : null;
  if (!Number.isFinite(distance) || distance<0 || !Number.isFinite(confidence) || confidence<0.8 ||
      !Array.isArray(coordinates) || coordinates.length<2 || coordinates.length>20000 ||
      coordinates.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)) return null;
  for (let i=0;i<chunk.length;i++) {
    const snapped=data.tracepoints[i];
    if (!snapped || snapped.matchings_index!==0 || !Array.isArray(snapped.location) ||
        !Number.isFinite(snapped.location[0]) || !Number.isFinite(snapped.location[1]) ||
        Math.abs(snapped.location[0])>180 || Math.abs(snapped.location[1])>90 ||
        meters(chunk[i],{longitude:snapped.location[0],latitude:snapped.location[1]})>Math.max(25,chunk[i].accuracy*2)) return null;
  }
  const raw = chunk.slice(1).reduce((sum,p,i)=>sum+meters(chunk[i],p),0);
  // Sparse fixes, stationary jitter and implausible detours are not evidence of a road route.
  if (raw<30 || distance<raw*0.65 || distance>raw*1.5+30) return null;
  return {distance, confidence, coordinates};
}
async function estimateRoads(points, {endpoint, fetcher=fetch, budgetMs=7500}={}) {
  const base = localEndpoint(endpoint);
  const result = {source:'openstreetmap-osrm', estimated:true, status:base?'no_match':'disabled',
    distance_km:null, segments:[], matched_points:0, points_received:points.length,
    matched_chunks:0, rejected_chunks:0, gaps_excluded:0, partial:true};
  if (!base) return result;
  const {chunks,excluded}=continuousChunks(points);result.gaps_excluded=excluded;
  if (!chunks.length) return result;
  // Route matching can involve several 20-fix chunks; allow more time without blocking GPS ingestion.
  const signal=AbortSignal.timeout(budgetMs), matched=new Set();let total=0, minConfidence=1, unavailable=false;
  for (const chunk of chunks) {
    if (signal.aborted) { unavailable=true; break; }
    try {
      const coords=chunk.map(p=>`${p.longitude},${p.latitude}`).join(';');
      const query=new URLSearchParams({timestamps:chunk.map(p=>p.time).join(';'),
        radiuses:chunk.map(p=>Math.max(5,p.accuracy)).join(';'),overview:'full',geometries:'geojson',gaps:'split',tidy:'false'});
      const response=await fetcher(`${base}/match/v1/driving/${coords}?${query}`,{signal,redirect:'error',headers:{Accept:'application/json'}});
      if (!response.ok) throw Error('OSRM no disponible');
      const accepted=checkedMatch(await response.json(),chunk);
      if (!accepted) {result.rejected_chunks++;continue;}
      total+=accepted.distance;minConfidence=Math.min(minConfidence,accepted.confidence);
      result.segments.push(accepted.coordinates);result.matched_chunks++;
      for (const p of chunk) matched.add(p.time);
    } catch { unavailable=true; break; }
  }
  result.matched_points=matched.size;
  result.partial=excluded>0 || matched.size<new Set(points.map(p=>Math.floor(Date.parse(p.fixTime)/1000))).size || unavailable;
  if (result.matched_chunks) {
    result.distance_km=Number((total/1000).toFixed(3));result.confidence_min=minConfidence;
    result.status=result.partial?'partial':'matched';
  } else if (unavailable) {result.status='unavailable';result.reason=signal.aborted?'osrm_timeout':'osrm_request_failed';}
  return result;
}
module.exports={localEndpoint,continuousChunks,checkedMatch,estimateRoads};
