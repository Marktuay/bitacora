

function normalizePosition(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_PAYLOAD");
  const nested = input.location && typeof input.location === "object" && !Array.isArray(input.location);
  const location = nested ? input.location : input;
  const coords = nested ? location.coords : input;
  if (!coords || typeof coords !== "object" || Array.isArray(coords)) throw new Error("MISSING_COORDINATES");
  const numeric = (value, min, max, optional = false, negativeUnknown = false) => {
    if (optional && (value === null || value === undefined || value === "")) return null;
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new Error("INVALID_NUMBER");
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("INVALID_NUMBER");
    if (optional && negativeUnknown && number === -1) return null;
    if (number < min || number > max) throw new Error("NUMBER_OUT_OF_RANGE");
    return number;
  };
  const flag = (value, fallback) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    throw new Error("INVALID_BOOLEAN");
  };
  const device = input.device_id ?? input.deviceid ?? input.id;
  if (typeof device !== "string" && typeof device !== "number") throw new Error("MISSING_DEVICE");
  const uniqueId = String(device).trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(uniqueId)) throw new Error("INVALID_DEVICE");
  const stamp = location.timestamp ?? input.timestamp;
  if (stamp === undefined || stamp === null || typeof stamp === "boolean" || String(stamp).trim() === "") throw new Error("MISSING_TIMESTAMP");
  let time;
  if (/^\d+(\.\d+)?$/.test(String(stamp))) {
    const value = Number(stamp);
    time = value >= 1e12 ? value : value * 1000;
  } else {
    if (typeof stamp !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(stamp)) throw new Error("TIMESTAMP_REQUIRES_TIMEZONE");
    time = Date.parse(stamp);
  }
  if (!Number.isFinite(time) || time < now - 30*86400000 || time > now + 300000) throw new Error("INVALID_TIMESTAMP");
  let lat = nested ? coords.latitude : input.lat;
  let lon = nested ? coords.longitude : input.lon;
  if (!nested && typeof input.location === "string" && lat === undefined && lon === undefined) {
    const pieces = input.location.split(",");
    if (pieces.length !== 2) throw new Error("INVALID_LOCATION");
    [lat, lon] = pieces;
  }
  const speed = numeric(coords.speed, 0, nested ? 550 : 1000, true, true);
  const unit = nested ? "mps" : String(input.speed_unit ?? "knots");
  if (!["mps","knots","kmh"].includes(unit)) throw new Error("INVALID_SPEED_UNIT");
  const speedKmh = speed === null ? null : speed * (unit === "mps" ? 3.6 : unit === "knots" ? 1.852 : 1);
  const battery = nested
    ? numeric(location.battery?.level,0,1,true,true)
    : numeric(input.batt,0,100,true,true);
  return {
    uniqueId,
    position: {
      recorded_at: new Date(time).toISOString(),
      latitude: numeric(lat,-90,90), longitude: numeric(lon,-180,180),
      accuracy_m: numeric(coords.accuracy,0,99999,true,true),
      speed_kmh: speedKmh,
      heading_deg: numeric(nested ? coords.heading : (input.bearing ?? input.heading),0,360,true,true),
      altitude_m: numeric(coords.altitude,-1500,100000,true),
      battery_pct: battery === null ? null : battery * (nested ? 100 : 1),
      valid: flag(input.valid ?? location.valid,true),
      mock: flag(location.mock ?? input.mock,false),
      source: nested ? "traccar-json" : "osmand"
    }
  };
}


const respond = (status, data, extras = {}) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json","Cache-Control":"no-store",...extras}
});
async function readLimited(req) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk,offset); offset+=chunk.byteLength; }
  return new TextDecoder("utf-8",{fatal:true}).decode(result);
}
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return respond(200,{ok:true,service:"traccar-ingest",version:"1.0.0",requires_device_key:true});
  }
  if (!["GET","POST"].includes(req.method)) return respond(405,{ok:false,error:"METHOD_NOT_ALLOWED"},{Allow:"GET, POST"});
  // The GPS token grants ingestion only. Never put a Supabase administrator key on a phone.
  const header = req.headers.get("authorization") ?? "";
  const token = req.headers.get("x-device-token") ??
    (header.startsWith("Bearer ") ? header.slice(7) : null) ?? url.searchParams.get("token");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return respond(401,{ok:false,error:"UNAUTHORIZED"});
  let normalized;
  try {
    if (url.search.length > 8192) return respond(413,{ok:false,error:"REQUEST_TOO_LARGE"});
    let input = Object.fromEntries(url.searchParams);
    delete input.token;
    if (req.method === "POST") {
      const raw = await readLimited(req);
      if (raw.trim()) {
        const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (type === "application/json") {
          const body = JSON.parse(raw);
          if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_PAYLOAD");
          input = {...input,...body};
        } else if (type === "application/x-www-form-urlencoded" || type === "" || type === "text/plain") {
          input = {...input,...Object.fromEntries(new URLSearchParams(raw))};
        } else return respond(415,{ok:false,error:"UNSUPPORTED_CONTENT_TYPE"});
      }
    }
    normalized = normalizePosition(input);
  } catch (error) {
    return respond(error?.message === "BODY_TOO_LARGE" ? 413 : 400,{ok:false,error:"INVALID_POSITION"});
  }
  try {
    const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
    const base = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
    if (!base || !key) return respond(503,{ok:false,error:"SERVICE_UNAVAILABLE"});
    const headers = {"Content-Type":"application/json",apikey:key};
    if (key.startsWith("eyJ")) headers.Authorization = "Bearer "+key;
    const result = await fetch(base.replace(/\/$/,"")+"/rest/v1/rpc/km_ingest_position",{
      method:"POST",headers,signal:AbortSignal.timeout(10000),
      body:JSON.stringify({p_unique_id:normalized.uniqueId,p_token_hash:hash,p_position:normalized.position})
    });
    if (!result.ok) return respond(503,{ok:false,error:"STORAGE_UNAVAILABLE"});
    const body = await result.json();
    if (body.code === "UNAUTHORIZED") return respond(401,{ok:false,error:"UNAUTHORIZED"});
    if (body.code === "RATE_LIMITED") return respond(429,{ok:false,error:"RATE_LIMITED"},{"Retry-After":"60"});
    if (!body.ok) return respond(400,{ok:false,error:"INVALID_POSITION"});
    // Acknowledge only after the database has committed, including identical retries.
    return respond(200,{ok:true,duplicate:body.duplicate === true});
  } catch {
    return respond(503,{ok:false,error:"STORAGE_UNAVAILABLE"});
  }
});

