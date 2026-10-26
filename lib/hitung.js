// Penghitung kunjungan & klik link bio di Upstash Redis (gratis via Vercel Marketplace).
// Sengaja TIDAK di Vercel Blob: Blob Hobby hanya 2.000 operasi tulis/bulan, dan kalau habis seluruh sistem berhenti 30 hari.
// Kalau Redis belum dipasang, penghitung diam (tidak error) dan laporan memberi tahu.
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const adaRedis = () => !!(url() && token());

async function pipa(perintah) {
  const r = await fetch(`${url()}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify(perintah) });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).map((x) => x.result);
}

export const tglWIB = (ms = Date.now()) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const SIMPAN = 400 * 86400; // simpan ±13 bulan

// j: "v" (kunjungan) | "k" (klik produk)
export async function catat({ j, id, pin, src }) {
  if (!adaRedis()) return false;
  const s = /^[a-z]{1,8}$/.test(String(src || '')) ? src : 'lain';
  const d = tglWIB();
  if (j === 'v') { await pipa([['HINCRBY', `ng:v:${d}`, s, 1], ['EXPIRE', `ng:v:${d}`, SIMPAN]]); return true; }
  if (j === 'k' && /^PG-[0-9A-Za-z-]{6,24}$/.test(String(id || '')) && /^\d{1,2}$/.test(String(pin || ''))) {
    await pipa([['HINCRBY', `ng:k:${d}`, `${id}|${pin}|${s}`, 1], ['EXPIRE', `ng:k:${d}`, SIMPAN]]); return true;
  }
  return false;
}

// Rekap n hari terakhir (sampai kemarin bila sampaiKemarin): { hari: [...], v: {src: n}, k: [{id, pin, src, n}] }
export async function rekap(dariMs, sampaiMs) {
  if (!adaRedis()) return null;
  const hari = [];
  for (let t = dariMs; t < sampaiMs; t += 86400e3) hari.push(tglWIB(t));
  const res = await pipa(hari.flatMap((d) => [['HGETALL', `ng:v:${d}`], ['HGETALL', `ng:k:${d}`]]));
  const v = {}, kMap = new Map();
  const pasang = (arr) => { const o = []; for (let i = 0; i + 1 < (arr || []).length; i += 2) o.push([arr[i], Number(arr[i + 1])]); return o; };
  hari.forEach((_, i) => {
    for (const [s, n] of pasang(res[i * 2])) v[s] = (v[s] || 0) + n;
    for (const [key, n] of pasang(res[i * 2 + 1])) kMap.set(key, (kMap.get(key) || 0) + n);
  });
  const k = [...kMap].map(([key, n]) => { const [id, pin, src] = key.split('|'); return { id, pin: Number(pin), src, n }; });
  return { hari, v, k };
}
