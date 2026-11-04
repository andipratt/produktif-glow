import { BRAND, KURATOR, MOOD } from './brand.js';
// Penyusun permintaan untuk agent AI (dipanggil langsung oleh server, API key di env Vercel) + cek aturan caption tanpa AI.
import { CONTENT_SYSTEM, ATURAN_NASKAH_REELS } from './content_prompt.js';

const SONNET = 'claude-sonnet-4-5';
export const HAIKU = 'claude-haiku-4-5';

// ---------- Content agent ----------
export function bodyKonten(st) {
  const daftar = st.items.map((i) => `Pin ${i.pin} | ${i.nama_listing} | ${i.harga ? 'Rp' + i.harga : 'harga belum diisi'}`).join('\n');
  const b = st.brief;
  const brief = b ? `BRIEF (format: ${b.format})\nMood foto: ${b.mood && MOOD[b.mood] ? MOOD[b.mood].en : '-'}\nTema: ${b.tema}\nIde judul: ${b.judul_post} / ${(b.judul_alternatif || []).join(' / ')}\nSudut: ${b.sudut_konten}\nArahan: ${b.catatan_konten || '-'}\n` +
    (st.versi ? `Versi: ${st.versi.map((v) => `${v.label} = pin ${v.pins.join(', ')}`).join('; ')}\n` : '') : 'BRIEF: tidak ada (post manual), tentukan sudut terbaik sendiri.\n';
  return ({
    model: SONNET, max_tokens: 5500, system: [{ type: 'text', text: CONTENT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: `ID post: ${st.post_id}\n${brief}\nProduk:\n${daftar}` },
      { role: 'assistant', content: '{' },
    ],
  });
}

// ---------- Revisi teks: hanya caption/judul, tidak menyentuh foto ----------
const FIELD_TEKS = ['hook_judul', 'hook_sub', 'cta', 'caption_ig', 'caption_threads', 'insight_judul', 'insight'];
export function bodyRevisiTeks(st, catatan) {
  const sekarang = Object.fromEntries(FIELD_TEKS.map((k) => [k, st.meta[k] || '']));
  const sys = CONTENT_SYSTEM.split('FORMAT KELUARAN')[0] +
    'TUGAS SEKARANG: revisi teks draft yang sudah ada sesuai catatan Andi. Ubah HANYA bagian yang diminta; bagian lain salin persis apa adanya. ' +
    'Tetap patuhi semua aturan suara akun dan batas panjang (hook_judul maks 45 karakter, hook_sub maks 90, cta maks 40, caption_ig 150-400 karakter gaya opini singkat, caption_threads maks 180 karakter tanpa link/hashtag/\"link di bio\"). Jangan menyebut merek/nama produk di caption. ' +
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
const PERSONA_VISUAL = `You are the visual director of @${BRAND.handle}: a perfectionist man in his early 30s with a tidy eye and a distinctive artistic taste. Your photos are so natural that nobody can tell whether they are AI or a real photo. The account's taste: real Indonesian rooms that are lived-in and full of small personal details, never empty or showroom-like.`;
const REALISME = 'Make it look like a real photograph taken by a skilled person with a recent iPhone or a full-frame camera with a good lens, then color graded in Lightroom: crisp sharp detail and textures, rich but believable color, clean contrast, controlled highlights and deep but not crushed shadows, one cohesive color palette that matches the mood, like a well-edited interior post on a popular Instagram account. ' +
  'It must still be a real photo, not a render: natural light direction and shadows, realistic materials and reflections, small lived-in imperfections (a slightly wrinkled cloth, a cable, a mug), no plastic or waxy textures, no perfect symmetry, no glowing CGI look, no fantasy luxury. Do not add any overlay text, captions, numbers, arrows, stickers or watermarks to the photo. ' +
  'IMPORTANT: every product must keep its real packaging print exactly like its reference image: brand name, logo, product name, colors and label design stay clearly visible and readable. Never turn a product into a blank, plain or unbranded container.';

function refs(urls) { return urls.filter(Boolean).map((u) => ({ type: 'image_url', image_url: { url: u } })); }

// Sudut kamera per post (dipilih research agent sesuai tema, berganti-ganti). gerak = gerak kamera video yang cocok.
export const SUDUT = {
  depan: { nama: 'Depan sejajar mata', gerak: 'maju',
    en: 'Straight-on front view at seated eye level, facing the desk and the wall behind it, symmetrical and calm; taken a step back so the whole desk, the chair back and some wall are visible.' },
  serong_atas: { nama: 'Serong atas depan', gerak: 'orbit',
    en: 'High-angle three-quarter view from the front corner, camera above standing head height looking down at about 35 degrees, so the desk surface, the items on it, the chair and some wall and floor are all visible.' },
  atas: { nama: 'Dari atas (flat lay)', gerak: 'putar',
    en: 'Top-down overhead view looking straight down at the desk surface, like a neat flat lay: the desktop fills most of the frame with the products laid out clearly, edges of the desk, chair seat or floor visible at the borders. Products that stand tall are seen from above.' },
  samping: { nama: 'Samping serong', gerak: 'orbit',
    en: 'Three-quarter side view from one side of the desk at seated eye level, showing the depth of the desk, the chair in profile and the window or wall beside it; taken a step back.' },
};
export const sudutPost = (st) => SUDUT[st.sudut || (st.brief && st.brief.sudut)] || SUDUT.serong_atas;

// Foto baru dari PANDUAN TATA LETAK: produk N wajib menempati kotak bernomor N, jadi posisi pin sudah pasti.
// Foto baru: ruangan yang bercerita sesuai brief (siapa pemiliknya), produk tampil jelas dan utuh.
export function bodyFotoBaru(st, _tataUrl, catatan = '') {
  const produk = st.meta.produk;
  // nomor reference image hanya untuk produk yang punya foto listing (supaya nomor tidak bergeser)
  const adaFoto = produk.filter((p) => p.img);
  const daftar = produk.map((p) => {
    const i = adaFoto.indexOf(p), rupa = p.rupa_en || p.deskripsi_en || p.nama;
    return i >= 0 ? `reference image ${i + 1} = ${rupa}` : `(no reference image) ${rupa}`;
  }).join('; ');
  const props = Array.isArray(st.meta.props_en) && st.meta.props_en.length ? st.meta.props_en.join('; ') :
    'a ceramic mug, a notebook with a pen, a few stacked books, a small plant, a charging cable, a small clock';
  const prompt = `${PERSONA_VISUAL} Realistic color-graded photo for an Instagram carousel, portrait 4:5. ` +
    `Scene: ${st.meta.scene_en || 'a lived-in workspace in a small Indonesian rented room'}. Mood and light: ${st.meta.suasana_en || 'soft natural daylight, mid-work moment'}. ` +
    (st.brief && st.brief.mood && MOOD[st.brief.mood] ? `Overall photographic look: ${MOOD[st.brief.mood].en}. ` : '') +
    'The photo must tell a story about who works at this desk. Dress the space with these UNBRANDED props that reveal the owner\'s job and habits, arranged naturally in layers ' +
    `(foreground desk items, the desk itself, and the wall or shelf behind it): ${props}. ` +
    'The frame should feel full, personal and lived-in, like a real person was just working here, but still organized and pleasant to look at; never sparse or empty. ' +
    `Featured products (must appear exactly once each, clearly visible, whole, not covered by props or other products, each with a little free space around it): ${daftar}. ` +
    'Reproduce every featured product faithfully from its reference image: same silhouette and proportions, same shape details (ribs, curves, legs, shade form), colors, materials, packaging, logos and printed text. The reference image wins over the text description if they differ. Ignore promotional text, badges, prices, collages and backgrounds in the reference images; use only the product itself. ' +
    'Props must not be the same type of item as any featured product (no extra lamp if a lamp is featured) and must not show logos. Do not add other branded products. ' +
    `Camera angle: ${sudutPost(st).en} ` + REALISME + (catatan ? ` Owner notes (Indonesian, follow them): ${catatan}` : '');
  return { model: 'google/gemini-3.1-flash-image', prompt, input_references: refs(adaFoto.map((p) => p.img)), resolution: '1K', aspect_ratio: '4:5', n: 1 };
}

// Revisi visual: EDIT foto lama, bukan membuat dari nol
export function bodyEditFoto(st, catatan, dihapus) {
  const hapus = dihapus.length ? ` Remove these products completely from the photo and fill their space naturally with the surface behind them: ${dihapus.map((d) => d.nama).join('; ')}.` : '';
  const prompt = `${PERSONA_VISUAL} Edit the FIRST reference image, which is the current photo of this post. Owner's change request (in Indonesian): "${catatan}".${hapus} ` +
    'Change only what is requested. Keep everything else exactly the same: camera angle, framing, room, lighting, colors, and the position, size and look of every other product, including its printed brand name, logo and label (copy them from the current photo; the other reference images show each product\'s real packaging). ' +
    'Do not add any new branded products. The other reference images only show the remaining products for accuracy; do not add extra copies. ' +
    `Reference images after the first, in order: ${st.meta.produk.filter((p) => p.img).map((p, i) => `${i + 2} = ${p.rupa_en || p.deskripsi_en || p.nama}`).join('; ')}. ` +
    'If any featured product in the current photo does not look like its reference image (different shape or design), replace it in the same spot with the exact product from its reference. Portrait 4:5. ' + REALISME;
  return { model: 'google/gemini-3.1-flash-image', prompt, input_references: refs([st.img_url, ...st.meta.produk.map((p) => p.img)]), resolution: '1K', aspect_ratio: '4:5', n: 1 };
}

// Foto tambahan untuk Reels (9:16): ruangan & produk yang SAMA, sudut lain atau detail close-up satu produk
export function bodyFotoReels(st, arah, produkFokus) {
  const fokus = produkFokus ? ` The shot focuses on this product: ${produkFokus.rupa_en || produkFokus.deskripsi_en || produkFokus.nama}; show it sharp, whole and clearly recognizable, the rest of the desk softly out of focus.` : '';
  const prompt = `${PERSONA_VISUAL} The FIRST reference image is a photo of a real desk setup. Take another photo of the exact same room and setup for a slow cinematic Reels: ${arah}.${fokus} ` +
    'It must be the same physical scene: same furniture, same products in the same places, same props, wall, floor, window, light and time of day. Only the camera position and framing change. ' +
    'Keep every product identical to how it looks in the first image (shape, color, material, printed brand and label); the other reference images show each product\'s real packaging. Vertical 9:16 frame, natural depth of field, calm and inviting. ' + REALISME;
  const refsProduk = produkFokus ? [produkFokus.img] : st.meta.produk.map((p) => p.img);
  return { model: 'google/gemini-3.1-flash-image', prompt, input_references: refs([st.img_url, ...refsProduk]), resolution: '1K', aspect_ratio: '9:16', n: 1 };
}

// Foto "sebelum" untuk video transformasi: ruangan & sudut kamera SAMA persis, tapi meja belum ditata dan berantakan
export function bodyFotoBefore(st) {
  const produk = st.meta.produk.map((p) => p.deskripsi_en || p.nama).join('; ');
  const prompt = `Edit the reference photo into the BEFORE shot of a desk makeover video. Keep the exact same room, walls, window, floor, furniture position, camera position, lens and framing so the two photos can be swapped in place. ` +
    `Remove these featured products completely: ${produk}. In their place the desk area looks neglected and messy: tangled charging cables, a pile of random papers and plastic bags, an old mug, clothes draped over the chair, items scattered without order, a dim flat cool light, slightly dull colors. ` +
    'Realistic phone photo of a real Indonesian rented room, not dirty or gross, just unstyled and chaotic. No text. Same aspect ratio as the reference. ' + REALISME.split(' IMPORTANT')[0];
  return { model: 'google/gemini-3.1-flash-image', prompt, input_references: refs([st.img_url]), resolution: '1K', aspect_ratio: '4:5', n: 1 };
}

// Video AI realistis satu shot (gaya referensi Andi): foto kunci 9:16 + kamera geser pelan + suasana hidup
// utama: Kling 3.0 Standard (gerak kamera orbit paling stabil, 10 dtk asli tanpa diperlambat); hemat: Veo 3.1 Lite 8 dtk
export const MODEL_VIDEO_PILIHAN = {
  kling: { nama: 'Kling 3.0 Std', model: 'kwaivgi/kling-v3.0-std', duration: 10, aspect_ratio: '9:16', usdPerDetik: 0.084 },
  seedance: { nama: 'Seedance 2.0 Fast', model: 'bytedance/seedance-2.0-fast', duration: 10, resolution: '720p', aspect_ratio: '9:16', usdPerDetik: 0.0404 },
  hemat: { nama: 'Veo 3.1 Lite', model: 'google/veo-3.1-lite', duration: 8, resolution: '720p', aspect_ratio: '9:16', usdPerDetik: 0.03 },
};
export const MODEL_VIDEO = MODEL_VIDEO_PILIHAN.kling;
export function bodyKeyframe916(st) {
  const prompt = `${PERSONA_VISUAL} The FIRST reference image is a photo of a real desk setup. Re-take the exact same scene as a vertical 9:16 photo: same room, same furniture, same products in the same places, same props, light and time of day. ` +
    `Keep the same kind of camera angle as the first image (${sudutPost(st).en}), only reframed to a tall frame with a little extra margin on every side so all featured products fit fully inside, with the desk centered horizontally. Keep every product identical to the first image and its reference photos. ` +
    'Show only what is in the first image: do not add any object, furniture, rug or second desk that is not in it, even if it appears in another reference image. ' + REALISME;
  return { model: 'google/gemini-3.1-flash-image', prompt, input_references: refs([st.img_url, ...st.meta.produk.map((p) => p.img)]), resolution: '1K', aspect_ratio: '9:16', n: 1 };
}
// Frame akhir untuk gerak "orbit": kamera berputar ±12 derajat mengelilingi titik tengah meja (bukan sekadar geser)
export function bodyOrbit(st, keyframeUrl) {
  const prompt = 'The FIRST reference image is a photo of a real desk setup. Create the same photo taken a moment later after the camera has moved in a gentle arc around the center of the desk: ' +
    'the camera moved about 30 cm to the right and rotated about 12 degrees to the left so it still points at the exact center of the desk, which stays in the middle of the frame. ' +
    'Show the natural perspective change: the left side of the desk and wall are seen slightly more from the front, the right side slightly more from the side, near objects shift more than the wall behind (parallax). ' +
    'Everything in the room is identical: same objects, positions, screens content, light, colors and products (the other reference images show each product). Same lens and height. Vertical 9:16. No people, no hands. ' + REALISME;
  return { model: 'google/gemini-3.1-flash-image', prompt, input_references: refs([keyframeUrl, ...st.meta.produk.map((p) => p.img)]), resolution: '1K', aspect_ratio: '9:16', n: 1 };
}

// Gerak kamera "the orbit" (video referensi Andi): satu frame awal (foto 9:16 yang sudah di-color grade), kamera memutar pelan
// mengelilingi pusat meja. Pelajaran uji: frame akhir hasil warp membuat gerak hampir diam + morphing ("lingkaran mengecil"),
// dan memperlambat 8->10 dtk membuat patah-patah. Sekarang tanpa frame akhir, durasi asli, tanpa diperlambat.
const GERAK_VIDEO = {
  orbit: (s) => `Camera movement: a slow, smooth orbit shot. The camera circles around ${s} in a gentle arc from left to right, about 25 degrees over the whole clip, always turning to keep ${s} locked in the center of the frame. Foreground objects pass by with real parallax while the wall behind shifts the other way, revealing the desk setup from a slightly new angle.`,
  maju: (s) => `Camera movement: a slow, smooth orbit-and-push shot. The camera glides forward toward ${s} while arcing slightly to the right, keeping ${s} locked in the center of the frame, with real depth and parallax.`,
  putar: (s) => `Camera movement: a slow, smooth overhead orbit. Looking straight down, the camera rotates clockwise around ${s} while gently lowering, keeping ${s} locked in the center of the frame.`,
};
export function bodyVideoAI(frameAwal, naskah, gerak = 'orbit', subjek = 'the center of the desk', M = MODEL_VIDEO) {
  const adaMinuman = /mug|cup|coffee|tea|kopi|teh|gelas/i.test(JSON.stringify(naskah || {}));
  const prompt = 'Realistic cinematic footage of an empty room, shot on a stabilized camera and color graded exactly like the first frame. ' + (GERAK_VIDEO[gerak] || GERAK_VIDEO.orbit)(subjek) +
    ' Constant slow speed from start to end, perfectly smooth, no shake, no zoom jumps, no transitions, no vignette, no iris or circle wipe, no blur, no exposure or color change, no cuts. ' +
    'The scene is completely still: every object stays exactly where it is, laptops stay as open or closed as in the first frame, screens keep the same static picture, nothing appears, disappears or changes shape. ' +
    (adaMinuman ? 'Only a faint, thin wisp of steam rises very slowly from the hot drink. ' : '') +
    'No people, no hands, no camera equipment, no phone, no text.';
  return { model: M.model, prompt, duration: M.duration, ...(M.resolution ? { resolution: M.resolution } : {}), aspect_ratio: M.aspect_ratio, generate_audio: false,
    frame_images: [{ type: 'image_url', image_url: { url: frameAwal }, frame_type: 'first_frame' }] };
}

// Naskah Reels untuk draft lama yang belum punya (draft baru: dibuat content agent bersama caption)
export function bodyNaskahReels(st) {
  const produk = st.meta.produk.map((p) => `${p.pin} = ${p.jenis || ''} ${p.nama}`).join('\n');
  const ins = (st.meta.insight || []).map((i, k) => `${k + 1}. ${i.judul}: ${i.isi}`).join('\n');
  return { model: 'claude-sonnet-4-5', max_tokens: 1400, system: `Kamu content agent @${BRAND.handle}.\n${KURATOR}\n\n${ATURAN_NASKAH_REELS}\nJawab HANYA objek JSON naskah_reels.`,
    messages: [{ role: 'user', content: `Pemilik/lokasi meja dari brief: ${st.brief && st.brief.sumbu ? Object.entries(st.brief.sumbu).filter(([k]) => ['siapa', 'ruang', 'gaya', 'aktivitas'].includes(k)).map(([k, v]) => `${k} = ${v}`).join('; ') : '-'}\nScene: ${st.meta.scene_en || '-'}\nTema: ${st.meta.tema}\nHook carousel: ${st.meta.hook_judul}\nJumlah foto utama: ${(st.visual || []).length > 1 ? '2 ("utama" = versi 1, "utama2" = versi 2)' : '1 ("utama")'}\nProduk:\n${produk}\nAturan meja:\n${ins}\nCaption IG: ${st.meta.caption_ig || ''}` },
      { role: 'assistant', content: '{' }] };
}

// Pasangkan 3 aturan meja ke produk yang paling berkaitan (untuk draft lama yang belum punya "pin" di insight)
export function bodyPetaInsight(produk, insight) {
  return { model: HAIKU, max_tokens: 200, system: 'Jawab HANYA JSON {"pin":[angka,angka,angka]}: untuk tiap insight (urut), nomor produk yang paling berkaitan. Usahakan beda produk.',
    messages: [{ role: 'user', content: `Produk:\n${produk.map((p) => `${p.pin} = ${p.jenis || ''} ${p.nama}`).join('\n')}\n\nInsight:\n${insight.map((i, k) => `${k + 1}. ${i.judul}: ${i.isi}`).join('\n')}` },
      { role: 'assistant', content: '{' }] };
}

// Lihat foto listing: deskripsi rupa produk yang SEBENARNYA (bukan tebakan dari judul listing)
export function bodyLihatProduk(p) {
  return { model: MODEL_DETEKSI, temperature: 0, reasoning: { effort: 'minimal', exclude: true }, max_tokens: 120,
    messages: [{ role: 'user', content: [
      { type: 'text', text: `This is a marketplace listing image for "${p.nama}". Describe ONLY the physical look of the main product so an illustrator can draw it exactly: overall shape/silhouette, distinctive details, material, color, size cues. Max 25 words, English, no brand slogans. Ignore promotional text, badges, icons, collages and backgrounds.` },
      { type: 'image_url', image_url: { url: p.img } }] }] };
}

// Deteksi posisi produk (Gemini Flash lewat OpenRouter)
// Deteksi PER PRODUK dengan foto Shopee-nya sebagai acuan visual (jauh lebih akurat daripada deskripsi teks)
export const MODEL_DETEKSI = 'google/gemini-3.8-flash';
// Titik utama video: pusat meja secara keseluruhan (biasanya layar monitor/laptop), karena video menampilkan seluruh desk setup, bukan detail
export function bodyTitikUtama(fotoUrl) {
  const teks = 'This is a photo of a whole desk setup. Find the visual center of the desk setup as a whole (the middle of the desk and everything arranged on and around it), which a slow camera move will pivot around to show the entire setup. ' +
    'Usually this is the main screen (the monitor, or the laptop if there is no monitor): if the main screen sits roughly in the middle of the desk arrangement, return the center of that screen. If the screen is far to one side, return the middle of the desk arrangement instead. ' +
    'Return JSON: {"subjek_en": short English name with "the", e.g. "the monitor at the center of the desk", "the laptop at the center of the desk", "the center of the desk", "point": [y, x] that center point normalized 0-1000}.';
  return { model: MODEL_DETEKSI, temperature: 0, response_format: { type: 'json_object' }, reasoning: { effort: 'minimal', exclude: true },
    messages: [{ role: 'user', content: [{ type: 'text', text: teks }, { type: 'image_url', image_url: { url: fotoUrl } }] }] };
}
export function bodyDeteksiSatu(p, fotoUri) {
  const teks = !p.img ? `The image is a room photo. Find the product "${p.nama}" (${p.jenis || ''}; looks like: ${p.rupa_en || p.deskripsi_en || '-'}). It may be small, partly hidden or standing on a shelf, and its printed label may be blurry or unreadable: match by shape, size and color. If several objects could match, pick the one that fits best; return found false only if nothing in the photo could be this product. ` +
    'Return its tight bounding box as box_2d [ymin, xmin, ymax, xmax] normalized 0-1000, or found false if it is really not there. ' +
    'Also return point [y, x] (0-1000): one spot that lies clearly ON this product\'s own visible surface, away from its edges and not on any other object resting on or in front of it ' +
    '(for a table: on the table top or a leg, never the floor under it; for a rug or carpet: an open patch of the rug itself; for a lamp: on the lamp head or arm). ' + 'Respond ONLY with JSON: {"found":true,"box_2d":[0,0,0,0],"point":[0,0],"yakin":0.0}'
    : `Image 1 is the seller's listing photo of ONE product (it may contain promo text, badges, several color variants or other decorations; focus on the product itself). ` +
    `Image 2 is a room photo. Product name: "${p.nama}" (${p.jenis || ''}; looks like: ${p.rupa_en || p.deskripsi_en || '-'}). ` +
    'Find the single object in image 2 that is this product (same packaging shape and main color; printed text may be slightly different). ' +
    'Return its tight bounding box in IMAGE 2 as box_2d [ymin, xmin, ymax, xmax] normalized 0-1000. Do not return a different product that only shares the color. ' +
    'If it is not in image 2, return found false. ' +
    'Also return point [y, x] (0-1000): one spot that lies clearly ON this product\'s own visible surface, away from its edges and not on any other object resting on or in front of it ' +
    '(for a table: on the table top or a leg, never the floor under it; for a rug or carpet: an open patch of the rug itself; for a lamp: on the lamp head or arm). ' + 'Respond ONLY with JSON: {"found":true,"box_2d":[0,0,0,0],"point":[0,0],"yakin":0.0}';
  // tanpa 'berpikir' panjang: deteksi lokasi tidak butuh penalaran (anjuran Google untuk deteksi objek),
  // sebelumnya 70-90% biaya deteksi habis untuk token berpikir
  return { model: MODEL_DETEKSI, temperature: 0, response_format: { type: 'json_object' }, reasoning: { effort: 'minimal', exclude: true },
    messages: [{ role: 'user', content: [
      { type: 'text', text: teks },
      ...(p.img ? [{ type: 'image_url', image_url: { url: p.img } }] : []),
      { type: 'image_url', image_url: { url: fotoUri } },
    ] }] };
}

// ---------- QC: AI hanya cek pin vs produk + kesan AI (Haiku, 1 gambar). Caption dicek kode ----------
export function bodyQc(st, qcUrl) {
  const daftar = st.meta.produk.map((p) => `${String(p.pin).padStart(2, '0')} = ${p.nama} (${p.jenis || ''})`).join('\n');
  const sys = `Kamu QC visual @${BRAND.handle}:`+' laki-laki milenial 30-an yang perfeksionis, rapi, dan punya selera seni unik. ' +
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
  ['elevate', /elevate/i], ['game changer', /game ?changer/i], ['must-have', /must[- ]have/i], ['sempurna', /sempurna/i], ['dijamin', /dijamin/i],
  ['Bayangkan', /bayangkan/i], ['Pernahkah', /pernahkah/i], ['Bukan cuma..tapi', /bukan (cuma|hanya|sekadar)[^.]{0,60}tapi/i], ['solusi', /\bsolusi\b/i], ['level up', /level ?up/i], ['rahasia', /rahasia/i], ['tanda pisah panjang', /—/], ['checkout/diskon/promo', /checkout|diskon|promo/i]];
const emoji = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;

export function cekCaption(m) {
  const out = [];
  const ig = String(m.caption_ig || ''), th = String(m.caption_threads || '');
  if (ig.length < 120 || ig.length > 450) out.push(`caption IG ${ig.length} karakter (harus 150-400)`);
  if (th.length > 200) out.push(`caption Threads ${th.length} karakter (maks 200)`);
  if (/https?:|link di bio|#/i.test(th)) out.push('Threads berisi link/hashtag/"link di bio"');
  if (/Rp\s?\d/i.test(ig)) out.push('caption IG menyebut harga');
  if (emoji(ig) > 2 || emoji(th) > 2) out.push('emoji lebih dari 2');
  if (String(m.hook_judul || '').length > 45) out.push(`judul hook ${String(m.hook_judul).length} karakter (maks 45)`);
  for (const [nama, re] of LARANG) if (re.test(ig) || re.test(th) || re.test(m.hook_judul || '')) out.push(`kata terlarang: ${nama}`);
  return out;
}

// Ambil objek JSON dari teks balasan model (prefill "{")
// Baca JSON dari jawaban model. Toleran: code fence, teks di luar objek, dan baris baru/tab mentah di dalam string
// (model kadang menulis caption multi-baris tanpa \n, yang membuat JSON.parse gagal "Bad control character").
export function bacaJsonModel(t) {
  let s = String(t || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  if (!s.startsWith('{')) s = '{' + s;
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) {
    let out = '', diString = false, lolos = false;
    for (const c of s) {
      if (diString) {
        if (lolos) { out += c; lolos = false; continue; }
        if (c === '\\') { out += c; lolos = true; continue; }
        if (c === '"') { diString = false; out += c; continue; }
        if (c === '\n') { out += '\\n'; continue; }
        if (c === '\r') continue;
        if (c === '\t') { out += '\\t'; continue; }
        if (c < ' ') continue;
        out += c;
      } else { if (c === '"') diString = true; out += c; }
    }
    // koma berlebih sebelum } atau ]
    out = out.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(out);
  }
}
