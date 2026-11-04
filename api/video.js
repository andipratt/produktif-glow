// POST /api/video {secret, id, chat, versi?, model?, baru?, lanjut?}: video realistis satu shot "the orbit" (IG Reels, YT Shorts, FB Reels).
// 1) foto kunci 9:16 dari foto versi yang dipilih  2) video AI 10 dtk: kamera memutar pelan mengelilingi pusat meja
// 3) teks "ngemeja <jenis meja>". Tiap kombinasi versi+model punya file sendiri (posts/<id>/video-v<versi>-<model>.json),
// jadi dua video bisa dibuat bersamaan. Fungsi memeriksa status berkala dan menyambung dirinya sendiri kalau waktu habis.
import { waitUntil } from '@vercel/functions';
import { selesaikanVideo, videoOrbit, kanvasPerluas, gabungPerluas, potong916 } from '../lib/reels.js';
import { bacaState, simpanState, simpanGambar, bacaJson, simpanJson } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';
import { gambar, claude, chatOR, mulaiVideo, cekVideo, unduhVideo } from '../lib/ai.js';
import { bodyKeyframe916, bodyVideoAI, MODEL_VIDEO_PILIHAN, bodyNaskahReels, bacaJsonModel, sudutPost, bodyTitikUtama, bodyPerluas916, bodyJenisVersi } from '../lib/agen.js';

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

// ---------- Video "the orbit" dari foto asli (default): tanpa AI video, gerak dibuat kode, ±Rp1.300/versi ----------
const unduh = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

// Foto dasar video per versi = FOTO ASLI carousel diperluas ke 9:16 (AI hanya mengisi atas & bawah, foto asli ditempel
// ulang persis di tengah). Disimpan sekali per foto di posts/<id>/dasar-v<n>.json, dipakai orbit kode maupun AI video.
async function dasarVersi(id, k, u, chat, nama) {
  const file = `posts/${id}/dasar-v${k + 1}.json`;
  const d = (await bacaJson(file)) || {};
  if (d.dari === u.img_url && d.url) return d;
  const asli = await unduh(u.img_url);
  let dasar;
  try {
    const kanvasUrl = await simpanGambar(`posts/${id}/kanvas916-v${k + 1}-${Date.now().toString(36)}.png`, await kanvasPerluas(asli));
    const { buf } = await gambar(bodyPerluas916(kanvasUrl));
    dasar = await gabungPerluas(asli, buf);
  } catch (e) {
    dasar = await potong916(asli);
    await kirimTeks(chat, `Catatan ${nama}: perluasan foto ke 9:16 gagal (${String(e.message).slice(0, 80)}), dipakai potongan tengah foto.`);
  }
  const baru = { dari: u.img_url, url: await simpanGambar(`posts/${id}/dasar916-v${k + 1}-${Date.now().toString(36)}.jpg`, dasar, 'image/jpeg'), jenis: d.dari === u.img_url ? d.jenis : undefined };
  await simpanJson(file, baru);
  return baru;
}

// Teks video: post dua versi = gaya tiap versi ("ngemeja japandi" / "ngemeja industrial"), bukan "terang vs gelap"
async function jenisVersi(id, k, st, units, naskah) {
  if (units.length < 2) return naskah.jenis_meja;
  const file = `posts/${id}/dasar-v${k + 1}.json`, d = (await bacaJson(file)) || {};
  if (d.jenis) return d.jenis;
  const u = units[k];
  let j = '';
  try {
    const produk = st.meta.produk.filter((p) => (u.pins || []).includes(Number(p.pin))).map((p) => p.nama).join(', ');
    j = String(await claude(bodyJenisVersi(u.label || '', produk))).toLowerCase().replace(/^ngemeja\s+/, '').replace(/[^a-z0-9 \-]/g, '').trim().split(/\s+/).slice(0, 2).join(' ');
  } catch { /* pakai label */ }
  if (!j || /\b(vs|atau)\b/.test(j)) j = String(u.label || naskah.jenis_meja).replace(/^[A-Z0-9]+:\s*/i, '').toLowerCase().split(/\s+/).filter((w) => !/^(terang|gelap|tenang|hangat|vs|atau|versi)$/.test(w)).slice(-2).join(' ') || 'kerja';
  d.jenis = j; await simpanJson(file, d);
  return j;
}

const teksPostingVideo = (id, st, naskah) => `TEKS POSTING VIDEO ${id}\n\n=== INSTAGRAM REELS ===\n${st.meta.caption_ig || '-'}\n\n` +
  `=== YOUTUBE SHORTS ===\nJudul: ${naskah.judul_shorts || st.meta.tema + ' #shorts'}\nDeskripsi: ${st.meta.caption_ig || '-'}\n\n` +
  `=== FACEBOOK REELS ===\n${naskah.caption_fb || st.meta.caption_threads || '-'}`;

// ---------- "reels orbit": gerak dibuat kode dari foto asli, tanpa AI video ----------
async function kerjaOrbit({ id, chat, baru, versi }) {
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const units = unitList(st);
    const daftar = versi >= 1 && versi <= units.length ? [versi - 1] : units.map((_, k) => k);
    const naskah = await siapkanNaskah(st);
    let ada = false;
    for (const k of daftar) {
      const u = units[k], nama = `${id}${units.length > 1 ? ` versi ${k + 1}${u.label ? ` (${u.label})` : ''}` : ''}`;
      if (!u.img_url) { await kirimTeks(chat, `Foto ${nama} belum ada.`); continue; }
      await kirimTeks(chat, `Membuat video orbit (kode) ${nama} dari foto aslinya (±1 menit).`);
      const d = await dasarVersi(id, k, u, chat, nama);
      const jenis = await jenisVersi(id, k, st, units, naskah);
      const mp4 = await videoOrbit(await unduh(d.url), jenis, sudutPost(st).gerak === 'putar' ? 'putar' : 'orbit');
      const url = await simpanGambar(`posts/${id}/video-v${k + 1}-orbit-${Date.now().toString(36)}.mp4`, mp4, 'video/mp4');
      await kirimVideo(chat, url, `VIDEO ${nama} · orbit kode · 10 detik\nTeks: ngemeja ${jenis}.`);
      ada = true;
    }
    if (ada) await kirimTeks(chat, teksPostingVideo(id, st, naskah));
  } catch (e) {
    await kirimTeks(chat, `GAGAL membuat video ${id}: ${String(e.message || e).slice(0, 300)}`).catch(() => {});
  }
}

async function kerja({ id, chat, lanjut, baru, versi, model }) {
  if (model === 'orbit') return kerjaOrbit({ id, chat, baru, versi });
  const mulaiFn = Date.now();
  const kunciModel = MODEL_VIDEO_PILIHAN[model] ? model : 'veo', M = MODEL_VIDEO_PILIHAN[kunciModel];
  try {
    const st = await bacaState(id);
    if (!st || !st.meta) { await kirimTeks(chat, `Data draft ${id} tidak ditemukan.`); return; }
    const units = unitList(st);
    const k = versi >= 1 && versi <= units.length ? versi - 1 : units.length - 1; // default: versi terakhir
    const u = units[k], nama = `${id}${units.length > 1 ? ` versi ${k + 1}${u.label ? ` (${u.label})` : ''}` : ''} · ${M.nama}`;
    if (!u.img_url) { await kirimTeks(chat, `Foto ${nama} belum ada, jadi video belum bisa dibuat.`); return; }
    const fileV = `posts/${id}/video-v${k + 1}-${kunciModel}.json`;
    const v = (await bacaJson(fileV)) || {};
    const naskah = { ...(v.naskah || await siapkanNaskah(st)) };
    v.naskah = naskah;
    naskah.jenis_meja = await jenisVersi(id, k, st, units, naskah);
    const ulangLagi = `"reels baru ${kunciModel === 'veo' ? '' : kunciModel + ' '}${units.length > 1 ? `versi ${k + 1} ` : ''}${id}"`;

    let job = v.job;
    // sudah pernah jadi: kirim ulang gratis (kecuali minta dibuat baru)
    if (!baru && !lanjut && job && job.status === 'completed' && v.url) {
      await kirimVideo(chat, v.url, `VIDEO ${nama} (yang sudah jadi). Ketik ${ulangLagi} kalau mau dibuat ulang.`);
      return;
    }
    const masihJalan = job && ['pending', 'in_progress'].includes(job.status) && Date.now() - job.mulai < 15 * 60e3;
    if (masihJalan && !lanjut) { await kirimTeks(chat, `Video ${nama} masih dibuat AI, aku kirim begitu jadi.`); return; }
    if (baru || !job || (!masihJalan && job.status !== 'completed')) {
      // frame awal = FOTO ASLI carousel versi ini (diperluas ke 9:16), bukan foto yang digambar ulang AI
      const sudut = sudutPost(st);
      const dd = await dasarVersi(id, k, u, chat, nama);
      v.keyframe_url = dd.url;
      if (!v.titik_utama || v.titik_dari !== dd.url) {
        v.titik_utama = { subjek: 'the center of the desk' }; v.titik_dari = dd.url;
        try { const r = bacaJsonModel(await chatOR(bodyTitikUtama(dd.url))); if (r.subjek_en) v.titik_utama.subjek = String(r.subjek_en).slice(0, 50); } catch { /* pakai tengah meja */ }
      }
      const fotoBaru = 0;
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
        await kirimTeks(chat, teksPostingVideo(id, st, naskah) + `\n\nKurang pas? Ketik ${ulangLagi} untuk membuat ulang.`);
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
  waitUntil(kerja({ id: String(d.id), chat: String(d.chat || CHAT_DEFAULT), lanjut: !!d.lanjut, baru: !!d.baru, versi: Number(d.versi) || 0, model: String(d.model || 'veo') }));
  return res.status(200).json({ ok: true });
}
