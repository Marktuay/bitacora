// In-memory sliding window rate limiter for authentication endpoints
const attempts = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(req, options = {}) {
  // Allow disabling or resetting in tests if needed via env
  if (process.env.BITACORA_DISABLE_RATE_LIMIT === 'true') {
    return { allowed: true, remaining: 999, retryAfter: 0 };
  }

  const limit = options.limit || 5;
  const windowMs = options.windowMs || 60 * 1000;
  const ip = getClientIp(req);
  const now = Date.now();

  const record = attempts.get(ip);
  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (record.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfter };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, retryAfter: 0 };
}

function resetRateLimit(req) {
  const ip = getClientIp(req);
  attempts.delete(ip);
}

function clearAll() {
  attempts.clear();
}

module.exports = { checkRateLimit, resetRateLimit, clearAll, getClientIp };
