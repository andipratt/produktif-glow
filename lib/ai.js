// Panggilan langsung ke Claude dan OpenRouter. API key hanya dibaca dari environment variable Vercel.
import { catatBiayaClaude } from './hitung.js';
// Gangguan sementara (429 rate/cek saldo lambat, 500/502/503/504/529 server sibuk) dicoba ulang otomatis sampai 3x
// dengan jeda bertambah (±3, 8, 15 dtk). 402 (saldo habis) dan error lain langsung dilaporkan.
const SEMENTARA = new Set([429, 500, 502, 503, 504, 529]);
async function post(url, headers, body, label) {
  for (let coba = 0; ; coba++) {
    let r, t;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
      t = await r.text();
    } catch (e) {
      if (coba < 3) { await new Promise((ok) => setTimeout(ok, [3000, 8000, 15000][coba])); continue; }
      throw new Error(`${label}: koneksi gagal (${e.message})`);
    }
    let j; try { j = JSON.parse(t); } catch { j = null; }
    if (r.ok && j) return j;
    // video: hanya 429 (permintaan ditolak sebelum diproses) yang aman diulang, supaya tidak tertagih dua kali
    if ((label === 'Video' ? r.status === 429 : SEMENTARA.has(r.status)) && coba < 3) {
      const tunggu = Number(r.headers.get('retry-after')) * 1000 || [3000, 8000, 15000][coba];
      await new Promise((ok) => setTimeout(ok, Math.min(tunggu, 20000)));
      continue;
    }
    throw new Error(`${label} ${r.status}: ${(j && (j.error && (j.error.message || j.error))) || t.slice(0, 200)}`);
  }
}

export async function claude(body) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY belum dipasang di Vercel');
  const j = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body, 'Claude');
  catatBiayaClaude(body.model, j.usage).catch(() => {});
  return (j.content || []).map((c) => c.text || '').join('');
}

const orHeaders = () => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY belum dipasang di Vercel');
  return { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://ngemeja.vercel.app', 'X-Title': 'ngemeja' };
};

// Buat/edit foto. Balikan: { buf, mime }
export async function gambar(body) {
  const j = await post('https://openrouter.ai/api/v1/images', orHeaders(), body, 'Foto');
  const d = (j.data || [])[0];
  if (!d || !d.b64_json) throw new Error('Foto: model tidak mengembalikan gambar');
  return { buf: Buffer.from(d.b64_json, 'base64'), mime: d.media_type || 'image/png' };
}

export async function chatOR(body) {
  const j = await post('https://openrouter.ai/api/v1/chat/completions', orHeaders(), body, 'Deteksi');
  return ((j.choices || [])[0] || {}).message?.content || '';
}

// ---------- Video AI (OpenRouter /api/v1/videos, asinkron) ----------
export async function mulaiVideo(body) {
  return post('https://openrouter.ai/api/v1/videos', orHeaders(), body, 'Video');
}
export async function cekVideo(job) {
  const url = new URL(job.polling_url || `/api/v1/videos/${job.id}`, 'https://openrouter.ai');
  let r, t;
  try { r = await fetch(url, { headers: orHeaders() }); t = await r.text(); } catch { return { status: job.status || 'in_progress' }; }
  // gangguan sesaat saat mengecek status: anggap masih diproses, dicek lagi 15 dtk kemudian
  if (SEMENTARA.has(r.status)) return { status: job.status || 'in_progress' };
  if (!r.ok) throw new Error(`Video ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}
export async function unduhVideo(job) {
  const u = (job.unsigned_urls && job.unsigned_urls[0]) || `https://openrouter.ai/api/v1/videos/${job.id}/content?index=0`;
  const r = await fetch(u, { headers: u.startsWith('https://openrouter.ai/api/') ? orHeaders() : undefined });
  if (!r.ok) throw new Error(`Unduh video ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Saldo & pemakaian OpenRouter
export async function saldoOpenRouter() {
  const [c, k] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/credits', { headers: orHeaders() }).then((r) => r.json()).catch(() => ({})),
    fetch('https://openrouter.ai/api/v1/key', { headers: orHeaders() }).then((r) => r.json()).catch(() => ({})),
  ]);
  const d = c.data || {}, kk = k.data || {};
  return { total: Number(d.total_credits), terpakai: Number(d.total_usage), hari: Number(kk.usage_daily), minggu: Number(kk.usage_weekly), bulan: Number(kk.usage_monthly), batasKey: kk.limit == null ? null : Number(kk.limit), sisaKey: kk.limit_remaining == null ? null : Number(kk.limit_remaining) };
}
