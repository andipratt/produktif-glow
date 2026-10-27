// Agent komentar (riset percakapan + soft-selling): Andi kirim screenshot / teks postingan yang lagi ramai beserta komentarnya,
// agent membaca keluhan berulang lalu menyusun 5 variasi komentar yang memberi value dulu (tanpa link, tanpa produk).
import { BRAND, KURATOR } from './brand.js';

const PERSONA_KOMEN = `Kamu agent komentar @${BRAND.handle} (rekomendasi ruang kerja: meja, kursi, lampu, sudut sekitar meja).\n${KURATOR}`;

export function bodyKomen(teks, gambarB64, mime = 'image/jpeg') {
  const sys = PERSONA_KOMEN + '\n\n' +
    'TUGAS: dari postingan orang lain yang sedang ramai (screenshot dan/atau teks, termasuk komentar di bawahnya):\n' +
    '1) tangkap topik & kata kunci postingan, 2) baca komentar dan temukan KELUHAN/PERTANYAAN yang berulang, 3) tulis 5 variasi komentar soft-selling untuk dibalaskan di postingan itu atau di komentar orang yang mengeluh.\n' +
    'ATURAN KOMENTAR: kasih value dulu (tips praktis yang langsung bisa dicoba), lalu cerita pengalaman singkat, lalu akhiri dengan pertanyaan. JANGAN taruh link, JANGAN sebut merek/nama produk/harga, JANGAN "cek bio ya kak". 1-3 kalimat, bahasa Threads santai, huruf kecil boleh, tiap variasi beda sudut.\n' +
    'KEJUJURAN (wajib): pengalaman harus benar. Pakai sudut pandang kurator yang benar adanya (misal "dari banyak meja yang aku kurasi, yang paling sering bikin pegal itu...", "yang sering aku lihat...") atau pengalaman umum yang wajar. DILARANG mengaku pernah membeli, memakai, atau mencoba produk tertentu.\n' +
    'Tambahkan juga 1 contoh balasan lanjutan kalau ada yang membalas/bertanya (baru di sini boleh menyebut halus bahwa daftar barang yang dibahas ada di link bio, tetap tanpa link mentah).\n' +
    'Kalau postingan tidak nyambung dengan niche ruang kerja, katakan di "catatan" dan beri komentar value yang tetap relevan tanpa memaksa.\n' +
    'Jawab HANYA JSON: {"topik": "...", "kata_kunci": ["..."], "keluhan": ["keluhan berulang singkat", "..."], "komentar": ["5 variasi"], "balasan_lanjutan": "...", "ide_konten": "1 ide post ngemeja dari keluhan ini, maks 80 karakter", "catatan": "..."}';
  const isi = [];
  if (gambarB64) isi.push({ type: 'image', source: { type: 'base64', media_type: mime, data: gambarB64 } });
  isi.push({ type: 'text', text: teks ? `Teks/konteks dari Andi:\n${teks}` : 'Analisis screenshot ini.' });
  return { model: 'claude-sonnet-4-5', max_tokens: 1500, system: sys, messages: [{ role: 'user', content: isi }, { role: 'assistant', content: '{' }] };
}

export function teksKomen(j) {
  const L = ['RISET KOMENTAR'];
  if (j.topik) L.push(`Topik: ${j.topik}`);
  if (Array.isArray(j.kata_kunci) && j.kata_kunci.length) L.push(`Kata kunci: ${j.kata_kunci.join(', ')}`);
  if (Array.isArray(j.keluhan) && j.keluhan.length) { L.push('', 'Keluhan berulang:'); j.keluhan.forEach((k) => L.push(`- ${k}`)); }
  if (Array.isArray(j.komentar)) { L.push('', '5 variasi komentar (pilih 1, jangan copy-paste sama ke banyak post):'); j.komentar.forEach((k, i) => L.push(`${i + 1}. ${k}`)); }
  if (j.balasan_lanjutan) L.push('', `Kalau dibalas/ditanya: ${j.balasan_lanjutan}`);
  if (j.ide_konten) L.push('', `Ide post dari keluhan ini: ${j.ide_konten}`);
  if (j.catatan) L.push('', `Catatan: ${j.catatan}`);
  L.push('', 'Aturan main: maks ±8 komentar per hari, jangan komen link pertama kali, balas manusiawi kalau ada yang merespons.');
  return L.join('\n');
}
