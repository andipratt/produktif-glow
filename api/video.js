// POST /api/video {secret, id, chat}: video 9:16 tanpa teks untuk IG Reels, YT Shorts, FB Reels.
// Bahan (sekali per draft, disimpan di state): foto "sebelum" (meja berantakan, sudut sama) + 4 foto sudut/close-up.
// Musik bebas royalti dari perpustakaan (musik/daftar.json), potongan tepat di ketukan. Render ulang gratis.
import { waitUntil } from '@vercel/functions';
import { buatReels } from '../lib/reels.js';
import { bacaJson, simpanJson, bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';
import { gambar, claude } from '../lib/ai.js';
import { bodyFotoReels, bodyFotoBefore, bodyNaskahReels, bacaJsonModel } from '../lib/agen.js';
import { pilihLagu } from '../lib/musik.js';

export const config = { maxDuration: 300 };

const unitList = (st) => (st.visual && st.visual.length ? st.visual : [{ label: '', pins: st.meta.produk.map((p) => p.pin), img_url: st.img_url, boxes: st.boxes || [] }]);
const ambil = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
const HARGA_FOTO = 1200;
const titikUnit = (u) => Object.fromEntries((u.boxes || []).map((b) => [b.pin, b.titik || [(b.box_2d[0] + b.box_2d[2]) / 2, (b.box_2d[1] + b.box_2d[3]) / 2]]));

async function siapkanNaskah(st) {
  const n = st.meta.naskah_reels;
  if (n && Array.isArray(n.foto_tambahan) && n.foto_tambahan.length) return n;
  st.meta.naskah_reels = { ...(n || {}), ...bacaJsonModel(await claude(bodyNaskahReels(st))) };
  return st.meta.naskah_reels;
}

async function buatFoto(st, no, body) {
  const { buf, mime } = await gambar(body);
  return simpanGambar(`posts/${st.post_id}/reels-${no}-${Date.now().toString(36)}.${mime.includes('jpeg') ? 'jpg' : 'png'}`, buf, mime);
}

// foto "sebelum" + 4 foto tambahan; yang sudah ada tidak dibuat ulang
async function siapkanFoto(st, naskah, units) {
  st.reels_foto = Array.isArray(st.reels_foto) ? st.reels_foto : [];
  const ada = (no) => st.reels_foto.some((r) => r.no === no);
  const tugas = [];
  if (!ada('before')) tugas.push({ no: 'before', body: bodyFotoBefore({ ...st, img_url: units[0].img_url }), versi: 1 });
  (naskah.foto_tambahan || []).slice(0, 4).forEach((f, i) => {
    const no = String(i + 1); if (ada(no)) return;
    const versi = units.length > 1 ? (Number(f.versi) === 2 ? 2 : 1) : 1;
    const p = f.pin ? st.meta.produk.find((x) => Number(x.pin) === Number(f.pin)) : null;
    const u = units[versi - 1] || units[0];
    tugas.push({ no, versi, pin: f.pin || null, body: bodyFotoReels({ ...st, img_url: u.img_url }, f.arah_en || 'a different camera angle of the same desk', p) });
  });
  const hasil = await Promise.all(tugas.map(async (t) => { try { return { no: t.no, versi: t.versi, pin: t.pin || null, img_url: await buatFoto(st, t.no, t.body) }; } catch (e) { return { gagal: e.message }; } }));
  const gagal = hasil.find((h) => h.gagal);
  st.reels_foto.push(...hasil.filter((h) => !h.gagal));
  if (gagal && /402|Insufficient credits/i.test(gagal.gagal)) throw new Error('saldo OpenRouter habis (402). Isi saldo lalu ketik "reels" lagi.');
  return tugas.length;
}

async function kerja(id, chat) {
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const units = unitList(st);
    if (!units[0].img_url) { await kirimTeks(chat, `Foto draft ${id} belum ada, jadi video belum bisa dibuat.`); return; }
    const daftarMusik = (await bacaJson('musik/daftar.json')) || [];
    if (!daftarMusik.length) { await kirimTeks(chat, 'Perpustakaan musik masih kosong. Tambahkan dulu: ketik "musik <link mp3/zip bebas royalti>" atau kirim file audionya ke sini dengan caption "musik".'); return; }
    const naskah = await siapkanNaskah(st);
    const perlu = 1 + 4 - (st.reels_foto || []).filter((r) => r.no === 'before' || /^[1-4]$/.test(r.no)).length;
    if (perlu > 0) await kirimTeks(chat, `Membuat ${perlu} foto untuk video ${id} (meja berantakan + sudut/close-up, sekali saja per draft, ±Rp${(perlu * HARGA_FOTO).toLocaleString('id-ID')}). Video dikirim ±2–3 menit lagi.`);
    await siapkanFoto(st, naskah, units);
    await simpanState(st);

    const lagu = pilihLagu(daftarMusik, st.brief && st.brief.mood);
    const foto = {}, titik = {};
    await Promise.all(units.map(async (u, k) => { const kunci = k ? `utama${k + 1}` : 'utama'; foto[kunci] = await ambil(u.img_url); titik[kunci] = titikUnit(u); }));
    await Promise.all(st.reels_foto.map(async (r) => { foto[r.no] = await ambil(r.img_url); }));
    const unitFoto = units.map((_, k) => st.reels_foto.filter((r) => /^[1-4]$/.test(r.no) && (Number(r.versi) || 1) === k + 1).map((r) => r.no));
    const { mp4, detik, potongan } = await buatReels({ foto, titik, unitFoto, lagu: { buf: await ambil(lagu.url), bpm: lagu.bpm, mulai: lagu.mulai } });
    const url = await simpanGambar(`posts/${id}/video-${Date.now().toString(36)}.mp4`, mp4, 'video/mp4');
    st.reels_url = url; await simpanState(st);
    lagu.dipakai = (lagu.dipakai || 0) + 1; await simpanJson('musik/daftar.json', daftarMusik);
    await kirimVideo(chat, url, `VIDEO ${id} · ±${Math.round(detik)} detik · ${potongan} potongan · musik: ${lagu.judul} (${Math.round(lagu.bpm)} BPM, ${lagu.lisensi})\nSatu file untuk IG Reels, YouTube Shorts, dan Facebook Reels, musik sudah tertanam.`);
    await kirimTeks(chat,
      `TEKS POSTING VIDEO ${id}\n\n=== INSTAGRAM REELS ===\n${st.meta.caption_ig || '-'}\n\n` +
      `=== YOUTUBE SHORTS ===\nJudul: ${naskah.judul_shorts || st.meta.tema + ' #shorts'}\nDeskripsi: ${st.meta.caption_ig || '-'}\n\n` +
      `=== FACEBOOK REELS ===\n${naskah.caption_fb || st.meta.caption_threads || '-'}\n\n` +
      `Ketik "reels ${id}" untuk render ulang dengan lagu lain (gratis, foto sudah tersimpan).`);
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
