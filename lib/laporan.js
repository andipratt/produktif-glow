// Report agent: rekap mingguan sistem affiliate ke Telegram.
// Angka dihitung oleh kode (pasti benar), agent hanya membaca angka dan menulis temuan + saran.
import { bacaJson } from './store.js';
import { rekap, adaRedis, tglWIB } from './hitung.js';
import { FORMAT } from './brief.js';
import { MOOD, BRAND } from './brand.js';

const HARI = 86400e3;
const KURS = 16500;
const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID').replace(/,/g, '.');
const naik = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : a ? 'baru' : '-');
const SUMBER = { ig: 'Instagram', th: 'Threads', lain: 'lainnya' };

export const PERSONA_LAPORAN = `Kamu Report Agent @${BRAND.handle}: perempuan akhir 20-an, introvert, analis data yang senang merangkum angka jadi keputusan. Bicaranya to the point, tenang, jujur kalau datanya belum cukup, tidak pernah melebih-lebihkan. Pakai "aku" dan "kamu", bahasa Indonesia santai tapi rapi.`;

async function openrouter() {
  if (!process.env.OPENROUTER_API_KEY) return null;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } });
    const d = (await r.json()).data || {};
    return { minggu: Number(d.usage_weekly) || 0, bulan: Number(d.usage_monthly) || 0 };
  } catch { return null; }
}

// sampaiMs: batas akhir (biasanya hari ini 00:00 WIB); 7 hari ke belakang, dibanding 7 hari sebelumnya
export async function kumpulkan(sampaiMs) {
  const dari = sampaiMs - 7 * HARI, dariLalu = dari - 7 * HARI;
  const [ini, lalu, landing, riwayat, or] = await Promise.all([
    rekap(dari, sampaiMs), rekap(dariLalu, dari), bacaJson('landing.json'), bacaJson('briefs/riwayat.json'), openrouter(),
  ]);
  const posts = (landing && landing.posts) || [];
  const dalam = (tgl, a, b) => { const t = Date.parse(String(tgl || '').replace(' ', 'T') + ':00+07:00'); return t >= a && t < b; };
  const disetujui = posts.filter((p) => dalam(p.tanggal, dari, sampaiMs));
  const briefMinggu = (riwayat || []).filter((r) => r.at && r.at >= dari && r.at < sampaiMs);

  const nama = new Map(); posts.forEach((p) => (p.produk || []).forEach((x) => nama.set(`${p.id}|${x.pin}`, x.nama)));
  const judul = new Map(posts.map((p) => [p.id, p.judul]));
  const klikIni = ini ? ini.k : [], klikLalu = lalu ? lalu.k : [];
  const jumlah = (arr) => arr.reduce((s, x) => s + x.n, 0);
  const vIni = ini ? Object.values(ini.v).reduce((a, b) => a + b, 0) : 0, vLalu = lalu ? Object.values(lalu.v).reduce((a, b) => a + b, 0) : 0;

  const perProduk = new Map(), perPost = new Map();
  klikIni.forEach((x) => { const k = `${x.id}|${x.pin}`; perProduk.set(k, (perProduk.get(k) || 0) + x.n); perPost.set(x.id, (perPost.get(x.id) || 0) + x.n); });
  const topProduk = [...perProduk].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ nama: nama.get(k) || k, n }));
  const topPost = [...perPost].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ id, judul: judul.get(id) || id, n }));

  // format & mood mana yang paling banyak diklik (rata-rata per post yang tayang di link bio)
  const briefs = new Map();
  await Promise.all(posts.slice(0, 40).map(async (p) => { const b = await bacaJson(`briefs/${p.id}.json`); if (b) briefs.set(p.id, b); }));
  const perFormat = {}, perMood = {};
  posts.slice(0, 40).forEach((p) => {
    const b = briefs.get(p.id); if (!b) return; const n = perPost.get(p.id) || 0;
    const f = (FORMAT[b.format] || {}).nama || b.format, m = (MOOD[b.mood] || {}).nama || b.mood;
    if (f) { perFormat[f] = perFormat[f] || { post: 0, klik: 0 }; perFormat[f].post++; perFormat[f].klik += n; }
    if (m) { perMood[m] = perMood[m] || { post: 0, klik: 0 }; perMood[m].post++; perMood[m].klik += n; }
  });
  const sumberKlik = {}; klikIni.forEach((x) => { sumberKlik[x.src] = (sumberKlik[x.src] || 0) + x.n; });
  const tanpaKlik = posts.flatMap((p) => (p.produk || []).map((x) => `${p.id}|${x.pin}`)).filter((k) => !perProduk.has(k)).length;

  return {
    periode: `${tglWIB(dari)} s.d. ${tglWIB(sampaiMs - HARI)}`,
    redis: adaRedis(),
    kunjungan: { ini: vIni, lalu: vLalu, sumber: ini ? ini.v : {} },
    klik: { ini: jumlah(klikIni), lalu: jumlah(klikLalu), sumber: sumberKlik },
    topProduk, topPost, perFormat, perMood,
    produkTanpaKlik: tanpaKlik, produkDiLinkBio: posts.reduce((s, p) => s + (p.produk || []).length, 0),
    produksi: { brief: briefMinggu.length, disetujui: disetujui.length, judulDisetujui: disetujui.map((p) => p.judul) },
    biaya: or ? { openrouterMinggu: or.minggu * KURS, openrouterBulan: or.bulan * KURS } : null,
  };
}

// Bagian angka (ditulis kode)
export function teksAngka(d) {
  const L = [`LAPORAN MINGGUAN @${BRAND.handle}`, d.periode, ''];
  if (!d.redis) L.push('Penghitung link bio belum aktif (Upstash Redis belum dipasang), jadi kunjungan & klik belum tercatat.', '');
  else {
    L.push(`Kunjungan link bio: ${d.kunjungan.ini} (${naik(d.kunjungan.ini, d.kunjungan.lalu)} vs minggu lalu)`);
    const src = Object.entries(d.kunjungan.sumber).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${SUMBER[s] || s} ${n}`).join(' · ');
    if (src) L.push(`  dari: ${src}`);
    L.push(`Klik ke Shopee: ${d.klik.ini} (${naik(d.klik.ini, d.klik.lalu)}) · ${d.kunjungan.ini ? (d.klik.ini / d.kunjungan.ini).toFixed(2).replace('.', ',') : '-'} klik per kunjungan`);
    if (d.topProduk.length) { L.push('', 'Produk paling diklik:'); d.topProduk.forEach((x, i) => L.push(`${i + 1}. ${x.nama} · ${x.n} klik`)); }
    if (d.topPost.length) { L.push('', 'Post paling banyak klik:'); d.topPost.forEach((x, i) => L.push(`${i + 1}. ${x.judul} · ${x.n} klik`)); }
    L.push(`Produk di link bio tanpa klik minggu ini: ${d.produkTanpaKlik} dari ${d.produkDiLinkBio}`);
  }
  L.push('', `Produksi: ${d.produksi.brief} brief, ${d.produksi.disetujui} post disetujui`);
  if (d.biaya) L.push(`Biaya OpenRouter: ${rp(d.biaya.openrouterMinggu)} minggu ini · ${rp(d.biaya.openrouterBulan)} bulan ini`);
  return L.join('\n');
}

export function bodyLaporan(d) {
  return {
    model: 'claude-sonnet-4-5', max_tokens: 700,
    system: PERSONA_LAPORAN + '\n\nTugas: baca data mingguan (JSON) lalu tulis bagian "CATATAN AKU" untuk Andi, pemilik akun. Format teks polos untuk Telegram (tanpa markdown, tanpa tanda bintang). Isi: maksimal 3 temuan singkat yang benar-benar terlihat dari angka (sebut angkanya), lalu "Minggu depan:" berisi 1-2 saran konkret (format atau mood brief yang perlu diulang/dikurangi, produk/post yang layak di-boost Rp20-25rb/hari, atau hal yang perlu dicek). Kalau datanya masih sedikit (misal klik < 20), katakan jujur bahwa belum bisa disimpulkan dan sarankan apa yang dikumpulkan dulu. Jangan mengarang angka yang tidak ada di data. Maksimal 700 karakter. Ingatkan juga dalam satu kalimat untuk cek pesanan & komisi di dashboard Shopee Affiliate karena data itu belum masuk sistem.',
    messages: [{ role: 'user', content: JSON.stringify(d) }],
  };
}
