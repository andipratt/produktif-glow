// POST /api/video {secret, id, chat, lanjut?}: video realistis satu shot (IG Reels, YT Shorts, FB Reels).
// 1) foto kunci 9:16 dari setup (sekali per draft)  2) video AI 8 dtk: kamera geser pelan + suasana hidup
// 3) teks 2 kata di tengah. Pembuatan video makan beberapa menit, jadi fungsi ini memeriksa status berkala dan
// menyambung dirinya sendiri kalau waktu habis (job tersimpan di state).
import { waitUntil } from '@vercel/functions';
import { selesaikanVideo, frameGeser } from '../lib/reels.js';
import { bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';
import { gambar, claude, mulaiVideo, cekVideo, unduhVideo } from '../lib/ai.js';
import { bodyKeyframe916, bodyVideoAI, MODEL_VIDEO, bodyNaskahReels, bacaJsonModel } from '../lib/agen.js';

export const config = { maxDuration: 300 };
const KURS = 16500;
const DOMAIN = () => process.env.VERCEL_PROJECT_PRODUCTION_URL || 'ngemeja.vercel.app';
const unitList = (st) => (st.visual && st.visual.length ? st.visual : [{ label: '', pins: st.meta.produk.map((p) => p.pin), img_url: st.img_url }]);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function siapkanNaskah(st) {
  const n = st.meta.naskah_reels || {};
  if (n.jenis_meja && !/pegal|betah|nyaman|anti|fokus|rapi|produktif|semangat|capek|chaos/.test(n.jenis_meja)) return n;
  delete n.jenis_meja;
  try { st.meta.naskah_reels = { ...n, ...bacaJsonModel(await claude(bodyNaskahReels(st))) }; } catch { st.meta.naskah_reels = n; }
  const m = st.meta.naskah_reels;
  if (!m.jenis_meja) m.jenis_meja = String(st.meta.kategori || 'kerja').replace(/^meja-/, '').replace(/-/g, ' ');
  m.jenis_meja = String(m.jenis_meja).replace(/^ngemeja\s+/i, '').toLowerCase().split(/\s+/).slice(0, 4).join(' ');
  // jenis meja = siapa/bentuk/lokasi meja, bukan masalah atau perasaan
  if (/pegal|betah|nyaman|anti|fokus|rapi|produktif|semangat|capek|chaos/.test(m.jenis_meja)) {
    const sb = (st.brief && st.brief.sumbu) || {};
    m.jenis_meja = String(sb.siapa || sb.ruang || st.meta.kategori || 'kerja').toLowerCase().replace(/^meja-/, '').replace(/[()]/g, '').split(/\s+/).slice(0, 3).join(' ');
  }
  return m;
}

function sambung(id, chat) {
  return fetch(`https://${DOMAIN()}/api/video`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: process.env.BOT_SECRET, id, chat, lanjut: true }) });
}

async function kerja(id, chat, lanjut, baru) {
  const mulaiFn = Date.now();
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const u = unitList(st)[unitList(st).length - 1]; // post dua versi: versi terakhir (yang paling "jadi")
    if (!u.img_url) { await kirimTeks(chat, `Foto draft ${id} belum ada, jadi video belum bisa dibuat.`); return; }
    const naskah = await siapkanNaskah(st);

    let job = st.video_job;
    // sudah pernah jadi: kirim ulang gratis (kecuali minta dibuat baru)
    if (!baru && !lanjut && job && job.status === 'completed' && st.reels_url) {
      await kirimVideo(chat, st.reels_url, `VIDEO ${id} (yang sudah jadi). Ketik "reels baru ${id}" kalau mau dibuat ulang.`);
      return;
    }
    const masihJalan = job && ['pending', 'in_progress'].includes(job.status) && Date.now() - job.mulai < 15 * 60e3;
    if (masihJalan && !lanjut) await kirimTeks(chat, `Video ${id} masih dibuat AI, aku cek terus dan kirim begitu jadi.`);
    // job baru (pertama kali, diminta baru, atau job lama gagal/kedaluwarsa)
    if (baru || !job || (!masihJalan && job.status !== 'completed')) {
      if (!st.keyframe_url) {
        const { buf, mime } = await gambar(bodyKeyframe916({ ...st, img_url: u.img_url }));
        st.keyframe_url = await simpanGambar(`posts/${id}/keyframe916-${Date.now().toString(36)}.${mime.includes('jpeg') ? 'jpg' : 'png'}`, buf, mime);
      }
      if (!st.frame_urls) {
        const [a, b] = await frameGeser(Buffer.from(await (await fetch(st.keyframe_url)).arrayBuffer()));
        st.frame_urls = [await simpanGambar(`posts/${id}/frame-a-${Date.now().toString(36)}.jpg`, a, 'image/jpeg'), await simpanGambar(`posts/${id}/frame-b-${Date.now().toString(36)}.jpg`, b, 'image/jpeg')];
      }
      const j = await mulaiVideo(bodyVideoAI(st.frame_urls[0], st.frame_urls[1], naskah));
      job = st.video_job = { id: j.id, polling_url: j.polling_url, status: j.status, mulai: Date.now() };
      await simpanState(st);
      await kirimTeks(chat, `Video ${id} sedang dibuat AI (±1–4 menit, ±Rp${Math.round(MODEL_VIDEO.usdPerDetik * MODEL_VIDEO.duration * KURS / 100) * 100 + 1200} termasuk foto kunci 9:16).`);
    }
    // periksa status sampai selesai atau waktu fungsi hampir habis
    while (Date.now() - mulaiFn < 250e3) {
      const c = await cekVideo(job);
      job.status = c.status;
      if (c.status === 'completed') {
        const mentah = await unduhVideo(c);
        // simpan video mentah (tanpa teks) supaya teks bisa diganti nanti tanpa biaya AI lagi
        job.mentah_url = await simpanGambar(`posts/${id}/video-mentah-${Date.now().toString(36)}.mp4`, mentah, 'video/mp4');
        const mp4 = await selesaikanVideo(mentah, naskah.jenis_meja);
        const url = await simpanGambar(`posts/${id}/video-${Date.now().toString(36)}.mp4`, mp4, 'video/mp4');
        const biaya = c.usage && c.usage.cost ? ` · biaya video $${Number(c.usage.cost).toFixed(2)}` : '';
        st.reels_url = url; st.video_job = { ...job, status: 'completed', url, mentah_url: job.mentah_url }; await simpanState(st);
        await kirimVideo(chat, url, `VIDEO ${id} · ${Math.round(MODEL_VIDEO.duration * 1.25)} detik · 1080x1920${biaya}\nTeks: ngemeja ${naskah.jenis_meja}. Tambahkan musik dari library IG/YouTube/FB saat posting.`);
        await kirimTeks(chat,
          `TEKS POSTING VIDEO ${id}\n\n=== INSTAGRAM REELS ===\n${st.meta.caption_ig || '-'}\n\n` +
          `=== YOUTUBE SHORTS ===\nJudul: ${naskah.judul_shorts || st.meta.tema + ' #shorts'}\nDeskripsi: ${st.meta.caption_ig || '-'}\n\n` +
          `=== FACEBOOK REELS ===\n${naskah.caption_fb || st.meta.caption_threads || '-'}\n\n` +
          `Kurang pas? Ketik "reels baru ${id}" untuk membuat ulang (biaya video lagi).`);
        return;
      }
      if (['failed', 'cancelled', 'expired'].includes(c.status)) {
        st.video_job = { ...job, status: c.status }; await simpanState(st);
        await kirimTeks(chat, `GAGAL membuat video ${id}: ${c.error || c.status}. Ketik "reels baru ${id}" untuk mencoba lagi.`);
        return;
      }
      await tidur(15000);
    }
    // belum selesai: simpan dan sambung ke pemanggilan berikutnya (maks ±15 menit total)
    await simpanState(st);
    if (Date.now() - job.mulai > 15 * 60e3) { await kirimTeks(chat, `Video ${id} terlalu lama di antrean AI. Ketik "reels ${id}" nanti untuk mengecek lagi.`); return; }
    await sambung(id, chat);
  } catch (e) {
    const m = String(e.message || e);
    await kirimTeks(chat, /402|Insufficient credits/i.test(m) ? 'GAGAL membuat video: saldo OpenRouter habis. Isi saldo lalu ketik "reels" lagi.' : `GAGAL membuat video ${id}: ${m.slice(0, 300)}`).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(kerja(String(d.id), String(d.chat || CHAT_DEFAULT), !!d.lanjut, !!d.baru));
  return res.status(200).json({ ok: true });
}
