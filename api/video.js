// POST /api/video {secret, id, chat, versi?, model?, baru?, lanjut?}: video realistis satu shot "the orbit" (IG Reels, YT Shorts, FB Reels).
// 1) foto kunci 9:16 dari foto versi yang dipilih  2) video AI 10 dtk: kamera memutar pelan mengelilingi pusat meja
// 3) teks "ngemeja <jenis meja>". Tiap kombinasi versi+model punya file sendiri (posts/<id>/video-v<versi>-<model>.json),
// jadi dua video bisa dibuat bersamaan. Fungsi memeriksa status berkala dan menyambung dirinya sendiri kalau waktu habis.
import { waitUntil } from '@vercel/functions';
import { selesaikanVideo } from '../lib/reels.js';
import { bacaState, simpanState, simpanGambar, bacaJson, simpanJson } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';
import { gambar, claude, chatOR, mulaiVideo, cekVideo, unduhVideo } from '../lib/ai.js';
import { bodyKeyframe916, bodyVideoAI, MODEL_VIDEO_PILIHAN, bodyNaskahReels, bacaJsonModel, sudutPost, bodyTitikUtama } from '../lib/agen.js';

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

function sambung(d) {
  return fetch(`https://${DOMAIN()}/api/video`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: process.env.BOT_SECRET, ...d, lanjut: true, baru: false }) });
}

async function kerja({ id, chat, lanjut, baru, versi, model }) {
  const mulaiFn = Date.now();
  const kunciModel = MODEL_VIDEO_PILIHAN[model] ? model : 'kling', M = MODEL_VIDEO_PILIHAN[kunciModel];
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const units = unitList(st);
    const k = versi >= 1 && versi <= units.length ? versi - 1 : units.length - 1; // default: versi terakhir
    const u = units[k], nama = `${id}${units.length > 1 ? ` versi ${k + 1}${u.label ? ` (${u.label})` : ''}` : ''} · ${M.nama}`;
    if (!u.img_url) { await kirimTeks(chat, `Foto ${nama} belum ada, jadi video belum bisa dibuat.`); return; }
    const fileV = `posts/${id}/video-v${k + 1}-${kunciModel}.json`;
    const v = (await bacaJson(fileV)) || {};
    const naskah = v.naskah || await siapkanNaskah(st);
    v.naskah = naskah;
    const ulangLagi = `"reels baru ${kunciModel === 'kling' ? '' : kunciModel + ' '}${units.length > 1 ? `versi ${k + 1} ` : ''}${id}"`;

    let job = v.job;
    // sudah pernah jadi: kirim ulang gratis (kecuali minta dibuat baru)
    if (!baru && !lanjut && job && job.status === 'completed' && v.url) {
      await kirimVideo(chat, v.url, `VIDEO ${nama} (yang sudah jadi). Ketik ${ulangLagi} kalau mau dibuat ulang.`);
      return;
    }
    const masihJalan = job && ['pending', 'in_progress'].includes(job.status) && Date.now() - job.mulai < 15 * 60e3;
    if (masihJalan && !lanjut) { await kirimTeks(chat, `Video ${nama} masih dibuat AI, aku kirim begitu jadi.`); return; }
    if (baru || !job || (!masihJalan && job.status !== 'completed')) {
      // foto vertikal 9:16 per versi; dibuat ulang kalau foto carousel atau sudut kameranya berubah
      const sudut = sudutPost(st);
      if (v.keyframe_dari !== u.img_url || v.keyframe_sudut !== sudut.nama) delete v.keyframe_url;
      const fotoBaru = v.keyframe_url ? 0 : 1;
      if (!v.keyframe_url) {
        // hanya produk versi ini (produk versi lain tidak boleh ikut masuk)
        const produkU = u.pins && u.pins.length ? st.meta.produk.filter((p) => u.pins.includes(Number(p.pin))) : st.meta.produk;
        const { buf, mime } = await gambar(bodyKeyframe916({ ...st, img_url: u.img_url, meta: { ...st.meta, produk: produkU } }));
        v.keyframe_url = await simpanGambar(`posts/${id}/keyframe916-v${k + 1}-${Date.now().toString(36)}.${mime.includes('jpeg') ? 'jpg' : 'png'}`, buf, mime);
        Object.assign(v, { keyframe_dari: u.img_url, keyframe_sudut: sudut.nama });
        delete v.titik_utama;
      }
      // pusat meja (biasanya layar monitor/laptop): kamera orbit mengelilingi titik ini
      if (!v.titik_utama) {
        v.titik_utama = { subjek: 'the center of the desk' };
        try { const r = bacaJsonModel(await chatOR(bodyTitikUtama(v.keyframe_url))); if (r.subjek_en) v.titik_utama.subjek = String(r.subjek_en).slice(0, 50); } catch { /* pakai tengah meja */ }
      }
      const j = await mulaiVideo(bodyVideoAI(v.keyframe_url, naskah, sudut.gerak, v.titik_utama.subjek, M));
      job = v.job = { id: j.id, polling_url: j.polling_url, status: j.status, mulai: Date.now() };
      await simpanJson(fileV, v);
      await kirimTeks(chat, `Video ${nama} sedang dibuat AI (±2–5 menit, ±Rp${(Math.round(M.usdPerDetik * M.duration * KURS / 100) * 100 + fotoBaru * 1200).toLocaleString('id-ID')}${fotoBaru ? ' termasuk foto vertikal 9:16' : ''}).`);
    }
    // periksa status sampai selesai atau waktu fungsi hampir habis
    while (Date.now() - mulaiFn < 250e3) {
      const c = await cekVideo(job);
      job.status = c.status;
      if (c.status === 'completed') {
        const mentah = await unduhVideo(c);
        // video mentah (tanpa teks) disimpan supaya teks bisa diganti nanti tanpa biaya AI lagi
        const t = Date.now().toString(36);
        job.mentah_url = await simpanGambar(`posts/${id}/video-mentah-v${k + 1}-${kunciModel}-${t}.mp4`, mentah, 'video/mp4');
        const mp4 = await selesaikanVideo(mentah, naskah.jenis_meja);
        v.url = await simpanGambar(`posts/${id}/video-v${k + 1}-${kunciModel}-${t}.mp4`, mp4, 'video/mp4');
        job.status = 'completed';
        await simpanJson(fileV, v);
        const st2 = await bacaState(id); // baca ulang: video lain mungkin berjalan bersamaan
        if (st2) { st2.reels_url = v.url; if (!st2.meta.naskah_reels || !st2.meta.naskah_reels.jenis_meja) st2.meta.naskah_reels = naskah; await simpanState(st2); }
        const biaya = c.usage && c.usage.cost ? ` · biaya video $${Number(c.usage.cost).toFixed(2)}` : '';
        await kirimVideo(chat, v.url, `VIDEO ${nama} · ${M.duration} detik · 1080x1920${biaya}\nTeks: ngemeja ${naskah.jenis_meja}. Tambahkan musik dari library IG/YouTube/FB saat posting.`);
        await kirimTeks(chat,
          `TEKS POSTING VIDEO ${id}\n\n=== INSTAGRAM REELS ===\n${st.meta.caption_ig || '-'}\n\n` +
          `=== YOUTUBE SHORTS ===\nJudul: ${naskah.judul_shorts || st.meta.tema + ' #shorts'}\nDeskripsi: ${st.meta.caption_ig || '-'}\n\n` +
          `=== FACEBOOK REELS ===\n${naskah.caption_fb || st.meta.caption_threads || '-'}\n\n` +
          `Kurang pas? Ketik ${ulangLagi} untuk membuat ulang.`);
        return;
      }
      if (['failed', 'cancelled', 'expired'].includes(c.status)) {
        await simpanJson(fileV, v);
        await kirimTeks(chat, `GAGAL membuat video ${nama}: ${c.error || c.status}. Ketik ${ulangLagi} untuk mencoba lagi.`);
        return;
      }
      await tidur(15000);
    }
    // belum selesai: simpan dan sambung ke pemanggilan berikutnya (maks ±15 menit total)
    await simpanJson(fileV, v);
    if (Date.now() - job.mulai > 15 * 60e3) { await kirimTeks(chat, `Video ${nama} terlalu lama di antrean AI. Ketik "reels ${id}" nanti untuk mengecek lagi.`); return; }
    await sambung({ id, chat, versi: k + 1, model: kunciModel });
  } catch (e) {
    const m = String(e.message || e);
    // tampilkan pesan asli OpenRouter; 402 bisa berarti saldo akun kurang, batas kredit API key tercapai,
    // atau saldo tersisa tidak cukup menutup perkiraan biaya permintaan (terutama kalau dua video dibuat bersamaan)
    const kredit = /\b402\b|insufficient credits|credit limit|requires more credits/i.test(m);
    await kirimTeks(chat, `GAGAL membuat video ${id} (${M.nama}): ${m.slice(0, 300)}` +
      (kredit ? '\n\nIni penolakan soal kredit dari OpenRouter. Ketik "saldo" untuk melihat sisa saldo akun dan batas API key.' : '')).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(kerja({ id: String(d.id), chat: String(d.chat || CHAT_DEFAULT), lanjut: !!d.lanjut, baru: !!d.baru, versi: Number(d.versi) || 0, model: d.hemat ? 'hemat' : String(d.model || 'kling') }));
  return res.status(200).json({ ok: true });
}
