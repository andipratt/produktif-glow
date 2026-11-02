// Penyelesaian video AI: skala ke 1080x1920, diperlambat ke 10 dtk, teks "ngemeja <jenis meja>" di bagian atas.
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
    let px = (W - a - b) / 2; const py = H * 0.2;
    x.font = `600 ${u}px NgMerek`; x.fillText(merek + ' ', px, py); px += a;
    x.font = `400 ${u}px NgMiring`; x.fillText(isi, px, py);
  } else {
    // terlalu panjang: "ngemeja" di atas, jenis meja di baris kedua
    x.textAlign = 'center';
    x.font = `600 ${u}px NgMerek`; x.fillText(merek, W / 2, H * 0.17);
    let u2 = u; x.font = `400 ${u2}px NgMiring`;
    while (x.measureText(isi).width > W * 0.84 && u2 > 44) { u2 -= 2; x.font = `400 ${u2}px NgMiring`; }
    x.fillText(isi, W / 2, H * 0.17 + u * 1.05);
  }
  return cv.toBuffer('image/png');
}

const run = (args) => new Promise((ok, gagal) => {
  const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.on('close', (c) => (c === 0 ? ok() : gagal(new Error('ffmpeg: ' + err.slice(-800)))));
});

// Frame akhir "orbit" dari FOTO YANG SAMA (tanpa AI): warp perspektif seolah kamera berputar ±8 derajat
// mengelilingi titik tengah meja + sedikit bergeser, lalu dipotong supaya tepi hitam hilang. Isi adegan identik 100%.
export async function frameOrbit(buf) {
  const dir = path.join('/tmp', 'orb-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  try {
    const masuk = path.join(dir, 'in.png'), out = path.join(dir, 'out.jpg');
    await writeFile(masuk, buf);
    // sisi kanan menjauh (lebih pendek), sisi kiri mendekat (lebih tinggi), titik tengah tetap
    const f = 'perspective=x0=0:y0=-0.035*H:x1=W:y1=0.035*H:x2=0:y2=H*1.035:x3=W:y3=H*0.965:sense=destination:interpolation=cubic,' +
      'crop=iw*0.86:ih*0.86:iw*0.07-iw*0.03:ih*0.07';
    await run(['-y', '-i', masuk, '-vf', f, '-q:v', '2', out]);
    return await readFile(out);
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
// frame awal dengan potongan yang sama (tanpa warp) supaya skala kedua ujung setara
export async function frameAwal(buf) {
  const dir = path.join('/tmp', 'awl-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  try {
    const masuk = path.join(dir, 'in.png'), out = path.join(dir, 'out.jpg');
    await writeFile(masuk, buf);
    await run(['-y', '-i', masuk, '-vf', 'crop=iw*0.86:ih*0.86:iw*0.07+iw*0.03:ih*0.07', '-q:v', '2', out]);
    return await readFile(out);
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

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
