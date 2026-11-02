

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



module.exports = { normalizePosition };

