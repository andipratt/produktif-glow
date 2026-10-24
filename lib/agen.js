// Penyusun permintaan untuk agent AI (dipanggil langsung oleh server, API key di env Vercel) + cek aturan caption tanpa AI.
import { CONTENT_SYSTEM } from './content_prompt.js';

const SONNET = 'claude-sonnet-4-5';
const HAIKU = 'claude-haiku-4-5';

// ---------- Content agent ----------
export function bodyKonten(st) {
  const daftar = st.items.map((i) => `Pin ${i.pin} | ${i.nama_listing} | ${i.harga ? 'Rp' + i.harga : 'harga belum diisi'}`).join('\n');
  return ({
    model: SONNET, max_tokens: 4000, system: [{ type: 'text', text: CONTENT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: `ID post: ${st.post_id}\nProduk:\n${daftar}` },
      { role: 'assistant', content: '{' },
    ],
  });
}

// ---------- Revisi teks: hanya caption/judul, tidak menyentuh foto ----------
const FIELD_TEKS = ['hook_judul', 'hook_sub', 'cta', 'caption_ig', 'caption_threads'];
export function bodyRevisiTeks(st, catatan) {
  const sekarang = Object.fromEntries(FIELD_TEKS.map((k) => [k, st.meta[k] || '']));
  const sys = CONTENT_SYSTEM.split('FORMAT KELUARAN')[0] +
    'TUGAS SEKARANG: revisi teks draft yang sudah ada sesuai catatan Andi. Ubah HANYA bagian yang diminta; bagian lain salin persis apa adanya. ' +
    'Tetap patuhi semua aturan suara akun dan batas panjang (hook_judul maks 45 karakter, hook_sub maks 90, cta maks 40, caption_ig 250-600 karakter, caption_threads maks 200 karakter tanpa link/hashtag/\"link di bio\"). ' +
    'Keluarkan HANYA objek JSON valid dengan kunci: ' + FIELD_TEKS.join(', ') + '.';
  return ({
    model: SONNET, max_tokens: 1500, system: sys,
    messages: [
      { role: 'user', content: `Draft sekarang:\n${JSON.stringify(sekarang, null, 1)}\n\nCatatan revisi dari Andi:\n${catatan}` },
      { role: 'assistant', content: '{' },
    ],
  });
}
export const FIELD_TEKS_REVISI = FIELD_TEKS;

// ---------- Visual agent ----------
const PERSONA_VISUAL = 'You are the visual director of @produktif.glow: a perfectionist man in his early 30s with a tidy eye and a distinctive artistic taste. Your photos are so natural that nobody can tell whether they are AI or a real photo.';
const REALISME = 'Make it look genuinely shot on a phone by a real person: slight natural grain, true-to-life colors (not oversaturated), soft uneven daylight with natural shadows, realistic materials and reflections, small lived-in imperfections (a slightly wrinkled cloth, a cable, a mug), no plastic or waxy textures, no perfect symmetry, no glowing CGI look. Absolutely no text, labels, numbers, arrows, captions or watermarks anywhere in the image.';

function refs(urls) { return urls.filter(Boolean).map((u) => ({ type: 'image_url', image_url: { url: u } })); }

export function bodyFotoBaru(st) {
  const prompt = `${PERSONA_VISUAL} Realistic smartphone photo for an Instagram carousel, portrait 4:5. Scene: ${st.meta.scene_en || 'a tidy desk in a small Indonesian rented room'}. ` +
    'Show exactly the products from the reference images, one of each, placed naturally in the scene and reproduced faithfully: same shape, colors, materials, logos and printed text as in the references. ' +
    'Frame it as a slightly wide shot taken a step back, so the whole arrangement fits with breathing room around it. Arrange the products side by side with clear gaps between them; no product may sit on top of, under, or in front of another product. ' +
    'Every product must be fully visible and large enough to recognise; spread them across the middle of the frame and leave calm empty space (wall, floor, desk surface) around the edges for labels. Do not add any other branded products. ' +
    'Ignore promotional text, badges, prices, collages or watermarks in the reference images; use only the product itself. Natural soft daylight, warm neutral tones, tidy but lived-in. Keep the top third calm and less busy. ' + REALISME;
  return ({ model: 'google/gemini-3.1-flash-image', prompt, input_references: refs(st.items.map((i) => i.img)), resolution: '1K', aspect_ratio: '4:5', n: 1 });
}

// Revisi visual: EDIT foto lama, bukan membuat dari nol
export function bodyEditFoto(st, catatan, dihapus) {
  const hapus = dihapus.length ? ` Remove these products completely from the photo and fill their space naturally with the surface behind them: ${dihapus.map((d) => d.nama).join('; ')}.` : '';
  const prompt = `${PERSONA_VISUAL} Edit the FIRST reference image, which is the current photo of this post. Owner's change request (in Indonesian): "${catatan}".${hapus} ` +
    'Change only what is requested. Keep everything else exactly the same: camera angle, framing, room, lighting, colors, and the position, size and look of every other product. ' +
    'The other reference images only show the remaining products for accuracy; do not add extra copies. Portrait 4:5. ' + REALISME;
  return ({ model: 'google/gemini-3.1-flash-image', prompt, input_references: refs([st.img_url, ...st.items.map((i) => i.img)]), resolution: '1K', aspect_ratio: '4:5', n: 1 });
}

// Deteksi posisi produk (Gemini Flash lewat OpenRouter)
export function bodyDeteksi(st, dataUri) {
  const daftar = st.meta.produk.map((p) => `${p.pin}: ${p.deskripsi_en || p.nama}`).join('\n');
  const teks = 'You locate objects in a room photo. For each numbered product description below, find that exact object and return its tight bounding box as box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000 relative to the full image. Pick the object that best matches the description (for example a wooden monitor stand is the wooden shelf under the monitor, not the monitor itself). If a product is not visible, omit it. Respond ONLY with JSON: {"boxes":[{"pin":1,"box_2d":[0,0,0,0]}]}\nProducts:\n' + daftar;
  return { model: 'google/gemini-2.5-flash', temperature: 0, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: teks }, { type: 'image_url', image_url: { url: dataUri } }] }] };
}

// ---------- QC: AI hanya cek pin vs produk + kesan AI (Haiku, 1 gambar). Caption dicek kode ----------
export function bodyQc(st, qcUrl) {
  const daftar = st.meta.produk.map((p) => `${String(p.pin).padStart(2, '0')} = ${p.nama} (${p.jenis || ''})`).join('\n');
  const sys = 'Kamu QC visual @produktif.glow: laki-laki milenial 30-an yang perfeksionis, rapi, dan punya selera seni unik. ' +
    'Gambar berisi foto dengan kotak kuning bernomor. Untuk setiap nomor, cek apakah kotak itu membingkai benda yang sesuai namanya (contoh: "Rak Monitor" harus kotak di rak kayu di bawah monitor, bukan monitornya). Nomor merah di daftar = tidak terdeteksi = salah. ' +
    'Nilai juga apakah foto terlihat natural seperti foto HP asli atau jelas buatan AI (tekstur plastik, cahaya aneh, benda cacat, produk menumpuk). ' +
    'Jawab HANYA JSON: {"pin":[{"pin":1,"tepat":true,"catatan":""}],"pin_lolos":true,"foto_natural":true,"ringkasan":"maks 25 kata, sebut nomor yang salah dan perbaikannya"}';
  return ({
    model: HAIKU, max_tokens: 800, system: sys,
    messages: [
      { role: 'user', content: [{ type: 'image', source: { type: 'url', url: qcUrl } }, { type: 'text', text: `Daftar produk:\n${daftar}` }] },
      { role: 'assistant', content: '{' },
    ],
  });
}

// ---------- Cek aturan caption (gratis, tanpa AI) ----------
const LARANG = [['affiliate', /affiliat/i], ['komisi', /komisi/i], ['iklan', /\biklan\b/i], ['endorse', /endorse/i], ['sponsor', /sponsor/i], ['#ad', /#ad\b/i],
  ['racun', /racun/i], ['wajib beli', /wajib beli/i], ['murah banget', /murah banget/i], ['Yuk', /(^|\n)\s*yuk\b/i], ['Halo guys', /halo guys/i], ['Siapa bilang', /siapa bilang/i],
  ['elevate', /elevate/i], ['game changer', /game ?changer/i], ['must-have', /must[- ]have/i], ['sempurna', /sempurna/i], ['dijamin', /dijamin/i]];
const emoji = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;

export function cekCaption(m) {
  const out = [];
  const ig = String(m.caption_ig || ''), th = String(m.caption_threads || '');
  if (ig.length < 200 || ig.length > 650) out.push(`caption IG ${ig.length} karakter (target 250-600)`);
  if (th.length > 200) out.push(`caption Threads ${th.length} karakter (maks 200)`);
  if (/https?:|link di bio|#/i.test(th)) out.push('Threads berisi link/hashtag/"link di bio"');
  if (/Rp\s?\d/i.test(ig)) out.push('caption IG menyebut harga');
  if (emoji(ig) > 2 || emoji(th) > 2) out.push('emoji lebih dari 2');
  if (String(m.hook_judul || '').length > 45) out.push(`judul hook ${String(m.hook_judul).length} karakter (maks 45)`);
  for (const [nama, re] of LARANG) if (re.test(ig) || re.test(th) || re.test(m.hook_judul || '')) out.push(`kata terlarang: ${nama}`);
  return out;
}

// Ambil objek JSON dari teks balasan model (prefill "{")
export function bacaJsonModel(t) {
  let s = String(t || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  if (!s.startsWith('{')) s = '{' + s;
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}
