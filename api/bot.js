// Otak bot Produktif Glow. Make hanya meneruskan setiap update Telegram ke sini (1 modul),
// semua langkah (baca link, content agent, foto, deteksi, render, QC, revisi, setujui) dikerjakan di server.
// Rahasia di env Vercel: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, BOT_SECRET, BLOB_READ_WRITE_TOKEN.
import { waitUntil } from '@vercel/functions';
import { renderSlide } from '../lib/render.js';
import { adaBlob, bacaJson, simpanJson, bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimAlbum, kirimFoto, jawabTombol, tombolDraft, CHAT_DEFAULT } from '../lib/tg.js';
import { bacaPesanLink, ambilSemua } from '../lib/shopee.js';
import { bodyKonten, bodyRevisiTeks, FIELD_TEKS_REVISI, bodyFotoBaru, bodyEditFoto, bodyDeteksi, bodyQc, cekCaption, bacaJsonModel } from '../lib/agen.js';
import { claude, gambar, chatOR } from '../lib/ai.js';

export const config = { maxDuration: 300 };

const b64 = (s) => Buffer.from(String(s || ''), 'base64').toString('utf8');
const pad = (n) => String(n).padStart(2, '0');
const sekarangWIB = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const PENDING = 'pending.json';
const LANDING = 'landing.json';

// ---------- bantu ----------
function gabungProduk(items, produkAi) {
  const byPin = new Map((produkAi || []).map((p) => [Number(p.pin), p]));
  return items.map((it) => {
    const p = byPin.get(it.pin) || {};
    return { pin: it.pin, jenis: p.jenis || '', nama: p.nama || it.nama_listing, harga: it.harga || (Number(p.harga) || null),
      link: it.link, img: it.img, deskripsi_en: p.deskripsi_en || it.nama_listing };
  });
}

function teksDraft(st, judulAtas) {
  const m = st.meta;
  const cek = st.cek_caption && st.cek_caption.length ? `Cek aturan caption: ${st.cek_caption.join('; ')}` : 'Cek aturan caption: aman';
  return `${judulAtas} ${st.post_id}\nTema: ${m.tema || '-'}\n${cek}${m.qc && m.qc.lolos === false ? `\nCatatan content agent: ${m.qc.catatan}` : ''}\n\n` +
    `Slide 1 (hook): ${m.hook_judul}\n${m.hook_sub || ''}\n\n=== CAPTION INSTAGRAM ===\n${m.caption_ig}\n\n=== THREADS ===\n${m.caption_threads}`;
}

async function keDataUri(url) {
  const r = await fetch(url); const buf = Buffer.from(await r.arrayBuffer());
  return `data:${r.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
}

async function render(st, img, slide, extra = {}) {
  const out = Buffer.from(await renderSlide({ slide, img, boxes: st.boxes || [], meta: st.meta, ...extra }).arrayBuffer());
  return simpanGambar(`posts/${st.post_id}/r${st.rev}-${Date.now().toString(36)}-${slide}${extra.part || ''}.png`, out);
}

async function renderSemua(st, img) {
  const n = st.meta.produk.length;
  const daftar = [['hook', {}], ['peta', { part: 1 }], ...(n > 5 ? [['peta', { part: 2 }]] : []), ['struk', {}]];
  const slides = [];
  for (const [s, e] of daftar) slides.push(await render(st, img, s, e));
  const qc = await render(st, img, 'qc');
  return { slides, qc };
}

// ---------- tahap visual ----------
async function deteksiRenderQc(st, dataUri, catatanTambahan = '') {
  let boxes = [];
  try { boxes = bacaJsonModel(await chatOR(bodyDeteksi(st, dataUri))).boxes || []; } catch (e) { boxes = []; }
  st.boxes = boxes;
  const { slides, qc } = await renderSemua(st, dataUri);
  st.slides = slides;
  await kirimAlbum(st.chat, slides, `SLIDE ${st.post_id}${st.rev ? ` · revisi ${st.rev}` : ''}`);
  let q = { pin_lolos: !!boxes.length, foto_natural: true, ringkasan: boxes.length ? '' : 'Posisi produk tidak terdeteksi.' };
  try { q = bacaJsonModel(await claude(bodyQc(st, qc))); } catch (e) { q.ringkasan = (q.ringkasan + ' QC AI gagal: ' + e.message).trim(); }
  st.qc = q;
  await simpanState(st);
  if (q.pin_lolos === false) await kirimFoto(st.chat, qc, `SLIDE QC ${st.post_id} (cek posisi pin, tidak untuk diposting)`);
  const cek = st.cek_caption && st.cek_caption.length ? st.cek_caption.join('; ') : 'aman';
  await kirimTeks(st.chat,
    `QC ${st.post_id}: ${q.pin_lolos !== false && q.foto_natural !== false && cek === 'aman' ? 'LOLOS' : 'PERLU DICEK'}\n` +
    `Pin ke produk: ${q.pin_lolos === false ? 'ADA YANG SALAH' : 'tepat'}\nFoto: ${q.foto_natural === false ? 'terlihat AI' : 'natural'}\n` +
    `Caption: ${cek}\n${q.ringkasan || ''}${catatanTambahan ? '\n' + catatanTambahan : ''}`,
    tombolDraft(st.post_id));
}

async function buatFoto(st, body) {
  const { buf, mime } = await gambar(body);
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  st.img_url = await simpanGambar(`posts/${st.post_id}/foto-r${st.rev}-${Date.now().toString(36)}.${ext}`, buf, mime);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ---------- alur ----------
async function buatDraft(text, chat) {
  const { id, items: mentah } = bacaPesanLink(text);
  if (!id || !mentah.length) { await kirimTeks(chat, 'Format belum terbaca. Baris pertama "ID: PG-...", lalu satu baris per produk: Pin 1 - link - harga.'); return; }
  const items = await ambilSemua(mentah);
  await kirimTeks(chat, `DITERIMA ${id}\n\n${items.map((i) => `Pin ${i.pin} | ${i.nama_listing} | ${i.harga ? 'Rp' + i.harga : 'harga belum diisi'}`).join('\n')}\n\nContent agent sedang menyusun draft.`);
  const st = { post_id: id, chat, items, rev: 0, status: 'draft' };
  const meta = bacaJsonModel(await claude(bodyKonten(st)));
  meta.produk = gabungProduk(items, meta.produk);
  st.meta = meta; st.cek_caption = cekCaption(meta);
  await simpanState(st);
  await kirimTeks(chat, teksDraft(st, 'DRAFT KONTEN') + '\n\nFoto dan slide sedang dibuat (±1 menit).');
  const uri = await buatFoto(st, bodyFotoBaru(st));
  await deteksiRenderQc(st, uri);
}

async function revisiCaption(st, catatan) {
  const lama = { ...st.meta };
  const t = bacaJsonModel(await claude(bodyRevisiTeks(st, catatan)));
  for (const k of FIELD_TEKS_REVISI) if (typeof t[k] === 'string' && t[k].trim()) st.meta[k] = t[k].trim();
  st.rev += 1; st.cek_caption = cekCaption(st.meta);
  // slide hanya dirender ulang kalau teks di slide berubah (gratis, tanpa AI)
  const ubah = [];
  if (st.img_url && (lama.hook_judul !== st.meta.hook_judul || lama.hook_sub !== st.meta.hook_sub)) ubah.push('hook');
  if (st.img_url && lama.cta !== st.meta.cta) ubah.push('struk');
  if (ubah.length) {
    const uri = await keDataUri(st.img_url);
    const urls = [];
    for (const s of ubah) urls.push(await render(st, uri, s));
    if (urls.length > 1) await kirimAlbum(st.chat, urls, `Slide yang berubah · ${st.post_id}`);
    else await kirimFoto(st.chat, urls[0], `Slide yang berubah · ${st.post_id}`);
  }
  await simpanState(st);
  await kirimTeks(st.chat, teksDraft(st, `REVISI CAPTION ${st.rev} ·`) + `\n\nFoto tidak diubah.${ubah.length ? '' : ' Slide tidak berubah.'}`, tombolDraft(st.post_id));
}

async function revisiFoto(st, catatan) {
  // "hapus 5" / "hapus produk 3 dan 5" -> produk dikeluarkan, pin dinomori ulang
  const m = catatan.match(/hapus\s*(?:produk|pin|nomor|no\.?)?\s*((?:\d+\s*(?:,|dan|&)?\s*)+)/i);
  const pinHapus = m ? (m[1].match(/\d+/g) || []).map(Number) : [];
  const dihapus = st.meta.produk.filter((p) => pinHapus.includes(Number(p.pin)));
  st.rev += 1;
  let catatanTambahan = '';
  if (dihapus.length) {
    const sisa = st.meta.produk.filter((p) => !pinHapus.includes(Number(p.pin)));
    const peta = new Map(sisa.map((p, i) => [Number(p.pin), i + 1]));
    st.items = st.items.filter((i) => peta.has(Number(i.pin))).map((i) => ({ ...i, pin: peta.get(Number(i.pin)) }));
    st.meta.produk = sisa.map((p) => ({ ...p, pin: peta.get(Number(p.pin)) }));
    st.meta.deteksi_en = st.meta.produk.map((p) => `${p.pin}: ${p.deskripsi_en}`).join('\n');
    catatanTambahan = `Produk dihapus: ${dihapus.map((d) => d.nama).join(', ')}. Pin dinomori ulang. Kalau caption masih menyebutnya, pakai Revisi caption.`;
  }
  const dariNol = /foto baru|dari awal|ulang total|ganti total/i.test(catatan) || !st.img_url;
  await kirimTeks(st.chat, `Revisi foto ${st.post_id} sedang dibuat${dariNol ? ' (foto baru dari awal)' : ' (foto lama diedit, bagian lain dipertahankan)'}. Caption tidak diubah.`);
  const body = dariNol ? bodyFotoBaru(st) : bodyEditFoto(st, catatan, dihapus);
  if (dariNol) body.prompt += ` Owner notes (Indonesian, follow them): ${catatan}`;
  const uri = await buatFoto(st, body);
  await deteksiRenderQc(st, uri, catatanTambahan);
}

async function rapikanPin(st) {
  if (!st.img_url) { await kirimTeks(st.chat, 'Foto draft ini belum ada, pakai Revisi foto.'); return; }
  st.rev += 1;
  await kirimTeks(st.chat, `Merapikan pin & label ${st.post_id} dari foto yang sama (tanpa foto baru).`);
  await deteksiRenderQc(st, await keDataUri(st.img_url));
}

async function setujui(st) {
  const landing = (await bacaJson(LANDING)) || { posts: [] };
  const post = { id: st.post_id, judul: st.meta.tema, kategori: st.meta.kategori, tanggal: sekarangWIB(),
    produk: st.meta.produk.map((p) => ({ pin: p.pin, jenis: p.jenis, nama: p.nama, harga: p.harga, link: p.link, img: p.img })) };
  const ulang = landing.posts.some((p) => p.id === st.post_id);
  if (ulang) post.tanggal = landing.posts.find((p) => p.id === st.post_id).tanggal;
  landing.posts = [post, ...landing.posts.filter((p) => p.id !== st.post_id)];
  await simpanJson(LANDING, landing);
  st.status = 'disetujui'; await simpanState(st);
  await kirimTeks(st.chat, `Draft ${st.post_id} disetujui${ulang ? ' (menggantikan versi sebelumnya, tidak dobel)' : ''}. ${post.produk.length} produk sudah ada di link bio: produktif-glow.vercel.app. Posting IG dan Threads tetap manual.`);
}

const TANYA = {
  rev_caption: 'Kirim catatan revisi caption dalam satu pesan (contoh: judul lebih lucu, Threads lebih pendek). Hanya teks yang diubah, foto tetap.',
  rev_foto: 'Kirim catatan revisi foto dalam satu pesan (contoh: hapus 5, lampu ke kiri, sudut lebih lebar). Foto lama diedit, caption tetap. Tulis "foto baru" kalau mau dibuat ulang dari awal.',
};

async function proses(d) {
  const chat = String(d.chat || CHAT_DEFAULT);
  const text = d.t ? b64(d.t) : '';
  const cb = d.cb ? b64(d.cb) : '';
  try {
    if (cb) {
      await jawabTombol(d.cbid);
      const [aksi, id] = cb.split('|');
      if (aksi === 'brief_ok') return kirimTeks(chat, `Siap. Kirim satu pesan: baris pertama ID di bawah, lalu satu baris per produk, contoh: Pin 1 - link - 89000 (harga boleh dikosongkan).\n\nID: ${id}`);
      if (aksi === 'brief_ganti') return kirimTeks(chat, `Oke, dicatat: tema diganti. Kalau tetap mau kirim link, pakai ID di bawah.\n\nID: ${id}`);
      const st = await bacaState(id);
      if (!st) return kirimTeks(chat, `Draft ${id} dibuat dengan sistem lama, jadi tidak bisa direvisi atau disetujui dari sini. Kirim ulang link-nya kalau mau dibuat ulang.`);
      st.chat = chat;
      if (aksi === 'draft_ok') return setujui(st);
      if (aksi === 'draft_revisi') return kirimTeks(chat, `Mau revisi bagian apa untuk ${id}?`, tombolDraft(id));
      if (aksi === 'rev_pin') return rapikanPin(st);
      if (TANYA[aksi]) { await simpanJson(PENDING, { aksi, id, at: Date.now() }); return kirimTeks(chat, `${TANYA[aksi]}\n\nID: ${id}`); }
      return kirimTeks(chat, 'Tombol tidak dikenal.');
    }
    if (!text) return;
    if (/ID:\s*PG-/i.test(text) && /s\.shopee\.co\.id/i.test(text)) return buatDraft(text, chat);
    const p = await bacaJson(PENDING);
    if (p && p.id && Date.now() - p.at < 24 * 3600e3) {
      await simpanJson(PENDING, {});
      const st = await bacaState(p.id);
      if (!st) return kirimTeks(chat, `Data draft ${p.id} tidak ditemukan.`);
      st.chat = chat;
      return p.aksi === 'rev_caption' ? revisiCaption(st, text) : revisiFoto(st, text);
    }
    return kirimTeks(chat, 'Pesan diterima, tapi tidak ada revisi yang sedang ditunggu. Untuk revisi, tekan tombol Revisi di draft dulu.');
  } catch (e) {
    await kirimTeks(chat, `GAGAL: ${String(e && e.message || e).slice(0, 500)}\nDraft yang sudah ada tidak berubah. Coba lagi, atau kabari Claude kalau terulang.`).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (req.query.a === 'landing') {
      const l = adaBlob() ? await bacaJson(LANDING) : null;
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
      return res.status(200).json(l || { posts: [] });
    }
    // uji tulis-baca Blob (butuh ?s=BOT_SECRET)
    if (req.query.a === 'tesblob' && process.env.BOT_SECRET && req.query.s === process.env.BOT_SECRET) {
      try { const t = Date.now(); await simpanJson('tes/blob.json', { t }); const r = await bacaJson('tes/blob.json');
        return res.status(200).json({ tulis: true, baca: !!r, cocok: !!r && r.t === t }); }
      catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
    }
    // cek kesiapan tanpa membuka isi rahasia
    const ada = (k) => !!process.env[k];
    return res.status(200).json({ ANTHROPIC_API_KEY: ada('ANTHROPIC_API_KEY'), OPENROUTER_API_KEY: ada('OPENROUTER_API_KEY'),
      TELEGRAM_BOT_TOKEN: ada('TELEGRAM_BOT_TOKEN'), BOT_SECRET: ada('BOT_SECRET'), BLOB: adaBlob() });
  }
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(proses(d));
  return res.status(200).json({ ok: true });
}
export { proses };
