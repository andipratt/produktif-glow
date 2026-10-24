// Baca pesan link dari Andi dan ambil judul + foto tiap listing Shopee (paralel, satu panggilan).
const ent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function bacaPesanLink(text) {
  const id = (String(text).match(/ID:\s*(PG-[0-9A-Za-z-]+)/i) || [])[1];
  const re = /Pin\s*(\d+)\s*[-:]\s*(https:\/\/s\.shopee\.co\.id\/[A-Za-z0-9]+)(?:[ \t]*[-:|]?[ \t]*(?:Rp\.?[ \t]*)?([0-9][0-9.,]*))?/gi;
  const items = []; let m;
  while ((m = re.exec(text))) {
    const harga = m[3] ? Number(m[3].replace(/[.,]/g, '')) || null : null;
    items.push({ pin: Number(m[1]), link: m[2], harga });
  }
  items.sort((a, b) => a.pin - b.pin);
  return { id, items };
}

async function satu(it) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(it.link, { redirect: 'follow', signal: ctl.signal,
      headers: { 'User-Agent': 'TelegramBot (like TwitterBot)', 'Accept-Language': 'id-ID,id;q=0.9' } });
    clearTimeout(t);
    const h = await r.text();
    const judul = ent((h.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
    const img = (h.match(/og:image["']?[^>]*?content=["']?(https:\/\/[^"'>]+)/i) || [])[1] || '';
    const nama = judul.replace(/^\s*Jual\s+/i, '').replace(/\s*[|-]\s*Shopee.*$/i, '').replace(/\s+/g, ' ').trim();
    return { ...it, nama_listing: nama || '(nama belum terbaca)', img };
  } catch {
    return { ...it, nama_listing: '(nama belum terbaca)', img: '' };
  }
}

export const ambilSemua = (items) => Promise.all(items.map(satu));
