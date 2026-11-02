// Penyelesaian video AI: skala ke 1080x1920 + teks 2 kata di tengah (gaya "Home Office": miring serif + tebal sans).
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { dmsans700 } from './fonts.js';
import { frauncesItalic } from './font_miring.js';

const W = 1080, H = 1920;
let siap = false;
function font() {
  if (siap) return;
  GlobalFonts.register(Buffer.from(frauncesItalic, 'base64'), 'NgMiring');
  GlobalFonts.register(Buffer.from(dmsans700, 'base64'), 'NgTebal');
  siap = true;
}

// PNG transparan berisi teks di tengah, bayangan lembut supaya terbaca di atas foto apa pun
export function gambarTeks(miring, tebal) {
  font();
  const cv = createCanvas(W, H), x = cv.getContext('2d');
  let ukuran = 84;
  const lebar = () => { x.font = `400 ${ukuran}px NgMiring`; const a = x.measureText(miring + ' ').width; x.font = `700 ${ukuran}px NgTebal`; return a + x.measureText(tebal).width; };
  while (lebar() > W * 0.78 && ukuran > 48) ukuran -= 4;
  const total = lebar();
  let px = (W - total) / 2; const py = H * 0.57;
  x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 24; x.shadowOffsetY = 2; x.fillStyle = '#FFFFFF'; x.textBaseline = 'middle';
  x.font = `400 ${ukuran}px NgMiring`; x.fillText(miring + ' ', px, py); px += x.measureText(miring + ' ').width;
  x.font = `700 ${ukuran}px NgTebal`; x.fillText(tebal, px, py);
  return cv.toBuffer('image/png');
}

const run = (args) => new Promise((ok, gagal) => {
  const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.on('close', (c) => (c === 0 ? ok() : gagal(new Error('ffmpeg: ' + err.slice(-800)))));
});

// mp4 dari model -> mp4 1080x1920 30fps + teks (muncul lembut di 0,3 dtk), tanpa audio
export async function selesaikanVideo(mp4, teks) {
  const dir = path.join('/tmp', 'vid-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  try {
    const masuk = path.join(dir, 'in.mp4'), png = path.join(dir, 'teks.png'), out = path.join(dir, 'out.mp4');
    await writeFile(masuk, mp4);
    const ada = Array.isArray(teks) && teks.filter(Boolean).length;
    if (ada) await writeFile(png, gambarTeks(String(teks[0] || ''), String(teks[1] || '')));
    const dasar = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1`;
    const args = ['-y', '-i', masuk];
    if (ada) args.push('-loop', '1', '-i', png, '-filter_complex', `[0:v]${dasar}[v];[1:v]format=rgba,fade=t=in:st=0.3:d=0.6:alpha=1[t];[v][t]overlay=0:0:shortest=1,format=yuv420p[o]`, '-map', '[o]');
    else args.push('-vf', `${dasar},format=yuv420p`);
    args.push('-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-profile:v', 'high', '-movflags', '+faststart', out);
    await run(args);
    return await readFile(out);
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
