// POST /api/musik {secret, chat, url?, fileId?, nama?, mood?}: tambah lagu bebas royalti ke perpustakaan musik video.
// Sumber: link mp3/ogg/wav/zip (mis. OpenGameArt CC0) atau file audio yang dikirim ke bot.
import { waitUntil } from '@vercel/functions';
import { bacaJson, simpanJson, simpanGambar } from '../lib/store.js';
import { kirimTeks, tgApi, CHAT_DEFAULT } from '../lib/tg.js';
import { olahLagu, bukaZip, EKST_AUDIO } from '../lib/musik.js';

export const config = { maxDuration: 300 };
const DAFTAR = 'musik/daftar.json';

const tebakMood = (nama) => (/happy|ceria|upbeat|fun|bright|sunny/i.test(nama) ? 'happy' : /chill|calm|relax|beats/i.test(nama) ? 'chill' : 'lofi');

async function kerja(d) {
  const chat = String(d.chat || CHAT_DEFAULT);
  try {
    let buf, nama = d.nama || '', sumber = d.url || 'telegram';
    if (d.fileId) {
      const f = await tgApi('getFile', { file_id: d.fileId });
      buf = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`)).arrayBuffer());
      nama = nama || f.file_path.split('/').pop();
    } else {
      const r = await fetch(d.url, { headers: { 'user-agent': 'Mozilla/5.0 ngemeja-bot' } });
      if (!r.ok) throw new Error(`gagal unduh (${r.status})`);
      buf = Buffer.from(await r.arrayBuffer());
      nama = nama || decodeURIComponent(new URL(d.url).pathname.split('/').pop());
    }
    const berkas = /\.zip$/i.test(nama) ? bukaZip(buf, 6) : [{ nama, buf }];
    if (!berkas.length) throw new Error('tidak ada file audio di dalamnya');
    const daftar = (await bacaJson(DAFTAR)) || [];
    const masuk = [];
    for (const b of berkas) {
      if (!EKST_AUDIO.test(b.nama) && !d.fileId) continue;
      try {
        const r = await olahLagu(b.buf, b.nama);
        const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const url = await simpanGambar(`musik/${id}.m4a`, r.m4a, 'audio/mp4');
        const judul = b.nama.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
        const item = { id, judul, url, bpm: r.bpm, beat0: r.beat0, mulai: r.mulai, dur: r.dur, mood: [d.mood || tebakMood(b.nama + ' ' + nama)], sumber, lisensi: d.lisensi || 'bebas royalti (dari Andi)', dipakai: 0 };
        daftar.push(item); masuk.push(item);
      } catch (e) { masuk.push({ gagal: true, judul: b.nama, alasan: e.message }); }
    }
    await simpanJson(DAFTAR, daftar);
    await kirimTeks(chat, `MUSIK DITAMBAHKAN\n${masuk.map((m) => (m.gagal ? `- ${m.judul}: gagal (${m.alasan})` : `- ${m.judul} · ${m.bpm} BPM · ${m.mood.join(', ')} · ${Math.round(m.dur)} dtk`)).join('\n')}\n\nTotal perpustakaan: ${daftar.length} lagu.`);
  } catch (e) {
    await kirimTeks(chat, `GAGAL menambah musik: ${String(e.message || e).slice(0, 300)}`).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(kerja(d));
  return res.status(200).json({ ok: true });
}
