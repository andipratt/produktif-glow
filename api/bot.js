// Otak bot Produktif Glow. Make hanya meneruskan setiap update Telegram ke sini (1 modul),
// semua langkah (baca link, content agent, foto, deteksi, render, QC, revisi, setujui) dikerjakan di server.
// Rahasia di env Vercel: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, BOT_SECRET, BLOB_READ_WRITE_TOKEN.
import { waitUntil } from '@vercel/functions';
import { renderSlide } from '../lib/render.js';
import { adaBlob, bacaJson, simpanJson, bacaState, simpanState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimAlbum, kirimFoto, jawabTombol, tombolDraft, CHAT_DEFAULT } from '../lib/tg.js';
import { bacaPesanLink, ambilSemua } from '../lib/shopee.js';
import { bodyKonten, bodyRevisiTeks, FIELD_TEKS_REVISI, bodyFotoBaru, bodyEditFoto, bodyDeteksiSatu, bodyQc, cekCaption, bacaJsonModel } from '../lib/agen.js';
import { claude, gambar, chatOR } from '../lib/ai.js';
import { rencanaTata } from '../lib/layout.js';
import { lumDariDataUri } from '../lib/lum.js';
import { FORMAT, pilihResep, bodyBrief, teksBrief } from '../lib/brief.js';

export const config = { maxDuration: 300 };

const isiTeks = (v) => (typeof v === 'string' ? !!v.trim() : Array.isArray(v) && v.length > 0);
const b64 = (s) => Buffer.from(String(s || ''), 'base64').toString('utf8');
const pad = (n) => String(n).padStart(2, '0');
const sekarangWIB = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const PENDING = 'pending.json';
const LANDING = 'landing.json';
const RIWAYAT = 'briefs/riwayat.json';

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
async function deteksiSatu(p, dataUri) {
  const coba = async (prod) => {
    try {
      const j = bacaJsonModel(await chatOR(bodyDeteksiSatu(prod, dataUri)));
      const b = Array.isArray(j.box_2d) ? j.box_2d.map(Number) : null;
      if (j.found === false || !b || b.length !== 4 || b[2] <= b[0] || b[3] <= b[1]) return null;
      return b;
    } catch { return null; }
  };
  // percobaan kedua tanpa foto listing (kadang foto promo justru membingungkan)
  return (await coba(p)) || (p.img ? await coba({ ...p, img: '' }) : null);
}

async function deteksiUnit(st, u, uri) {
  const hasil = await Promise.all(produkUnit(st, u).map(async (p) => { const b = await deteksiSatu(p, uri); return b ? { pin: p.pin, box_2d: b } : null; }));
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
  const b = bacaJsonModel(await claude(bodyBrief(resep, riwayat)));
  const w = new Date(Date.now() + 7 * 3600e3).toISOString();
  let id = `PG-${w.slice(0, 10).replace(/-/g, '')}-${w.slice(11, 16).replace(':', '')}`;
  if (riwayat.some((r) => r.id === id)) id += Math.random().toString(36).slice(2, 4);
  Object.assign(b, { id, format: resep.format, sumbu: resep.sumbu, mood: resep.mood, dibuat: sekarangWIB() });
  await simpanJson(`briefs/${id}.json`, b);
  await simpanJson(RIWAYAT, [...riwayat, { id, format: b.format, tema: b.tema, sumbu: b.sumbu, mood: b.mood }].slice(-40));
  await kirimTeks(chat, teksBrief(b), { inline_keyboard: [[{ text: 'Setuju', callback_data: `brief_ok|${id}` }, { text: 'Ganti brief', callback_data: `brief_ganti|${id}` }]] });
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
  // perbaikan otomatis sekali kalau caption melanggar aturan (panjang, kata terlarang), supaya Andi tidak perlu revisi manual
  if (st.cek_caption.length) {
    try {
      const t = bacaJsonModel(await claude(bodyRevisiTeks(st, `Perbaiki HANYA pelanggaran ini, sisanya pertahankan: ${st.cek_caption.join('; ')}.`)));
      for (const k of FIELD_TEKS_REVISI) if (isiTeks(t[k])) st.meta[k] = typeof t[k] === 'string' ? t[k].trim() : t[k];
      st.cek_caption = cekCaption(st.meta);
    } catch { /* tetap pakai versi pertama */ }
  }
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

async function setujui(st) {
  const landing = (await bacaJson(LANDING)) || { posts: [] };
  const units = unitList(st);
  const labelPin = (pin) => (units.length > 1 ? (units.find((u) => u.pins.includes(Number(pin))) || {}).label || '' : '');
  const post = { id: st.post_id, judul: st.meta.tema, kategori: st.meta.kategori, tanggal: sekarangWIB(),
    produk: st.meta.produk.map((p) => ({ pin: p.pin, jenis: labelPin(p.pin) ? `${labelPin(p.pin)} · ${p.jenis}` : p.jenis, nama: p.nama, harga: p.harga, link: p.link, img: p.img })) };
  const ulang = landing.posts.some((p) => p.id === st.post_id);
  if (ulang) post.tanggal = landing.posts.find((p) => p.id === st.post_id).tanggal;
  landing.posts = [post, ...landing.posts.filter((p) => p.id !== st.post_id)];
  await simpanJson(LANDING, landing);
  st.status = 'disetujui'; await simpanState(st);
  await kirimTeks(st.chat, `Draft ${st.post_id} disetujui${ulang ? ' (menggantikan versi sebelumnya, tidak dobel)' : ''}. ${post.produk.length} produk sudah ada di link bio: produktif-glow.vercel.app. Posting IG dan Threads tetap manual.`, { inline_keyboard: [[{ text: 'Buat video Reels (gratis)', callback_data: `reels|${st.post_id}` }]] });
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
    if (d.aksi === 'brief') return buatBrief(chat);
    if (cb) {
      await jawabTombol(d.cbid);
      const [aksi, id] = cb.split('|');
      if (aksi === 'brief_ok') return kirimTeks(chat, `Siap. Kirim satu pesan: baris pertama ID di bawah, lalu satu baris per produk, contoh: Pin 1 - link - 89000 (harga boleh dikosongkan).\n\nID: ${id}`);
      if (aksi === 'brief_ganti') { await kirimTeks(chat, `Oke, ${id} dilewati. Research agent sedang membuat brief baru dengan format lain.`); return buatBrief(chat); }
      const st = await bacaState(id);
      if (!st) return kirimTeks(chat, `Draft ${id} dibuat dengan sistem lama, jadi tidak bisa direvisi atau disetujui dari sini. Kirim ulang link-nya kalau mau dibuat ulang.`);
      st.chat = chat;
      if (aksi === 'draft_ok') return setujui(st);
      if (aksi === 'reels') {
        await kirimTeks(chat, `Membuat video Reels ${id} dari slide (±1 menit, tanpa biaya AI).`);
        const r = await fetch(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'produktif-glow.vercel.app'}/api/video`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: process.env.BOT_SECRET, id, chat }) });
        if (!r.ok) return kirimTeks(chat, `Server video menolak permintaan (${r.status}).`);
        return;
      }
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
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(proses(d));
  return res.status(200).json({ ok: true });
}
export { proses };
