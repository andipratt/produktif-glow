// Otak bot ngemeja. Telegram mengirim update langsung ke sini (webhook), brief terjadwal lewat Vercel Cron.
// Make tidak lagi dibutuhkan (format lama dari Make tetap diterima sebagai cadangan). Semua langkah (baca link, content agent, foto, deteksi, render, QC, revisi, setujui) dikerjakan di server.
// Rahasia di env Vercel: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, BOT_SECRET, BLOB_READ_WRITE_TOKEN.
import { waitUntil } from '@vercel/functions';
import { renderSlide } from '../lib/render.js';
import { adaBlob, bacaJson, simpanJson, bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimAlbum, kirimFoto, jawabTombol, tombolDraft, CHAT_DEFAULT, tgApi } from '../lib/tg.js';
import { bacaPesanLink, ambilSemua, RE_LINK_SHOPEE } from '../lib/shopee.js';
import { bodyKonten, bodyRevisiTeks, FIELD_TEKS_REVISI, bodyFotoBaru, bodyEditFoto, bodyDeteksiSatu, bodyQc, cekCaption, bacaJsonModel } from '../lib/agen.js';
import { claude, gambar, chatOR } from '../lib/ai.js';
import { rencanaTata } from '../lib/layout.js';
import { lumDariDataUri } from '../lib/lum.js';
import { deteksiSatu } from '../lib/deteksi.js';
import { catat } from '../lib/hitung.js';
import { kumpulkan, teksAngka, bodyLaporan } from '../lib/laporan.js';
import { bodyKomen, teksKomen } from '../lib/komen.js';
import { FORMAT, pilihResep, bodyBrief, teksBrief } from '../lib/brief.js';

export const config = { maxDuration: 300 };

const isiTeks = (v) => (typeof v === 'string' ? !!v.trim() : Array.isArray(v) && v.length > 0);
const b64 = (s) => Buffer.from(String(s || ''), 'base64').toString('utf8');
const pad = (n) => String(n).padStart(2, '0');
const sekarangWIB = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const PENDING = 'pending.json';
const LANDING = 'landing.json';
const RIWAYAT = 'briefs/riwayat.json';
const KELUHAN = 'riset/keluhan.json';

// ---------- bantu ----------
function gabungProduk(items, produkAi) {
  const byPin = new Map((produkAi || []).map((p) => [Number(p.pin), p]));
  return items.map((it) => {
    const p = byPin.get(it.pin) || {};
    return { pin: it.pin, jenis: p.jenis || '', nama: p.nama || it.nama_listing, harga: it.harga || (Number(p.harga) || null),
      link: it.link, img: it.img, deskripsi_en: p.deskripsi_en || it.nama_listing, ukuran: p.ukuran || '' };
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

const cacheLum = new Map();
const lumUntuk = (img) => { if (!cacheLum.has(img)) { cacheLum.clear(); cacheLum.set(img, lumDariDataUri(img)); } return cacheLum.get(img); };

// Satu "unit visual" = satu foto. Post biasa punya 1 unit; format banding (A vs B) punya 2 unit.
function unitList(st) {
  if (!st.visual || !st.visual.length) st.visual = [{ label: '', pins: st.meta.produk.map((p) => p.pin), img_url: st.img_url, rencana: st.rencana, boxes: st.boxes || [] }];
  return st.visual;
}
const produkUnit = (st, u) => st.meta.produk.filter((p) => u.pins.includes(Number(p.pin)));
const viewUnit = (st, u) => ({ ...st, img_url: u.img_url, rencana: u.rencana, boxes: u.boxes || [],
  items: st.items.filter((i) => u.pins.includes(Number(i.pin))), meta: { ...st.meta, produk: produkUnit(st, u) } });
const semuaBoxes = (st) => unitList(st).flatMap((u) => u.boxes || []);
const grupStruk = (st) => (unitList(st).length > 1 ? unitList(st).map((u) => ({ label: u.label, pins: u.pins })) : null);

async function render(st, img, slide, extra = {}) {
  const out = Buffer.from(await renderSlide({ slide, img, boxes: semuaBoxes(st), meta: st.meta, grup: grupStruk(st),
    lum: slide === 'peta' ? lumUntuk(img) : null, ...extra }).arrayBuffer());
  return simpanGambar(`posts/${st.post_id}/r${st.rev}-${Date.now().toString(36)}-${slide}${extra.part || ''}.png`, out);
}

// uris: data URI foto per unit (urutan sama dengan st.visual)
async function renderSemua(st, uris) {
  const units = unitList(st);
  const slides = [await render(st, uris[uris.length - 1], 'hook')];
  for (let k = 0; k < units.length; k++) {
    const u = units[k]; const pu = produkUnit(st, u);
    const metaU = { ...st.meta, produk: pu };
    const bagian = pu.length > 5 ? [1, 2] : [1];
    for (const part of bagian) {
      const page = units.length > 1 ? `${u.label}${bagian.length > 1 ? ` (${part}/2)` : ''}` : undefined;
      slides.push(await render(st, uris[k], 'peta', { part, meta: metaU, boxes: u.boxes || [], page }));
    }
  }
  if (Array.isArray(st.meta.insight) && st.meta.insight.length) slides.push(await render(st, uris[0], 'insight'));
  slides.push(await render(st, uris[0], 'struk'));
  const qc = [];
  for (let k = 0; k < units.length; k++) qc.push(await render(st, uris[k], 'qc', { meta: { ...st.meta, produk: produkUnit(st, units[k]) }, boxes: units[k].boxes || [] }));
  return { slides, qc };
}

// ---------- tahap visual ----------
async function deteksiUnit(st, u, uri) {
  const hasil = await Promise.all(produkUnit(st, u).map(async (p) => { const b = await deteksiSatu(p, uri); return b ? { pin: p.pin, box_2d: b.box, ...(b.titik ? { titik: b.titik } : {}) } : null; }));
  u.boxes = hasil.filter(Boolean);
}

// uris: foto tiap unit; ulangDeteksi: daftar index unit yang perlu dideteksi ulang
async function deteksiRenderQc(st, uris, ulangDeteksi, catatanTambahan = '') {
  const units = unitList(st);
  await Promise.all(ulangDeteksi.map((k) => deteksiUnit(st, units[k], uris[k])));
  const boxes = semuaBoxes(st);
  const hilang = st.meta.produk.filter((p) => !boxes.some((b) => b.pin === p.pin)).map((p) => `${pad(p.pin)} ${p.nama}`);
  const infoPin = hilang.length ? `Tidak ketemu di foto (tampil tanpa pin): ${hilang.join(', ')}. Coba Revisi foto.` : 'Semua produk ketemu di foto.';
  const { slides, qc } = await renderSemua(st, uris);
  st.slides = slides;
  await kirimAlbum(st.chat, slides, `SLIDE ${st.post_id}${st.rev ? ` · revisi ${st.rev}` : ''}`);
  let q = { pin_lolos: !hilang.length, foto_natural: true, ringkasan: '' };
  try {
    const hs = await Promise.all(units.map((u, k) => claude(bodyQc(viewUnit(st, u), qc[k])).then(bacaJsonModel)));
    q = { pin_lolos: hs.every((h) => h.pin_lolos !== false), foto_natural: hs.every((h) => h.foto_natural !== false),
      ringkasan: hs.map((h, k) => (units.length > 1 ? `[${units[k].label}] ` : '') + (h.ringkasan || '')).join(' ').trim() };
  } catch (e) { q.ringkasan = ('QC AI gagal: ' + e.message).trim(); }
  st.qc = q;
  await simpanState(st);
  if (q.pin_lolos === false) for (let k = 0; k < qc.length; k++) await kirimFoto(st.chat, qc[k], `SLIDE QC ${st.post_id}${units.length > 1 ? ` · ${units[k].label}` : ''} (cek posisi pin, tidak untuk diposting)`);
  const cek = st.cek_caption && st.cek_caption.length ? st.cek_caption.join('; ') : 'aman';
  await kirimTeks(st.chat,
    `QC ${st.post_id}: ${q.pin_lolos !== false && q.foto_natural !== false && cek === 'aman' ? 'LOLOS' : 'PERLU DICEK'}\n` +
    `Pin ke produk: ${q.pin_lolos === false ? 'ADA YANG SALAH' : 'tepat'}\nFoto: ${q.foto_natural === false ? 'terlihat AI' : 'natural'}\n` +
    `Caption: ${cek}\n${q.ringkasan || ''}${infoPin ? '\n' + infoPin : ''}${catatanTambahan ? '\n' + catatanTambahan : ''}`,
    tombolDraft(st.post_id));
}

async function buatFotoUnit(st, k, body) {
  const u = unitList(st)[k];
  const { buf, mime } = await gambar(body);
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  u.img_url = await simpanGambar(`posts/${st.post_id}/foto-r${st.rev}-u${k}-${Date.now().toString(36)}.${ext}`, buf, mime);
  if (k === 0) st.img_url = u.img_url;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Rencana tata letak + gambar panduan (kotak bernomor) untuk AI gambar
async function siapkanTata(st, k) {
  const u = unitList(st)[k];
  u.rencana = rencanaTata(produkUnit(st, u));
  const out = Buffer.from(await renderSlide({ slide: 'tata', boxes: u.rencana }).arrayBuffer());
  return simpanGambar(`posts/${st.post_id}/tata-r${st.rev}-u${k}-${Date.now().toString(36)}.png`, out);
}

const catatanVersi = (st, k) => {
  const units = unitList(st);
  return units.length > 1 ? `This photo is version "${units[k].label}" of a two-version comparison post; keep the same type of room and camera angle as the other version so they compare fairly, but style it to match this version.` : '';
};

async function fotoBaruUnit(st, k, catatan = '') {
  // panduan kotak bernomor tidak dipakai lagi (membuat foto kaku); posisi pin diambil dari deteksi
  const tata = null;
  return buatFotoUnit(st, k, bodyFotoBaru(viewUnit(st, unitList(st)[k]), tata, [catatanVersi(st, k), catatan].filter(Boolean).join(' ')));
}

// ---------- research agent ----------
async function buatBrief(chat) {
  const riwayat = (await bacaJson(RIWAYAT)) || [];
  const resep = pilihResep(riwayat);
  const keluhan = ((await bacaJson(KELUHAN)) || []).slice(-12).map((x) => x.k);
  const b = bacaJsonModel(await claude(bodyBrief(resep, riwayat, keluhan)));
  const w = new Date(Date.now() + 7 * 3600e3).toISOString();
  let id = `PG-${w.slice(0, 10).replace(/-/g, '')}-${w.slice(11, 16).replace(':', '')}`;
  if (riwayat.some((r) => r.id === id)) id += Math.random().toString(36).slice(2, 4);
  Object.assign(b, { id, format: resep.format, sumbu: resep.sumbu, mood: resep.mood, dibuat: sekarangWIB() });
  await simpanJson(`briefs/${id}.json`, b);
  await simpanJson(RIWAYAT, [...riwayat, { id, format: b.format, tema: b.tema, sumbu: b.sumbu, mood: b.mood, at: Date.now() }].slice(-40));
  await kirimTeks(chat, teksBrief(b), { inline_keyboard: [[{ text: 'Setuju', callback_data: `brief_ok|${id}` }, { text: 'Ganti brief', callback_data: `brief_ganti|${id}` }]] });
}

// perbaikan otomatis sekali kalau caption melanggar aturan (panjang, kata terlarang), supaya Andi tidak perlu revisi manual
async function perbaikiCaption(st) {
  if (!st.cek_caption.length) return;
  try {
    const t = bacaJsonModel(await claude(bodyRevisiTeks(st, `Perbaiki HANYA pelanggaran ini, sisanya pertahankan: ${st.cek_caption.join('; ')}.`)));
    for (const k of FIELD_TEKS_REVISI) if (isiTeks(t[k])) st.meta[k] = typeof t[k] === 'string' ? t[k].trim() : t[k];
    st.cek_caption = cekCaption(st.meta);
  } catch { /* tetap pakai versi sebelumnya */ }
}

// ---------- alur ----------
async function buatDraft(text, chat) {
  const { id, items: mentah } = bacaPesanLink(text);
  if (!id || !mentah.length) { await kirimTeks(chat, 'Format belum terbaca. Baris pertama "ID: PG-...", lalu satu baris per produk: Pin 1 - link - harga.'); return; }
  const items = await ambilSemua(mentah);
  const brief = await bacaJson(`briefs/${id}.json`);
  await kirimTeks(chat, `DITERIMA ${id}${brief ? ` · ${(FORMAT[brief.format] || {}).nama || brief.format}` : ''}\n\n${items.map((i) => `Pin ${i.pin} | ${i.nama_listing} | ${i.harga ? 'Rp' + i.harga : 'harga belum diisi'}`).join('\n')}\n\nContent agent sedang menyusun draft.`);
  const st = { post_id: id, chat, items, rev: 0, status: 'draft', brief: brief || null };
  // pembagian versi (format banding): ikut brief; pin di luar brief masuk versi terdekat
  const versi = brief && Array.isArray(brief.versi) && brief.versi.length > 1 ? brief.versi : null;
  const pinVersi = (pin) => {
    if (!versi) return 0;
    const k = versi.findIndex((v) => (v.slot || []).some((s) => Number(s.no_pin) === pin));
    if (k >= 0) return k;
    const batas = Math.max(...(versi[0].slot || []).map((s) => Number(s.no_pin)), 0);
    return pin <= batas ? 0 : 1;
  };
  st.versi = versi ? versi.map((v, k) => ({ label: v.label || `Versi ${k + 1}`, pins: items.filter((i) => pinVersi(i.pin) === k).map((i) => i.pin) })) : null;
  const meta = bacaJsonModel(await claude(bodyKonten(st)));
  meta.produk = gabungProduk(items, meta.produk);
  st.meta = meta; st.cek_caption = cekCaption(meta);
  await perbaikiCaption(st);
  st.visual = (st.versi && st.versi.every((v) => v.pins.length) ? st.versi : [{ label: '', pins: items.map((i) => i.pin) }])
    .map((v) => ({ label: v.label, pins: v.pins, img_url: null, rencana: null, boxes: [] }));
  await simpanState(st);
  await kirimTeks(chat, teksDraft(st, 'DRAFT KONTEN') + `\n\n${st.visual.length > 1 ? `${st.visual.length} foto` : 'Foto'} dan slide sedang dibuat (±1-2 menit).`);
  const uris = await Promise.all(st.visual.map((_, k) => fotoBaruUnit(st, k)));
  await deteksiRenderQc(st, uris, st.visual.map((_, k) => k));
}

async function revisiCaption(st, catatan) {
  const lama = { ...st.meta };
  const t = bacaJsonModel(await claude(bodyRevisiTeks(st, catatan)));
  for (const k of FIELD_TEKS_REVISI) if (isiTeks(t[k])) st.meta[k] = typeof t[k] === 'string' ? t[k].trim() : t[k];
  st.rev += 1; st.cek_caption = cekCaption(st.meta);
  await perbaikiCaption(st);
  // slide hanya dirender ulang kalau teks di slide berubah (gratis, tanpa AI)
  const units = unitList(st);
  const ubah = [];
  if (units[0].img_url && (lama.hook_judul !== st.meta.hook_judul || lama.hook_sub !== st.meta.hook_sub)) ubah.push(['hook', units.length - 1]);
  if (units[0].img_url && lama.cta !== st.meta.cta) ubah.push(['struk', 0]);
  if (units[0].img_url && JSON.stringify([lama.insight_judul, lama.insight]) !== JSON.stringify([st.meta.insight_judul, st.meta.insight])) ubah.push(['insight', 0]);
  if (ubah.length) {
    const urls = [];
    for (const [s, k] of ubah) urls.push(await render(st, await keDataUri(units[k].img_url), s));
    if (urls.length > 1) await kirimAlbum(st.chat, urls, `Slide yang berubah · ${st.post_id}`);
    else await kirimFoto(st.chat, urls[0], `Slide yang berubah · ${st.post_id}`);
  }
  await simpanState(st);
  await kirimTeks(st.chat, teksDraft(st, `REVISI CAPTION ${st.rev} ·`) + `\n\nFoto tidak diubah.${ubah.length ? '' : ' Slide tidak berubah.'}`, tombolDraft(st.post_id));
}

async function revisiFoto(st, catatan) {
  const units = unitList(st);
  // "hapus 5" / "hapus produk 3 dan 5" -> produk dikeluarkan, pin dinomori ulang
  const m = catatan.match(/hapus\s*(?:produk|pin|nomor|no\.?)?\s*((?:\d+\s*(?:,|dan|&)?\s*)+)/i);
  const pinHapus = m ? (m[1].match(/\d+/g) || []).map(Number) : [];
  const dihapus = st.meta.produk.filter((p) => pinHapus.includes(Number(p.pin)));
  // revisi hanya untuk satu versi kalau disebut: "versi 1", "versi B", atau label versinya
  let target = units.map((_, k) => k);
  if (units.length > 1) {
    const mv = catatan.match(/versi\s*([12ab])/i);
    const kSebut = mv ? (/[1a]/i.test(mv[1]) ? 0 : 1) : units.findIndex((u) => u.label && catatan.toLowerCase().includes(u.label.toLowerCase()));
    if (kSebut >= 0) target = [kSebut];
    if (dihapus.length) target = [...new Set(units.map((u, k) => (u.pins.some((p) => pinHapus.includes(p)) ? k : -1)).filter((k) => k >= 0))];
  }
  st.rev += 1;
  let catatanTambahan = '';
  const lamaPerUnit = units.map((u) => produkUnit(st, u));
  if (dihapus.length) {
    const sisa = st.meta.produk.filter((p) => !pinHapus.includes(Number(p.pin)));
    const peta = new Map(sisa.map((p, i) => [Number(p.pin), i + 1]));
    st.items = st.items.filter((i) => peta.has(Number(i.pin))).map((i) => ({ ...i, pin: peta.get(Number(i.pin)) }));
    st.meta.produk = sisa.map((p) => ({ ...p, pin: peta.get(Number(p.pin)) }));
    st.meta.deteksi_en = st.meta.produk.map((p) => `${p.pin}: ${p.deskripsi_en}`).join('\n');
    for (const u of units) {
      u.pins = u.pins.filter((p) => peta.has(p)).map((p) => peta.get(p));
      u.boxes = (u.boxes || []).filter((b) => peta.has(Number(b.pin))).map((b) => ({ ...b, pin: peta.get(Number(b.pin)) }));
      if (u.rencana) u.rencana = u.rencana.filter((r) => peta.has(Number(r.pin))).map((r) => ({ ...r, pin: peta.get(Number(r.pin)) }));
    }
    catatanTambahan = `Produk dihapus: ${dihapus.map((d) => d.nama).join(', ')}. Pin dinomori ulang. Kalau caption masih menyebutnya, pakai Revisi caption.`;
  }
  const dariNol = /foto baru|dari awal|ulang total|ganti total/i.test(catatan);
  await kirimTeks(st.chat, `Revisi foto ${st.post_id}${units.length > 1 ? ` (${target.map((k) => units[k].label).join(' & ')})` : ''} sedang dibuat. Caption tidak diubah.`);
  const uris = await Promise.all(units.map(async (u, k) => {
    if (!target.includes(k)) return keDataUri(u.img_url);
    const baru = dariNol || !u.img_url;
    if (baru) return fotoBaruUnit(st, k, catatan);
    const hapusDiUnit = dihapus.filter((d) => lamaPerUnit[k].some((p) => p.link === d.link));
    return buatFotoUnit(st, k, bodyEditFoto(viewUnit(st, u), catatan, hapusDiUnit));
  }));
  await deteksiRenderQc(st, uris, target, catatanTambahan);
}

async function rapikanPin(st) {
  const units = unitList(st);
  if (!units[0].img_url) { await kirimTeks(st.chat, 'Foto draft ini belum ada, pakai Revisi foto.'); return; }
  st.rev += 1;
  await kirimTeks(st.chat, `Merapikan pin & label ${st.post_id} dari foto yang sama (tanpa foto baru).`);
  const uris = await Promise.all(units.map((u) => keDataUri(u.img_url)));
  await deteksiRenderQc(st, uris, units.map((_, k) => k));
}

// isi satu post di link bio: daftar barang + foto bersih per versi + titik pin + aturan meja
function postLanding(st, tanggal) {
  const units = unitList(st);
  const labelPin = (pin) => (units.length > 1 ? (units.find((u) => u.pins.includes(Number(pin))) || {}).label || '' : '');
  return { id: st.post_id, judul: st.meta.tema, kategori: st.meta.kategori, tanggal,
    produk: st.meta.produk.map((p) => ({ pin: p.pin, jenis: p.jenis, versi: labelPin(p.pin), nama: p.nama, harga: p.harga, link: p.link, img: p.img })),
    foto: units.filter((u) => u.img_url).map((u) => ({ label: u.label || '', img: u.img_url,
      pins: Object.fromEntries((u.boxes || []).map((b) => [b.pin, b.titik || [Math.round((b.box_2d[0] + b.box_2d[2]) / 2), Math.round((b.box_2d[1] + b.box_2d[3]) / 2)]])) })),
    insight: (st.meta.insight || []).map((i) => ({ judul: i.judul, isi: i.isi })) };
}

async function setujui(st) {
  const landing = (await bacaJson(LANDING)) || { posts: [] };
  const lama = landing.posts.find((p) => p.id === st.post_id);
  const post = postLanding(st, lama ? lama.tanggal : sekarangWIB());
  landing.posts = [post, ...landing.posts.filter((p) => p.id !== st.post_id)];
  await simpanJson(LANDING, landing);
  st.status = 'disetujui'; await simpanState(st);
  await kirimTeks(st.chat, `Draft ${st.post_id} disetujui${lama ? ' (menggantikan versi sebelumnya, tidak dobel)' : ''}. ${post.produk.length} produk sudah ada di link bio: ngemeja.vercel.app. Posting IG dan Threads tetap manual.`, { inline_keyboard: [[{ text: 'Buat video Reels', callback_data: `reels|${st.post_id}` }]] });
}

// perbarui semua post di link bio dari data draft terbaru (foto, titik pin, aturan meja)
async function segarkanLanding(chat) {
  const landing = (await bacaJson(LANDING)) || { posts: [] };
  let n = 0;
  landing.posts = await Promise.all(landing.posts.map(async (p) => {
    const st = await bacaState(p.id);
    if (!st || !st.meta) return p;
    n++; return postLanding(st, p.tanggal);
  }));
  await simpanJson(LANDING, landing);
  return kirimTeks(chat, `Link bio diperbarui: ${n} dari ${landing.posts.length} post sekarang punya foto bisa diketuk dan aturan meja.`);
}

const TANYA = {
  rev_caption: 'Kirim catatan revisi caption dalam satu pesan (contoh: judul lebih lucu, Threads lebih pendek). Hanya teks yang diubah, foto tetap.',
  rev_foto: 'Kirim catatan revisi foto dalam satu pesan (contoh: hapus 5, lampu ke kiri, sudut lebih lebar). Foto lama diedit, caption tetap. Tulis "foto baru" kalau mau dibuat ulang dari awal.',
};

// lanjutkan draft yang fotonya gagal dibuat (misal saldo habis): tanpa ID = draft terakhir
async function ulangFoto(chat, id) {
  if (!id) {
    // draft terbaru yang fotonya belum lengkap
    const r = ((await bacaJson(RIWAYAT)) || []).slice(-15).reverse();
    for (const x of r) { const st0 = await bacaState(x.id); if (st0 && st0.meta && unitList(st0).some((u) => !u.img_url)) { id = x.id; break; } }
    if (!id) return kirimTeks(chat, 'Tidak ada draft yang fotonya tertunda. Kalau mau ganti foto, pakai tombol Revisi foto, atau ketik "ulang PG-..." dengan ID draft.');
  }
  const st = id && await bacaState(id);
  if (!st || !st.meta) return kirimTeks(chat, 'Draft tidak ditemukan. Ketik "ulang PG-..." dengan ID draft.');
  st.chat = chat;
  const units = unitList(st);
  const kosong = units.map((u, k) => (u.img_url ? -1 : k)).filter((k) => k >= 0);
  if (!kosong.length) return kirimTeks(chat, `Foto ${id} sudah ada. Untuk mengganti foto, pakai tombol Revisi foto.`);
  await kirimTeks(chat, `Melanjutkan ${id}: membuat ${kosong.length} foto dan slide (±1-2 menit).`);
  const uris = await Promise.all(units.map((u, k) => (kosong.includes(k) ? fotoBaruUnit(st, k) : keDataUri(u.img_url))));
  await deteksiRenderQc(st, uris, kosong);
}

async function proses(d) {
  const chat = String(d.chat || CHAT_DEFAULT);
  let text = d.t ? b64(d.t) : '';
  const cb = d.cb ? b64(d.cb) : '';
  try {
    if (d.aksi === 'brief') return await buatBrief(chat);
    if (cb) {
      await jawabTombol(d.cbid);
      const [aksi, id] = cb.split('|');
      if (aksi === 'brief_ok') return await kirimTeks(chat, `Siap. Kirim satu pesan: baris pertama ID di bawah, lalu satu baris per produk, contoh: Pin 1 - link - 89000 (harga boleh dikosongkan).\n\nID: ${id}`);
      if (aksi === 'brief_ganti') { await kirimTeks(chat, `Oke, ${id} dilewati. Research agent sedang membuat brief baru dengan format lain.`); return await buatBrief(chat); }
      const st = await bacaState(id);
      if (!st) return await kirimTeks(chat, `Draft ${id} dibuat dengan sistem lama, jadi tidak bisa direvisi atau disetujui dari sini. Kirim ulang link-nya kalau mau dibuat ulang.`);
      st.chat = chat;
      if (aksi === 'draft_ok') return await setujui(st);
      if (aksi === 'reels') {
        await kirimTeks(chat, `Membuat video ${id} (Reels/Shorts/FB): berantakan → jadi, potongan ikut ketukan musik.`);
        return await mintaVideo(chat, id);
      }
      if (aksi === 'draft_revisi') return await kirimTeks(chat, `Mau revisi bagian apa untuk ${id}?`, tombolDraft(id));
      if (aksi === 'rev_pin') return await rapikanPin(st);
      if (TANYA[aksi]) { await simpanJson(PENDING, { aksi, id, at: Date.now() }); return await kirimTeks(chat, `${TANYA[aksi]}\n\nKetik "batal" kalau tidak jadi. Menunggu maksimal 3 jam.\n\nID: ${id}`); }
      return await kirimTeks(chat, 'Tombol tidak dikenal.');
    }
    if (d.audio) return await tambahMusik(chat, { fileId: d.audio, nama: d.audioNama, mood: (text.match(/\b(lofi|happy|chill)\b/i) || [])[1] });
    if (d.foto) return await risetKomen(chat, text.replace(/^\/?komen\b\s*/i, ''), d.foto);
    if (!text) return;
    if (RE_LINK_SHOPEE.test(text) && !/^\/?(komen|musik)\b/i.test(text.trim())) {
      // pesan berisi link Shopee = kirim produk untuk draft; ID boleh lupa (pakai brief terbaru yang belum jadi draft)
      if (!bacaPesanLink(text).id) {
        const r = ((await bacaJson(RIWAYAT)) || []).slice(-10).reverse();
        let idBrief = null;
        for (const x of r) { const ada = await bacaState(x.id); if (!ada) { idBrief = x.id; break; } }
        if (!idBrief) return await kirimTeks(chat, 'Link Shopee diterima, tapi ID brief tidak ada di pesan dan semua brief terakhir sudah jadi draft. Tambahkan baris "ID: PG-..." di awal pesan lalu kirim ulang.');
        await kirimTeks(chat, `ID brief tidak ada di pesan, jadi aku pakai brief terbaru yang belum dibuat draft: ${idBrief}.`);
        text = `ID: ${idBrief}\n${text}`;
      }
      return await buatDraft(text, chat);
    }
    const perintah = text.trim().toLowerCase().replace(/^\//, '');
    if (/^(brief( baru)?|brief_baru)$/.test(perintah)) {
      await simpanJson(PENDING, {});
      await kirimTeks(chat, 'Research agent sedang membuat brief baru.');
      return await buatBrief(chat);
    }
    if (/^komen\b/.test(perintah) && perintah.length > 20) return await risetKomen(chat, text.replace(/^\/?komen\b\s*/i, ''), '');
    if (/^(reels|video)\b/.test(perintah)) {
      let id = (text.match(/PG-[0-9A-Za-z-]+/) || [])[0];
      if (!id) { const l = (await bacaJson(LANDING)) || { posts: [] }; id = l.posts[0] && l.posts[0].id; }
      if (!id) return await kirimTeks(chat, 'Belum ada post yang disetujui. Ketik "reels PG-..." dengan ID draft.');
      await kirimTeks(chat, `Membuat video ${id} (Reels/Shorts/FB).`);
      return await mintaVideo(chat, id);
    }
    if (/^musik\s+https?:/.test(perintah)) {
      const mood = (text.match(/\b(lofi|happy|chill)\b/i) || [])[1];
      const urls = text.match(/https?:\/\/\S+/g) || [];
      for (const url of urls.slice(0, 6)) await tambahMusik(chat, { url, mood: mood && mood.toLowerCase(), lisensi: /opengameart/i.test(url) ? 'CC0 (OpenGameArt)' : undefined });
      return await kirimTeks(chat, `${urls.length} link musik sedang diproses, hasilnya dikabari satu per satu.`);
    }
    if (/^(daftar )?musik$/.test(perintah)) {
      const dm = (await bacaJson('musik/daftar.json')) || [];
      return await kirimTeks(chat, dm.length ? `PERPUSTAKAAN MUSIK (${dm.length})\n${dm.map((l) => `- ${l.judul} · ${Math.round(l.bpm)} BPM · ${(l.mood || []).join(',')} · dipakai ${l.dipakai || 0}x`).join('\n')}` : 'Perpustakaan musik masih kosong.');
    }
    if (/^ulang\b/.test(perintah)) return await ulangFoto(chat, (text.match(/PG-[0-9A-Za-z-]+/) || [])[0]);
    if (/^(segarkan|perbarui) (link ?bio|landing)$/.test(perintah)) return await segarkanLanding(chat);
    if (/^(laporan|report|rekap)$/.test(perintah)) {
      await kirimTeks(chat, 'Report agent sedang merangkum 7 hari terakhir.');
      // 7 hari terakhir termasuk hari ini (batas = besok 00.00 WIB)
      const besok = Date.parse(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+07:00') + 86400e3;
      return await kirimLaporan(chat, besok);
    }
    if (/^(batal|cancel|stop)$/.test(perintah)) {
      await simpanJson(PENDING, {});
      return await kirimTeks(chat, 'Oke, revisi yang ditunggu dibatalkan. Ketik "brief baru" kalau mau brief baru.');
    }
    const p = await bacaJson(PENDING);
    if (p && p.id && Date.now() - p.at < 3 * 3600e3) {
      await simpanJson(PENDING, {});
      const st = await bacaState(p.id);
      if (!st) return await kirimTeks(chat, `Data draft ${p.id} tidak ditemukan.`);
      st.chat = chat;
      return await p.aksi === 'rev_caption' ? revisiCaption(st, text) : revisiFoto(st, text);
    }
    return await kirimTeks(chat, 'Pesan diterima, tapi tidak ada revisi yang sedang ditunggu. Untuk revisi, tekan tombol Revisi di draft dulu. Ketik "brief baru" untuk minta brief baru.');
  } catch (e) {
    const pesan = String(e && e.message || e);
    const saldo = /402|Insufficient credits/i.test(pesan);
    await kirimTeks(chat, saldo
      ? 'GAGAL: saldo OpenRouter habis, jadi foto belum bisa dibuat. Isi saldo di openrouter.ai/settings/credits (atau nyalakan Auto Top-Up), lalu ketik "ulang" untuk melanjutkan draft terakhir. Caption yang sudah jadi tidak hilang.'
      : `GAGAL: ${pesan.slice(0, 500)}\nDraft yang sudah ada tidak berubah. Coba lagi, atau kabari Claude kalau terulang.`).catch(() => {});
  }
}

// update Telegram mentah -> format internal (sama dengan yang dulu dikirim Make)
function dariTelegram(u) {
  const m = u.message || u.edited_message;
  const q = u.callback_query;
  const chat = String((m && m.chat && m.chat.id) || (q && q.message && q.message.chat && q.message.chat.id) || '');
  const enc = (s) => (s ? Buffer.from(String(s)).toString('base64') : '');
  const foto = m && Array.isArray(m.photo) && m.photo.length ? m.photo[m.photo.length - 1].file_id : '';
  const doc = m && m.document && /audio|zip|ogg|mpeg/i.test(m.document.mime_type || m.document.file_name || '') ? m.document : null;
  const aud = m && (m.audio || doc);
  return { chat, t: enc(m && (m.text || m.caption)), cb: enc(q && q.data), cbid: (q && q.id) || '', foto,
    audio: aud ? aud.file_id : '', audioNama: aud ? (aud.file_name || aud.title || 'lagu.mp3') : '' };
}

const DOMAIN = () => process.env.VERCEL_PROJECT_PRODUCTION_URL || 'ngemeja.vercel.app';

// unduh foto Telegram (screenshot) -> base64
async function unduhFotoTg(fileId) {
  const f = await tgApi('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { b64: buf.toString('base64'), mime: /\.png$/i.test(f.file_path) ? 'image/png' : 'image/jpeg' };
}

async function risetKomen(chat, teks, fotoId) {
  await kirimTeks(chat, 'Agent komentar sedang membaca postingan dan komentarnya.');
  const g = fotoId ? await unduhFotoTg(fotoId) : null;
  const j = bacaJsonModel(await claude(bodyKomen(teks, g && g.b64, g && g.mime)));
  // keluhan nyata audiens disimpan untuk research agent (bahan brief berikutnya)
  if (Array.isArray(j.keluhan) && j.keluhan.length) {
    const lama = (await bacaJson(KELUHAN)) || [];
    await simpanJson(KELUHAN, [...lama, ...j.keluhan.map((k) => ({ k, at: Date.now() }))].slice(-60));
  }
  return kirimTeks(chat, teksKomen(j));
}

async function tambahMusik(chat, d) {
  const r = await fetch(`https://${DOMAIN()}/api/musik`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: process.env.BOT_SECRET, chat, ...d }) });
  if (!r.ok) return kirimTeks(chat, `Server musik menolak permintaan (${r.status}).`);
}

async function mintaVideo(chat, id) {
  const r = await fetch(`https://${DOMAIN()}/api/video`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: process.env.BOT_SECRET, id, chat }) });
  if (!r.ok) return kirimTeks(chat, `Server video menolak permintaan (${r.status}).`);
}

async function kirimLaporan(chat, sampaiMs) {
  const d = await kumpulkan(sampaiMs);
  let catatan = '';
  try { catatan = (await claude(bodyLaporan(d))).trim(); } catch (e) { catatan = `(Report agent gagal menulis catatan: ${String(e.message || e).slice(0, 120)})`; }
  await kirimTeks(chat, `${teksAngka(d)}\n\nCATATAN AKU\n${catatan}`);
}

// Senin pagi: laporan 7 hari terakhir (Senin-Minggu), maksimal sekali per 6 hari
async function laporanTerjadwal() {
  const t = (await bacaJson('laporan/terakhir.json')) || {};
  if (t.at && Date.now() - t.at < 6 * 86400e3) return 'dilewati';
  const w = new Date(Date.now() + 7 * 3600e3); const hariIni = Date.parse(w.toISOString().slice(0, 10) + 'T00:00:00+07:00');
  await kirimLaporan(CHAT_DEFAULT, hariIni);
  await simpanJson('laporan/terakhir.json', { at: Date.now() });
  return 'dikirim';
}

async function briefTerjadwal() {
  // penjaga: maksimal satu brief terjadwal per 20 jam
  const riwayat = (await bacaJson(RIWAYAT)) || [];
  const last = riwayat.filter((r) => r.terjadwal).pop();
  if (last && last.at && Date.now() - last.at < 20 * 3600e3) return 'dilewati';
  await buatBrief(CHAT_DEFAULT);
  const r2 = (await bacaJson(RIWAYAT)) || [];
  if (r2.length) { r2[r2.length - 1].terjadwal = true; await simpanJson(RIWAYAT, r2); }
  return 'dibuat';
}

export default async function handler(req, res) {
  // penghitung kunjungan & klik link bio (publik, tanpa data pribadi)
  if (req.query.a === 'ev') {
    try { await catat({ j: req.query.j, id: req.query.id, pin: req.query.pin, src: req.query.src }); } catch { /* jangan ganggu pengunjung */ }
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    // Vercel Cron (Sen/Rab/Jum ±06.30 WIB)
    if (req.query.a === 'cron') {
      const auth = req.headers.authorization || '';
      const resmi = process.env.CRON_SECRET ? auth === `Bearer ${process.env.CRON_SECRET}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
      if (!resmi) return res.status(401).json({ ok: false });
      try {
        // cron jalan tiap hari ±06.30 WIB: brief Sen/Rab/Jum, laporan tiap Senin
        const hari = new Date(Date.now() + 7 * 3600e3).getUTCDay();
        const hasil = {};
        if (hari === 1) hasil.laporan = await laporanTerjadwal().catch((e) => `gagal: ${e.message}`);
        if ([1, 3, 5].includes(hari)) hasil.brief = await briefTerjadwal();
        return res.status(200).json(hasil);
      }
      catch (e) { await kirimTeks(CHAT_DEFAULT, `GAGAL brief terjadwal: ${String(e.message || e).slice(0, 300)}`).catch(() => {}); return res.status(500).json({ ok: false }); }
    }
    // pasang / cek webhook Telegram langsung ke server ini (butuh ?s=BOT_SECRET)
    if ((req.query.a === 'pasangwebhook' || req.query.a === 'infowebhook') && process.env.BOT_SECRET && req.query.s === process.env.BOT_SECRET) {
      try {
        if (req.query.a === 'pasangwebhook') {
          await tgApi('setWebhook', { url: `https://${DOMAIN()}/api/bot`, secret_token: process.env.BOT_SECRET,
            allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
        }
        const info = await tgApi('getWebhookInfo', {});
        return res.status(200).json({ url: info.url, pending: info.pending_update_count, error_terakhir: info.last_error_message || null });
      } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
    }
    if (req.query.a === 'landing') {
      const l = adaBlob() ? await bacaJson(LANDING) : null;
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
      return res.status(200).json(l || { posts: [] });
    }
    // hapus satu post dari link bio (butuh ?s=BOT_SECRET&id=PG-...)
    if (req.query.a === 'hapuslanding' && process.env.BOT_SECRET && req.query.s === process.env.BOT_SECRET) {
      const l = (await bacaJson(LANDING)) || { posts: [] };
      const sebelum = l.posts.length;
      l.posts = l.posts.filter((p) => p.id !== req.query.id);
      await simpanJson(LANDING, l);
      return res.status(200).json({ dihapus: sebelum - l.posts.length, sisa: l.posts.map((p) => `${p.id} | ${p.judul}`) });
    }
    // uji tulis-baca Blob (butuh ?s=BOT_SECRET)
    if (req.query.a === 'tesblob' && process.env.BOT_SECRET && req.query.s === process.env.BOT_SECRET) {
      try { const t = Date.now(); await simpanJson('tes/blob.json', { t }); const r = await bacaJson('tes/blob.json');
        return res.status(200).json({ tulis: true, baca: !!r, cocok: !!r && r.t === t }); }
      catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
    }
    // uji deteksi pada foto draft tersimpan, tanpa kirim ke Telegram (butuh ?s=BOT_SECRET&id=PG-...)
    if (req.query.a === 'tesdeteksi' && process.env.BOT_SECRET && req.query.s === process.env.BOT_SECRET) {
      try {
        const st = await bacaState(req.query.id); st.rev = 'tes';
        const units = unitList(st);
        const uris = await Promise.all(units.map((u) => keDataUri(u.img_url)));
        await Promise.all(units.map((u, k) => deteksiUnit(st, u, uris[k])));
        const hasil = semuaBoxes(st);
        const { slides: urls } = await renderSemua(st, uris);
        return res.status(200).json({ hasil, urls });
      } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
    }
    // cek kesiapan tanpa membuka isi rahasia
    const ada = (k) => !!process.env[k];
    return res.status(200).json({ ANTHROPIC_API_KEY: ada('ANTHROPIC_API_KEY'), OPENROUTER_API_KEY: ada('OPENROUTER_API_KEY'),
      TELEGRAM_BOT_TOKEN: ada('TELEGRAM_BOT_TOKEN'), BOT_SECRET: ada('BOT_SECRET'), BLOB: adaBlob() });
  }
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  if (req.headers['x-telegram-bot-api-secret-token'] === process.env.BOT_SECRET) {
    // webhook Telegram langsung: hanya chat Andi yang dilayani
    const u = dariTelegram(d || {});
    if (u.chat !== CHAT_DEFAULT) return res.status(200).json({ ok: true });
    waitUntil(proses(u));
    return res.status(200).json({ ok: true });
  }
  if (!d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(proses(d));
  return res.status(200).json({ ok: true });
}
export { proses };
