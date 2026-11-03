// Identitas akun di satu tempat. Ganti nama akun cukup di sini (watermark, struk, hashtag, caption ikut berubah).
export const BRAND = {
  handle: 'ngemeja', // sebelumnya produktif.glow (ganti 26 Okt 2026)
  nama: 'ngemeja',
  hashtag: '#ngemeja',
};

// Karakter kurator hasil wawancara Andi (26 Okt 2026). Dipakai bersama oleh research, content, visual, dan QC agent.
export const KURATOR = `KARAKTER KURATOR AKUN ("teman kos berselera")
- Sosok: anak 25-an yang ngekos/ngontrak, kerja hybrid, selera bagus tapi dompet realistis. Suka ngamatin meja orang dan punya opini soal itu. Tanpa nama, selalu pakai "aku".
- Cara ngomong: pendek, nyeleneh, jujur, sedikit nyentil tapi hangat dan nggak menggurui. Opini dulu, penjelasan belakangan. Huruf kecil semua boleh. Contoh rasa: "meja rapi itu bukan soal estetik. itu bentuk self defense dari 400 baris excel."
- Kebiasaan khas: tiap post punya satu "aturan meja" yang bisa langsung dipraktikkan; suka membandingkan harga dengan hal sehari-hari ("seharga 3 gelas kopi susu"); jujur kalau ada barang yang cuma enak dilihat tapi nggak penting.
- Selera visual: berganti sesuai cerita (hangat & cozy, terang & bersih, moody & gelap, editorial majalah), tapi selalu terasa seperti ruangan asli orang Indonesia yang ditinggali, penuh detail kecil, nggak pernah sepi.
- Nggak pernah: nada jualan, pamer barang mahal, menyebut merek di caption, klaim pernah memakai barang, bahasa iklan, lebay.`;

// Empat suasana foto pilihan Andi; research agent memilih satu per brief (bergiliran)
export const MOOD = {
  hangat: { nama: 'Hangat & cozy', en: 'warm and cozy: late afternoon golden light, warm wood, plants, soft fabric, warm amber grade with soft highlights, feels like a place you want to stay' },
  terang: { nama: 'Terang & bersih', en: 'bright and clean: daylight, white and light wood, airy Korean-style minimal, bright clean grade with neutral whites and soft pastel tints, crisp but still lived-in' },
  moody: { nama: 'Moody & gelap', en: 'moody and dark: dark wall, evening, desk lamp and monitor glow as main light, warm highlights against deep shadows, cinematic contrast grade' },
  editorial: { nama: 'Editorial majalah', en: 'editorial magazine look: carefully composed, curated limited color palette, photographer angle, refined matte grade, still natural and real' },
  pagi: { nama: 'Pagi segar', en: 'fresh early morning: cool soft sunlight just after sunrise, long gentle shadows, a fresh drink, clean cool-neutral grade with crisp whites and green accents' },
  hujan: { nama: 'Hari hujan', en: 'rainy afternoon: rain on the window, soft grey overcast light, a warm desk lamp on, cozy contrast of cool blue-grey outside and warm inside, muted teal-and-amber grade' },
  senja_biru: { nama: 'Senja biru', en: 'blue hour: deep blue dusk sky through the window, warm interior lamps just switched on, city or rooftop lights in the distance, cool blue and warm orange split grade' },
  film: { nama: 'Film analog', en: 'analog film look: like a photo on Kodak Portra 400, soft warm tones, gentle grain, slightly faded blacks, nostalgic but sharp enough to see every product' },
  tropis: { nama: 'Tropis hijau', en: 'tropical green: lots of leafy plants, bright humid daylight, rattan and natural wood, lush green and warm sand grade, Bali or garden-house feel' },
  monokrom: { nama: 'Monokrom tegas', en: 'bold monochrome palette: black, grey and white space with one accent color, clean graphic composition, punchy contrast grade, modern and sharp' },
  earthy: { nama: 'Earthy terakota', en: 'earthy terracotta: clay, terracotta, olive and linen tones, warm afternoon sun, rich earthy grade with deep warm shadows' },
  sinematik: { nama: 'Sinematik malam kota', en: 'cinematic night: dark room lit by a warm lamp and soft LED strip, city lights through the window, teal shadows and warm highlights, film still feel, still tasteful and not a flashy gamer setup' },
};
