// Baca pesan link dari Andi dan ambil judul + foto tiap listing Shopee (paralel, satu panggilan).
const ent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Format longgar: "ID: PG-..." / "PG-..." di mana saja; baris "Pin 1 - link - 89000", "1. link 89rb", "1: link", atau link saja (nomor urut).
export const RE_LINK_SHOPEE = /https?:\/\/(?:s\.shopee\.co\.id|shopee\.co\.id|id\.shp\.ee|shope\.ee|shp\.ee)\/[^\s<>"')]+/i;
export function bacaPesanLink(text) {
  const t = String(text || '');
  const id = (t.match(/ID\s*[:.=-]?\s*(PG-[0-9A-Za-z-]+)/i) || t.match(/\b(PG-\d{8}-\d{4}[0-9a-z]{0,3})\b/) || [])[1];
  const items = []; let urut = 0;
  for (const baris of t.split(/\r?\n/)) {
    const link = (baris.match(RE_LINK_SHOPEE) || [])[0];
    if (!link) continue;
    const sebelum = baris.slice(0, baris.indexOf(link)), sesudah = baris.slice(baris.indexOf(link) + link.length);
    const noPin = (sebelum.match(/(?:pin\s*)?(\d{1,2})\s*[.):\-|]?\s*$/i) || sebelum.match(/pin\s*(\d{1,2})/i) || [])[1];
    const mh = sesudah.match(/(\d[\d.,]*)\s*(rb|ribu|k)?/i);
    let harga = null;
    if (mh) { const n = Number(mh[1].replace(/[.,]/g, '')); harga = mh[2] ? n * 1000 : n; if (!harga || harga < 1000) harga = mh[2] ? harga : null; }
    urut = noPin ? Number(noPin) : urut + 1;
    items.push({ pin: urut, link: link.replace(/[.,]+$/, ''), harga });
  }
  // pin dobel: pakai urutan baris
  if (new Set(items.map((i) => i.pin)).size !== items.length) items.forEach((it, k) => { it.pin = k + 1; });
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
