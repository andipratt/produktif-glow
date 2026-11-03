import { BRAND, KURATOR, MOOD } from './brand.js';
import { SUDUT } from './agen.js';
// Research agent: menyusun brief post ruang kerja dengan format dan sudut yang berganti-ganti.
// Kode yang mengacak format + kombinasi sumbu (supaya tidak monoton), AI yang meramu jadi ide yang bikin penasaran.

export const FORMAT = {
  setup_budget: { nama: 'Setup dengan budget', set: 1, slot: '7-9', ide: 'Satu setup lengkap yang bisa direcreate dengan total budget tertentu, ditutup struk belanja. Judul menyebut budget dan siapa/ruangnya.' },
  banding_budget: { nama: 'Banding budget', set: 2, slot: '4-6 per versi', ide: 'Ruang dan orang yang sama, dua versi budget (misal Rp200rb vs Rp500rb). Versi murah tetap layak, versi mahal jelas naik kelas. Pembaca diajak memilih.' },
  tebak_profesi: { nama: 'Tebak meja siapa', set: 1, slot: '6-8', ide: 'Barang-barangnya jadi petunjuk profesi/kebiasaan pemiliknya. Hook mengajak menebak ("Tebak ini meja siapa?"), jawaban baru dibuka di akhir caption.' },
  fix_masalah: { nama: 'Fix masalah meja', set: 1, slot: '5-7', ide: 'Mulai dari SATU masalah spesifik yang relate, setiap barang adalah solusinya. Judul menyebut masalahnya, bukan barangnya.' },
  upgrade_kecil: { nama: 'Upgrade kecil', set: 1, slot: '5-7', ide: 'Barang kecil di bawah Rp100rb per item yang efeknya terasa besar di meja. Cocok untuk akhir bulan.' },
  kantor_vs_rumah: { nama: 'Meja kantor vs meja rumah', set: 2, slot: '4-6 per versi', ide: 'Orang yang sama, dua mejanya: kubikel kantor (tanpa bor, bisa dibawa pulang) dan meja di rumah/kos. Bedanya karena kebutuhan, bukan budget.' },
  pilih_gaya: { nama: 'Pilih gaya A atau B', set: 2, slot: '4-6 per versi', ide: 'Budget mirip, dua gaya berbeda (misal japandi vs dark mode) untuk ruang yang sama. Pertanyaannya: kamu tim yang mana?' },
  sudut_mini: { nama: 'Sudut mini', set: 1, slot: '5-7', ide: 'Ruang kerja di tempat yang tidak ideal: meja lipat lesehan, meja 60 cm, samping kasur, sudut 1x1 m. Fokus hemat tempat tapi tetap enak dilihat.' },
  gaya_mood: { nama: 'Moodboard gaya', set: 1, slot: '7-9', ide: 'Satu gaya yang kuat dan konsisten warnanya. Judul menjual suasana, bukan barang.' },
  momen: { nama: 'Momen tertentu', set: 1, slot: '6-8', ide: 'Setup untuk satu momen hidup yang relate (gajian, pindah kos, hari pertama kerja, balik WFO, musim skripsi, hadiah rekan kerja).' },
  satu_hero: { nama: 'Satu barang paling ngefek', set: 1, slot: '4-6', ide: 'Satu barang utama yang paling mengubah meja, ditemani 2-4 pendukung. Hook bikin penasaran barang apa itu tanpa menyebutnya.' },
  kesalahan: { nama: 'Kesalahan setup meja', set: 1, slot: '5-7', ide: 'Edukasi ringan: 3 kesalahan yang sering bikin meja nggak nyaman (tinggi monitor, cahaya, kabel, dsb), tiap barang memperbaiki satu kesalahan.' },
  spill_lengkap: { nama: 'Spill semua barang', set: 1, slot: '9-12', ide: 'Desk tour lengkap: SEMUA yang terlihat di area kerja dispill satu per satu, dari meja, kursi, karpet, monitor arm, light bar, keyboard, mouse, sampai footrest dan dekor. Pembaca menyimpan post sebagai daftar belanja.' },
  meja_kantor: { nama: 'Meja kantor', set: 1, slot: '6-8', ide: 'Meja di kantor (kubikel, open space, coworking, meja resepsionis): barang yang boleh dibawa ke kantor, tanpa bor, tidak norak, bikin rekan kerja nanya beli di mana.' },
  meja_kreator: { nama: 'Meja kreator', set: 1, slot: '7-9', ide: 'Meja untuk bikin konten (streamer, podcaster, YouTuber, editor): mic arm, lampu panel, webcam/tripod, panel akustik, stream deck, dengan budget masuk akal.' },
  kerja_gaming: { nama: 'Kerja siang, gaming malam', set: 1, slot: '7-9', ide: 'Satu meja untuk kerja kantoran dan main game: monitor arm, keyboard, mouse besar, headset stand, lampu ambient, kursi, tetap rapi dan tidak terlihat seperti setup gamer norak.' },
};

export const SUMBU = {
  siapa: ['gamer yang juga kerja kantoran', 'streamer pemula', 'podcaster', 'musisi rumahan', 'fotografer', 'mahasiswa arsitektur', 'dokter koas yang belajar malam', 'pegawai kantor open space', 'resepsionis', 'manajer proyek hybrid', 'data analyst', 'penjual online yang packing di meja', 'penulis novel', 'trader saham pemula', 'guru SD yang bikin bahan ajar', 'programmer', 'desainer grafis', 'admin/akuntan', 'staf HR', 'mahasiswa skripsi', 'content creator', 'penulis lepas', 'guru les online', 'CS online shop', 'ibu yang WFH', 'pasangan yang sama-sama WFH', 'pekerja shift malam', 'fresh graduate hari pertama kerja', 'digital marketer', 'video editor', 'penerjemah', 'arsitek junior', 'PNS yang WFH sesekali', 'freelancer ilustrator', 'pegawai bank yang hybrid'],
  ruang: ['villa kecil di Bali', 'rumah dekat sawah', 'kabin di daerah pegunungan', 'rumah tua bergaya kolonial', 'rumah joglo', 'loft di atas ruko', 'studio di garasi', 'balkon apartemen dengan pemandangan kota', 'rooftop kantor', 'ruang baca di rumah', 'kamar dengan jendela besar menghadap taman', 'rumah pantai', 'apartemen lantai tinggi', 'studio seni', 'kubikel kantor', 'meja open space kantor', 'meja coworking', 'meja resepsionis', 'ruang kerja di apartemen studio', 'kamar tamu jadi home office', 'meja di bawah tangga', 'meja dekat balkon', 'studio podcast mini di kamar', 'meja kos 60-80 cm', 'sudut kamar 1x1 meter', 'meja lipat lesehan', 'meja di samping kasur', 'meja kubikel kantor', 'meja di ruang tamu kontrakan', 'meja dekat jendela', 'kamar tanpa jendela', 'meja panjang dipakai berdua', 'dinding kos yang tidak boleh dibor', 'meja sudut L kecil', 'meja belajar bekas yang di-upgrade'],
  masalah: ['kabel berantakan', 'leher dan punggung pegal', 'cahaya kurang atau silau', 'meja gerah dan panas', 'meja terlalu sempit', 'terlalu banyak barang kecil', 'susah fokus', 'laptop kepanasan', 'monitor atau laptop terlalu rendah', 'nggak ada tempat buat HP dan charger', 'sering lupa tugas', 'meja kelihatan suram dan dingin', 'kaki pegal karena kursi ketinggian'],
  gaya: ['japandi', 'all-white clean', 'kayu hangat', 'dark mode hitam-kayu', 'Korean minimal', 'pastel lembut', 'retro 70-an', 'natural rotan', 'monokrom abu', 'earthy terracotta', 'scandinavian terang', 'hijau tanaman'],
  momen: ['habis gajian', 'baru pindah kos', 'balik WFO', 'hari pertama kerja', 'musim skripsi', 'akhir bulan', 'musim hujan', 'Ramadan dan WFH', 'resolusi awal tahun', 'kado ulang tahun rekan kerja', 'promo tanggal kembar', 'lembur akhir kuartal'],
  budget: ['di bawah Rp100rb', 'di bawah Rp200rb', 'di bawah Rp300rb', 'di bawah Rp500rb', 'sekitar Rp750rb', 'di bawah Rp1jt'],
  aktivitas: ['main game setelah kerja', 'live streaming', 'rekam podcast', 'packing pesanan online', 'menggambar digital', 'baca chart saham', 'meeting online seharian', 'ngoding', 'desain', 'nulis jurnal', 'baca dan belajar', 'kerja sambil nonton', 'belajar bahasa', 'ngedit video malam-malam'],
  vibe: ['anti-ribet', 'pencinta tanaman', 'minimalis ekstrem', 'suka ngopi di meja', 'suka barang lucu', 'perfeksionis rapi', 'cozy buat lembur'],
  barang: ['meja', 'kursi', 'lampu meja atau lampu lantai', 'stand monitor atau laptop', 'organizer meja', 'rak dinding tanpa bor', 'pegboard', 'tanaman', 'cable management', 'deskmat', 'footrest', 'jam meja', 'kipas mini', 'humidifier atau diffuser', 'papan catatan', 'tirai dekat meja'],
};

// Ragam barang supaya tiap post tidak itu-itu saja (lampu, tanaman, deskmat terus). Research agent wajib mencampur grup.
export const GRUP_BARANG = {
  'furnitur besar': ['meja kerja', 'standing desk', 'meja lipat', 'meja sudut L', 'kursi kerja ergonomis', 'kursi kayu', 'rak buku', 'rak dinding', 'laci bawah meja', 'lampu lantai', 'karpet', 'tirai'],
  'layar & perangkat': ['monitor', 'monitor arm', 'monitor riser kayu', 'monitor light bar', 'laptop stand', 'keyboard mekanik', 'mouse ergonomis', 'webcam', 'mic + mic arm', 'speaker mini', 'headphone', 'docking station / USB hub', 'charger stand'],
  'kenyamanan': ['footrest', 'bantal punggung', 'wrist rest', 'kipas meja', 'humidifier', 'diffuser', 'filter anti-glare'],
  'kerapian': ['pegboard', 'desk organizer', 'headphone stand', 'cable tray bawah meja', 'klip kabel', 'power strip estetik', 'document tray', 'pen holder', 'papan / whiteboard', 'kalender meja'],
  'suasana & dekor': ['lampu meja', 'lampu ambient / LED strip', 'tanaman', 'poster / frame', 'jam meja', 'vas', 'tumbler / mug', 'coaster', 'desk mat', 'panel akustik'],
};
const SERING = ['lampu meja', 'tanaman', 'desk mat', 'klip kabel', 'desk organizer'];

const acak = (arr, n = 1, hindari = []) => {
  const pool = arr.filter((x) => !hindari.includes(x));
  const src = pool.length >= n ? pool : arr;
  return [...src].sort(() => Math.random() - 0.5).slice(0, n);
};

// Pilih format: hindari 3 format terakhir; format dua-versi muncul ~1 dari 3 brief
// Sudut kamera yang cocok per format (urutan = paling cocok dulu); dua sudut post terakhir dihindari supaya feed bervariasi
const SUDUT_FORMAT = {
  spill_lengkap: ['serong_atas', 'depan', 'samping'], setup_budget: ['serong_atas', 'depan', 'samping'], banding_budget: ['depan', 'serong_atas'],
  pilih_gaya: ['depan', 'serong_atas'], kantor_vs_rumah: ['depan', 'serong_atas'], tebak_profesi: ['atas', 'serong_atas', 'depan'],
  upgrade_kecil: ['atas', 'serong_atas', 'depan'], satu_hero: ['depan', 'atas', 'samping'], gaya_mood: ['atas', 'depan', 'serong_atas'],
  sudut_mini: ['serong_atas', 'samping', 'atas'], meja_kantor: ['samping', 'serong_atas', 'depan'], meja_kreator: ['depan', 'samping', 'serong_atas'],
  kerja_gaming: ['depan', 'samping', 'serong_atas'], fix_masalah: ['samping', 'serong_atas', 'depan'], kesalahan: ['serong_atas', 'samping', 'atas'],
  momen: ['samping', 'depan', 'atas'],
};

export function pilihResep(riwayat = [], formatPaksa) {
  const terakhir = riwayat.slice(-3).map((r) => r.format);
  let format = formatPaksa && FORMAT[formatPaksa] ? formatPaksa : null;
  if (!format) {
    const semua = Object.keys(FORMAT).filter((f) => !terakhir.includes(f));
    const dua = semua.filter((f) => FORMAT[f].set === 2), satu = semua.filter((f) => FORMAT[f].set === 1);
    const pakaiDua = dua.length && Math.random() < 0.33 && !terakhir.slice(-1).some((f) => FORMAT[f] && FORMAT[f].set === 2);
    format = acak(pakaiDua ? dua : satu)[0];
  }
  const dipakai = riwayat.slice(-6).flatMap((r) => Object.values(r.sumbu || {}));
  const moodTerakhir = riwayat.slice(-2).map((r) => r.mood);
  const mood = acak(Object.keys(MOOD), 1, moodTerakhir)[0];
  const kunci = acak(['siapa', 'ruang', 'masalah', 'gaya', 'momen', 'budget', 'aktivitas', 'vibe'], 3);
  const sumbu = Object.fromEntries(kunci.map((k) => [k, acak(SUMBU[k], 1, dipakai)[0]]));
  // barang 3 brief terakhir dihindari, plus 3 kategori yang jarang muncul sebagai saran wajib coba
  const barangLalu = [...new Set(riwayat.slice(-3).flatMap((r) => r.barang || []))].slice(0, 15);
  const wajib = acak(Object.values(GRUP_BARANG).flat().filter((k) => !barangLalu.includes(k) && !SERING.includes(k)), 3);
  const sudutLalu = riwayat.slice(-2).map((r) => r.sudut).filter(Boolean);
  const calon = (SUDUT_FORMAT[format] || Object.keys(SUDUT)).filter((x) => !sudutLalu.includes(x));
  const sudutPilihan = calon.length ? calon : (SUDUT_FORMAT[format] || Object.keys(SUDUT));
  return { format, sumbu, mood, barangLalu, wajib, sudutPilihan };
}

export const PERSONA_RISET = `Kamu adalah Research Agent akun @${BRAND.handle}.\n${KURATOR}\nPERSONA KERJAMU:`+' perempuan 26 tahun yang sangat kreatif soal ruang kerja dan desk setup, rajin mengikuti creator desk setup, interior kos, dan produktivitas, jadi tahu barang apa yang lagi ramai dan benar-benar berguna. Sangat perfeksionis dan suka kerapian, jadi rekomendasimu selalu estetik, serasi warnanya, dan enak dilihat dalam satu foto. Selalu pegang HP, jadi paham obrolan dan tren nyata, bukan teori.';

export function bodyBrief(resep, riwayat = [], keluhan = []) {
  const f = FORMAT[resep.format];
  const sistem = PERSONA_RISET + '\n\n' +
    'LATAR boleh luas dan bervariasi (kos, kontrakan, rumah, apartemen, kantor, coworking, villa, rumah dekat sawah, kabin gunung, loft ruko, studio, balkon), asal barangnya tetap realistis dan bisa dibeli.\n' +
    'AKUN: rekomendasi ruang kerja yang bisa direcreate (meja, kursi, lampu, dan sudut sekitar meja: rak dinding, tanaman, papan, tirai) untuk pekerja muda 22-33 tahun di Indonesia ("budak korporat", WFH/hybrid dari kos atau kontrakan, gajian tanggal 25). Prinsip: affordable but proper, realistis untuk kamar Indonesia, bukan setup gamer mahal. Monitor/laptop boleh hanya jadi latar; yang direkomendasikan terutama barang pendukung.\n' +
    'RAGAM BARANG (wajib): campur minimal 3 grup berbeda dan sertakan minimal 1 barang dari grup "furnitur besar" atau "layar & perangkat"; jangan hanya barang kecil dekor. ' +
    `Grup barang: ${Object.entries(GRUP_BARANG).map(([g, l]) => `${g}: ${l.join(', ')}`).join(' | ')}.\n` +
    'ATURAN PRODUK: produk nyata yang mudah dicari di Shopee, rating minimal 4.7, terjual minimal 100. Semua barang dalam satu versi harus serasi warnanya dan bisa tampil berdampingan dalam satu foto tanpa saling menumpuk (jangan dua alas datar sekaligus seperti deskmat + mousepad). Jangan klaim produk sudah dites.\n' +
    'TUGAS: buat SATU brief post carousel yang bikin orang berhenti scroll, penasaran, lalu menyimpan post. Hindari ide generik seperti "meja kerja estetik". Judul harus spesifik dan relate (siapa, situasi, angka, atau pertanyaan).\n\n' +
    'Keluarkan HANYA JSON valid tanpa code fence dengan kunci:\n' +
    '"tema" (maks 50 karakter), "judul_post" (hook slide 1, maks 45 karakter, berbentuk pertanyaan atau tebakan yang bikin penasaran), "judul_alternatif" (array 2 ide hook lain), "sudut_konten" (1-2 kalimat: kenapa orang peduli), ' +
    '"sudut_kamera" (salah satu: ' + (resep.sudutPilihan || Object.keys(SUDUT)).map((k) => `"${k}" = ${SUDUT[k].nama}`).join(', ') + '; pilih yang paling menonjolkan tema dan barangnya: "atas" hanya kalau barangnya kebanyakan di permukaan meja, jangan "atas" kalau ada kursi, karpet, lampu lantai, rak, atau tirai), ' +
    '"catatan_konten" (arahan untuk content agent, misal jawaban tebakan yang dibuka di akhir caption, atau pertanyaan pilih A/B), "estimasi_total" (string, misal "Rp450rb" atau "Rp200rb vs Rp500rb"), ' +
    '"versi" (array berisi ' + f.set + ' objek {"label": nama versi pendek maks 22 karakter, misal "Versi Rp200rb" atau "Meja kantor", "slot": array produk}). ' +
    'Setiap slot: {"no_pin": angka berurutan di SEMUA versi mulai 1, "kategori" (pakai nama barang dari daftar grup bila ada), "kata_kunci" (kata pencarian persis di kolom cari Shopee), "rentang_harga", "kriteria" (hal yang dicek sebelum memilih, singkat)}. Jumlah slot: ' + f.slot + '.' +
    ' Tambahkan juga "radar": array 3 objek {"kata_kunci": kata yang diketik di pencarian Threads/IG untuk menemukan postingan yang lagi ramai di niche ini hari ini (bahasa sehari-hari, misal "meja kos sempit", "punggung pegal wfh", "lampu belajar"), "cari": apa yang dicari di komentarnya (keluhan/pertanyaan berulang), maks 60 karakter}. Radar dipakai Andi untuk komentar soft-selling, jadi pilih topik yang sering memancing curhat.';
  const pengguna = `Format: ${f.nama}. ${f.ide}\nMood foto: ${MOOD[resep.mood].nama}. Pilih siapa/ruang yang cocok dengan mood ini.\nBahan kombinasi (boleh dipakai sebagian, harus terasa natural): ${Object.entries(resep.sumbu).map(([k, v]) => `${k} = ${v}`).join('; ')}.\n` +
    `Barang yang SUDAH dipakai di 3 post terakhir (hindari, maksimal 1 boleh muncul lagi): ${(resep.barangLalu || []).join(', ') || '-'}.\n` +
    `Coba masukkan minimal 2 dari barang ini kalau cocok dengan tema: ${(resep.wajib || []).join(', ')}.\n` +
    `Tema yang baru dipakai (JANGAN diulang atau dibuat mirip): ${riwayat.slice(-8).map((r) => r.tema).filter(Boolean).join(' | ') || '-'}.` +
    (keluhan.length ? `\nKeluhan nyata audiens dari riset komentar (prioritaskan kalau cocok dengan format): ${keluhan.join(' | ')}.` : '');
  return { model: 'claude-sonnet-4-5', max_tokens: 2500, system: sistem,
    messages: [{ role: 'user', content: pengguna }, { role: 'assistant', content: '{' }] };
}

export function teksBrief(b) {
  const f = FORMAT[b.format] || { nama: b.format };
  const versi = (b.versi || []).map((v) => `${b.versi.length > 1 ? `[${v.label}]\n` : ''}${(v.slot || []).map((s) => `Pin ${s.no_pin} - ${s.kategori} - cari: ${s.kata_kunci} - ${s.rentang_harga}`).join('\n')}`).join('\n\n');
  return `BRIEF POST BARU\nID: ${b.id}\nFormat: ${f.nama}${b.mood && MOOD[b.mood] ? ` · Mood: ${MOOD[b.mood].nama}` : ''}\n\n${b.judul_post}\n(alternatif: ${(b.judul_alternatif || []).join(' / ')})\n\n${b.sudut_konten}\n${b.sudut && SUDUT[b.sudut] ? `Sudut kamera: ${SUDUT[b.sudut].nama}\n` : ''}\n${versi}\n\nEstimasi total: ${b.estimasi_total}\n\n` +
    (Array.isArray(b.radar) && b.radar.length ? `RADAR KOMENTAR (cari di Threads/IG hari ini):\n${b.radar.map((r) => `- "${r.kata_kunci}": ${r.cari}`).join('\n')}\nScreenshot postingan + komentarnya yang ramai, kirim ke sini dengan caption "komen".\n\n` : '') +
    'Kalau setuju, cari produknya lalu kirim SATU pesan: baris pertama ID di atas, lalu "Pin 1 - link - harga" per baris. Jumlah boleh disesuaikan.';
}
