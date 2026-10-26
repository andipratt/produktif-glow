// POST /api/video {secret, id, chat}: Reels 9:16 dari draft.
// Sekali per draft: 2 foto sudut tambahan per versi (AI, ±Rp1.200/foto) + deteksi produk di tiap sudut, disimpan di state.
// Setelah itu video bisa dibuat ulang gratis (render canvas + ffmpeg, tanpa AI).
import { waitUntil } from '@vercel/functions';
import { buatReels } from '../lib/reels.js';
import { renderSlide } from '../lib/render.js';
import { bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';
import { gambar, claude } from '../lib/ai.js';
import { bodySudut, SUDUT_REELS, bodyPetaInsight, bacaJsonModel } from '../lib/agen.js';
import { deteksiSatu } from '../lib/deteksi.js';

export const config = { maxDuration: 300 };

const unitList = (st) => (st.visual && st.visual.length ? st.visual : [{ label: '', pins: st.meta.produk.map((p) => p.pin), img_url: st.img_url, boxes: st.boxes || [] }]);
const produkUnit = (st, u) => st.meta.produk.filter((p) => u.pins.includes(Number(p.pin)));
const ambil = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
const keUri = (buf, mime = 'image/png') => `data:${mime};base64,${buf.toString('base64')}`;
const kePeta = (boxes) => ({
  boxes: Object.fromEntries((boxes || []).map((b) => [b.pin, b.box_2d])),
  titik: Object.fromEntries((boxes || []).filter((b) => b.titik).map((b) => [b.pin, b.titik])),
});
const tanggalWIB = () => { const d = new Date(Date.now() + 7 * 3600e3).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`; };

async function siapkanSudut(st, u, k) {
  if (Array.isArray(u.sudut) && u.sudut.length) return;
  const view = { ...st, img_url: u.img_url, meta: { ...st.meta, produk: produkUnit(st, u) } };
  const hasil = await Promise.all(SUDUT_REELS.map(async (s, i) => {
    try {
      const { buf, mime } = await gambar(bodySudut(view, s));
      const url = await simpanGambar(`posts/${st.post_id}/sudut-u${k}-${i}-${Date.now().toString(36)}.${mime.includes('jpeg') ? 'jpg' : 'png'}`, buf, mime);
      const uri = keUri(buf, mime);
      const det = await Promise.all(view.meta.produk.map(async (p) => { const b = await deteksiSatu(p, uri); return b ? { pin: p.pin, box_2d: b.box, ...(b.titik ? { titik: b.titik } : {}) } : null; }));
      return { img_url: url, boxes: det.filter(Boolean) };
    } catch { return null; }
  }));
  u.sudut = hasil.filter((h) => h && h.boxes.length);
}

async function siapkanInsight(st) {
  const ins = Array.isArray(st.meta.insight) ? st.meta.insight : [];
  if (!ins.length || ins.every((i) => i.pin)) return ins;
  if (Array.isArray(st.insight_pin) && st.insight_pin.length === ins.length) return ins.map((i, k) => ({ ...i, pin: st.insight_pin[k] }));
  try {
    const j = bacaJsonModel(await claude(bodyPetaInsight(st.meta.produk, ins)));
    st.insight_pin = (j.pin || []).map(Number);
  } catch { st.insight_pin = ins.map((_, k) => (st.meta.produk[k] || {}).pin); }
  return ins.map((i, k) => ({ ...i, pin: st.insight_pin[k] }));
}

async function kerja(id, chat) {
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const units = unitList(st);
    if (!units[0].img_url) { await kirimTeks(chat, `Foto draft ${id} belum ada, jadi Reels belum bisa dibuat.`); return; }
    const baru = units.some((u) => !(Array.isArray(u.sudut) && u.sudut.length));
    if (baru) {
      await kirimTeks(chat, `Menyiapkan ${units.length * SUDUT_REELS.length} foto dari sudut lain untuk Reels ${id} (sekali saja per draft, ±Rp${(units.length * SUDUT_REELS.length * 1250).toLocaleString('id-ID')}). Video dikirim ±2–3 menit lagi.`);
      await Promise.all(units.map((u, k) => siapkanSudut(st, u, k)));
    }
    const insight = await siapkanInsight(st);
    st.visual = units;
    await simpanState(st);

    const dataUnits = await Promise.all(units.map(async (u) => {
      const utama = { img: await ambil(u.img_url), ...kePeta(u.boxes) };
      const lain = await Promise.all((u.sudut || []).map(async (s) => ({ img: await ambil(s.img_url), ...kePeta(s.boxes) })));
      return { label: u.label, sudut: [utama, ...lain] };
    }));
    const produk = st.meta.produk.map((p) => ({ ...p, unit: Math.max(0, units.findIndex((u) => u.pins.includes(Number(p.pin)))) }));
    const grup = units.length > 1 ? units.map((u) => ({ label: u.label, pins: u.pins })) : null;
    const kertas = Buffer.from(await renderSlide({ slide: 'kertas', meta: st.meta, judul: st.meta.tema, grup, tanggal: tanggalWIB() }).arrayBuffer());
    const { mp4, detik } = await buatReels({
      pembuka: { kicker: st.meta.hook_kicker, judul: st.meta.hook_judul, sub: st.meta.hook_sub },
      units: dataUnits, produk, insight, kertas, cta: 'barangnya ada di link bio',
    });
    const url = await simpanGambar(`posts/${id}/reels-${Date.now().toString(36)}.mp4`, mp4, 'video/mp4');
    st.reels_url = url; await simpanState(st);
    await kirimVideo(chat, url, `REELS ${id} · ±${Math.round(detik)} detik. Tambahkan musik yang lagi ramai dari library IG saat posting. Tekan tombol Reels lagi untuk render ulang (gratis).`);
  } catch (e) {
    await kirimTeks(chat, `GAGAL membuat Reels ${id}: ${String(e.message || e).slice(0, 300)}`).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(kerja(String(d.id), String(d.chat || CHAT_DEFAULT)));
  return res.status(200).json({ ok: true });
}
