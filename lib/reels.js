// Penyelesaian video AI: skala ke 1080x1920 + teks 2 kata di tengah (gaya "Home Office": miring serif + tebal sans).
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { fraunces600 } from './fonts.js';
import { frauncesItalic } from './font_miring.js';

const W = 1080, H = 1920;
let siap = false;
function font() {
  if (siap) return;
  GlobalFonts.register(Buffer.from(frauncesItalic, 'base64'), 'NgMiring');
  GlobalFonts.register(Buffer.from(fraunces600, 'base64'), 'NgMerek');
  siap = true;
}

// PNG transparan: "ngemeja" (font wordmark, Fraunces SemiBold) + jenis meja (Fraunces Italic, gaya hook carousel)
export function gambarTeks(jenis) {
  font();
  const cv = createCanvas(W, H), x = cv.getContext('2d');
  const merek = 'ngemeja', isi = String(jenis || '').trim().toLowerCase();
  let u = 86;
  const ukur = () => { x.font = `600 ${u}px NgMerek`; const a = x.measureText(merek + ' ').width; x.font = `400 ${u}px NgMiring`; return [a, x.measureText(isi).width]; };
  while ((ukur()[0] + ukur()[1]) > W * 0.8 && u > 60) u -= 2;
  const [a, b] = ukur();
  x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 24; x.shadowOffsetY = 2; x.fillStyle = '#FFFFFF'; x.textBaseline = 'middle';
  if (a + b <= W * 0.8) {
    let px = (W - a - b) / 2; const py = H * 0.57;
    x.font = `600 ${u}px NgMerek`; x.fillText(merek + ' ', px, py); px += a;
    x.font = `400 ${u}px NgMiring`; x.fillText(isi, px, py);
  } else {
    // terlalu panjang: "ngemeja" di atas, jenis meja di baris kedua
    x.textAlign = 'center';
    x.font = `600 ${u}px NgMerek`; x.fillText(merek, W / 2, H * 0.55);
    let u2 = u; x.font = `400 ${u2}px NgMiring`;
    while (x.measureText(isi).width > W * 0.84 && u2 > 44) { u2 -= 2; x.font = `400 ${u2}px NgMiring`; }
    x.fillText(isi, W / 2, H * 0.55 + u * 1.05);
  }
  return cv.toBuffer('image/png');
}

// Dua frame dari satu foto 9:16 untuk video AI: potongan 90% kiri-atas sedikit dan kanan, rasio tetap 9:16.
// Selisih 10% lebar = kamera bergeser pelan; isi adegan identik di kedua ujung.
export async function frameGeser(buf) {
  const img = await loadImage(buf);
  const k = 0.9, w = img.width * k, h = img.height * k, y = (img.height - h) / 2;
  const potong = (x0) => { const c = createCanvas(Math.round(w), Math.round(h)); c.getContext('2d').drawImage(img, x0, y, w, h, 0, 0, w, h); return c.toBuffer('image/jpeg', 92); };
  return [potong(0), potong(img.width - w)];
}

const run = (args) => new Promise((ok, gagal) => {
  const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.on('close', (c) => (c === 0 ? ok() : gagal(new Error('ffmpeg: ' + err.slice(-800)))));
});

// mp4 dari model -> mp4 1080x1920 30fps + teks "ngemeja <jenis meja>" (muncul lembut di 0,3 dtk), tanpa audio
export async function selesaikanVideo(mp4, teks) {
  const dir = path.join('/tmp', 'vid-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  try {
    const masuk = path.join(dir, 'in.mp4'), png = path.join(dir, 'teks.png'), out = path.join(dir, 'out.mp4');
    await writeFile(masuk, mp4);
    const ada = !!String(teks || '').trim();
    if (ada) await writeFile(png, gambarTeks(teks));
    // diperlambat 1,25x: 8 dtk dari model -> 10 dtk, gerak kamera makin pelan (frame disambung halus)
    const dasar = `setpts=1.25*PTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},framerate=fps=30,setsar=1`;
    const args = ['-y', '-i', masuk];
    if (ada) args.push('-loop', '1', '-i', png, '-filter_complex', `[0:v]${dasar}[v];[1:v]format=rgba,fade=t=in:st=0.3:d=0.6:alpha=1[t];[v][t]overlay=0:0:shortest=1,format=yuv420p[o]`, '-map', '[o]');
    else args.push('-vf', `${dasar},format=yuv420p`);
    args.push('-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-profile:v', 'high', '-movflags', '+faststart', out);
    await run(args);
    return await readFile(out);
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
