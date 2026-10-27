// POST /api/video {secret, id, chat}: video 9:16 (IG Reels, YT Shorts, FB Reels) dari draft.
// Naskah dari content agent; foto tambahan (sudut lain + close-up detail) dibuat sekali per draft lalu disimpan,
// jadi render ulang gratis. Render: canvas + ffmpeg (lib/reels.js).
import { waitUntil } from '@vercel/functions';
import { buatReels } from '../lib/reels.js';
import { renderSlide } from '../lib/render.js';
import { bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';
import { gambar, claude } from '../lib/ai.js';
import { bodyFotoReels, bodyNaskahReels, bacaJsonModel } from '../lib/agen.js';

export const config = { maxDuration: 300 };

const unitList = (st) => (st.visual && st.visual.length ? st.visual : [{ label: '', pins: st.meta.produk.map((p) => p.pin), img_url: st.img_url, boxes: st.boxes || [] }]);
const ambil = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
const tanggalWIB = () => { const d = new Date(Date.now() + 7 * 3600e3).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`; };
const HARGA_FOTO = 1200;

async function siapkanNaskah(st) {
  const n = st.meta.naskah_reels;
  if (n && Array.isArray(n.adegan) && n.adegan.length) return n;
  st.meta.naskah_reels = bacaJsonModel(await claude(bodyNaskahReels(st)));
  return st.meta.naskah_reels;
}

// foto tambahan per naskah (maks 4), disimpan di st.reels_foto supaya tidak dibuat ulang
async function siapkanFoto(st, naskah, units) {
  const minta = (Array.isArray(naskah.foto_tambahan) ? naskah.foto_tambahan : []).slice(0, 4);
  st.reels_foto = Array.isArray(st.reels_foto) ? st.reels_foto : [];
  const kurang = minta.map((f, i) => ({ ...f, no: String(i + 1) })).filter((f) => !st.reels_foto.some((r) => r.no === f.no));
  if (!kurang.length) return 0;
  const hasil = await Promise.all(kurang.map(async (f) => {
    try {
      const p = f.pin ? st.meta.produk.find((x) => Number(x.pin) === Number(f.pin)) : null;
      const u = (p && units.find((uu) => uu.pins.includes(Number(p.pin)))) || units[0];
      const { buf, mime } = await gambar(bodyFotoReels({ ...st, img_url: u.img_url }, f.arah_en || 'a different camera angle of the same desk', p));
      const url = await simpanGambar(`posts/${st.post_id}/reels-foto${f.no}-${Date.now().toString(36)}.${mime.includes('jpeg') ? 'jpg' : 'png'}`, buf, mime);
      return { no: f.no, pin: f.pin || null, img_url: url };
    } catch { return null; }
  }));
  const ok = hasil.filter(Boolean);
  st.reels_foto.push(...ok);
  return ok.length;
}

async function kerja(id, chat) {
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const units = unitList(st);
    if (!units[0].img_url) { await kirimTeks(chat, `Foto draft ${id} belum ada, jadi video belum bisa dibuat.`); return; }
    const naskah = await siapkanNaskah(st);
    const perlu = (naskah.foto_tambahan || []).slice(0, 4).filter((_, i) => !(st.reels_foto || []).some((r) => r.no === String(i + 1))).length;
    if (perlu) await kirimTeks(chat, `Membuat ${perlu} foto tambahan untuk video ${id} (sudut lain & close-up detail, sekali saja per draft, ±Rp${(perlu * HARGA_FOTO).toLocaleString('id-ID')}). Video dikirim ±2–3 menit lagi.`);
    await siapkanFoto(st, naskah, units);
    await simpanState(st);

    const foto = {}, fokus = {};
    await Promise.all(units.map(async (u, k) => {
      const kunci = k ? `utama${k + 1}` : 'utama';
      foto[kunci] = await ambil(u.img_url);
      fokus[kunci] = Object.fromEntries((u.boxes || []).map((b) => [b.pin, b.titik || [(b.box_2d[0] + b.box_2d[2]) / 2, (b.box_2d[1] + b.box_2d[3]) / 2]]));
    }));
    await Promise.all((st.reels_foto || []).map(async (r) => { foto[r.no] = await ambil(r.img_url); }));
    const grup = units.length > 1 ? units.map((u) => ({ label: u.label, pins: u.pins })) : null;
    const kertas = Buffer.from(await renderSlide({ slide: 'kertas', meta: st.meta, judul: st.meta.tema, grup, tanggal: tanggalWIB() }).arrayBuffer());
    const { mp4, detik } = await buatReels({ foto, fokus, naskah, insight: st.meta.insight || [], kertas });
    const url = await simpanGambar(`posts/${id}/video-${Date.now().toString(36)}.mp4`, mp4, 'video/mp4');
    st.reels_url = url; await simpanState(st);
    await kirimVideo(chat, url, `VIDEO ${id} · ±${Math.round(detik)} detik · 1080x1920\nSatu file untuk IG Reels, YouTube Shorts, dan Facebook Reels. Tambahkan musik yang lagi ramai dari library tiap aplikasi saat posting.`);
    await kirimTeks(chat,
      `TEKS POSTING VIDEO ${id}\n\n=== INSTAGRAM REELS ===\n${st.meta.caption_ig || '-'}\n\n` +
      `=== YOUTUBE SHORTS ===\nJudul: ${naskah.judul_shorts || st.meta.tema + ' #shorts'}\nDeskripsi: ${st.meta.caption_ig || '-'}\n\n` +
      `=== FACEBOOK REELS ===\n${naskah.caption_fb || st.meta.caption_threads || '-'}\n\n` +
      'Ketik "reels ' + id + '" kapan saja untuk render ulang (gratis, foto tambahan sudah tersimpan).');
  } catch (e) {
    await kirimTeks(chat, `GAGAL membuat video ${id}: ${String(e.message || e).slice(0, 300)}`).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(kerja(String(d.id), String(d.chat || CHAT_DEFAULT)));
  return res.status(200).json({ ok: true });
}
