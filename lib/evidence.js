const { sb } = require('../api/_config');
const bucket = () => process.env.SUPPORT_BUCKET || 'bitacora-soportes';
const safePath = value => String(value).split('/').map(encodeURIComponent).join('/');

async function verifyEvidence(path, company, kind) {
  if (typeof path !== 'string' || !path.startsWith(`${company}/${kind}/`) || path.includes('..')) return false;
  try {
    const info = await sb(`/storage/v1/object/info/${encodeURIComponent(bucket())}/${safePath(path)}`);
    const allowed=['image/jpeg','image/png','image/webp',...(kind==='support'?['application/pdf']:[])];
    return allowed.includes(info.content_type || info.contentType || info.metadata?.mimetype);
  } catch (error) {
    if (/Supabase (400|404):/.test(error.message)) return false;
    throw error;
  }
}

function detectedType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii',0,5) === '%PDF-') return 'application/pdf';
  return null;
}
module.exports = { bucket, safePath, verifyEvidence, detectedType };
