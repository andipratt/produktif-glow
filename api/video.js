// POST /api/video {secret, id, chat}: rangkai slide draft jadi video Reels 9:16 (tanpa AI), kirim ke Telegram.
import { waitUntil } from '@vercel/functions';
import { buatVideo } from '../lib/video.js';
import { bacaState, simpanGambar } from '../lib/store.js';
import { kirimTeks, kirimVideo, CHAT_DEFAULT } from '../lib/tg.js';

export const config = { maxDuration: 300 };

async function kerja(id, chat) {
  try {
    const st = await bacaState(id);
    if (!st || !Array.isArray(st.slides) || !st.slides.length) { await kirimTeks(chat, `Slide ${id} belum ada, jadi video belum bisa dibuat.`); return; }
    const bufs = await Promise.all(st.slides.map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer())));
    const mp4 = await buatVideo(bufs);
    const url = await simpanGambar(`posts/${id}/reels-${Date.now().toString(36)}.mp4`, mp4, 'video/mp4');
    await kirimVideo(chat, url, `REELS ${id} · ${st.slides.length} slide, ±${Math.round(st.slides.length * 2.75)} detik. Tambahkan musik dari library IG/TikTok saat posting.`);
  } catch (e) {
    await kirimTeks(chat, `GAGAL membuat video ${id}: ${String(e.message || e).slice(0, 300)}`).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let d = req.body; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  if (!process.env.BOT_SECRET || !d || d.secret !== process.env.BOT_SECRET) return res.status(401).json({ ok: false });
  waitUntil(kerja(String(d.id), String(d.chat || CHAT_DEFAULT)));
  return res.status(200).json({ ok: true });
}
