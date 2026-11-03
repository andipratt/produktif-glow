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
// Pasangan frame awal & akhir dari satu foto, BERPUSAT di titik utama t = {x, y} (0-1, mis. tengah layar monitor):
// orbit (warp perspektif + geser kecil), maju (zoom ke titik), putar (rotasi di sekitar titik, sudut dari atas)
export async function frameGerak(buf, gerak = 'orbit', t = { x: 0.5, y: 0.5 }) {
  const img = await loadImage(buf), W0 = img.width, H0 = img.height;
  const genap = (n) => Math.max(2, Math.round(n / 2) * 2);
  const jepit = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));
  const px = t.x * W0, py = t.y * H0;
  // frame awal: jendela skala s0 yang tengahnya sedekat mungkin ke titik utama (margin m dari tepi atas/bawah)
  const awal = (s0, m = 0) => {
    const w = genap(W0 * s0), h = genap(H0 * s0);
    return { w, h, x: jepit(px - w / 2, 0, W0 - w), y: jepit(py - h / 2, H0 * m, H0 - h - H0 * m) };
  };
  // frame akhir: jendela skala s1 yang menaruh titik (qx,qy) di posisi RELATIF yang sama seperti di frame awal
  const akhir = (A, s1, qx, qy, lw = W0, lh = H0, m = 0) => {
    const w = genap(W0 * s1), h = genap(H0 * s1), rx = (px - A.x) / A.w, ry = (py - A.y) / A.h;
    return { w, h, x: jepit(qx - rx * w, 0, lw - w), y: jepit(qy - ry * h, lh * m, lh - h - lh * m) };
  };
  const crop = (r) => `crop=${r.w}:${r.h}:${Math.round(r.x)}:${Math.round(r.y)}`;
  if (gerak === 'maju') {
    const A = awal(0.88);
    return Promise.all([crop(A), crop(akhir(A, 0.72, px, py))].map((f, i) => ffJpg(buf, f, 'm' + i)));
  }
  // posisi titik utama setelah filter (warp/rotasi) diukur langsung: penanda putih di kanvas hitam ukuran sama, diproses ffmpeg yang sama
  const ukur = async (vf) => {
    const cv = createCanvas(W0, H0), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W0, H0); g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 6, 0, 7); g.fill();
    const im = await loadImage(await ffJpg(cv.toBuffer('image/png'), vf, 'u'));
    const c2 = createCanvas(im.width, im.height), g2 = c2.getContext('2d'); g2.drawImage(im, 0, 0);
    const d = g2.getImageData(0, 0, im.width, im.height).data; let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 128) { const q = i / 4; sx += q % im.width; sy += Math.floor(q / im.width); n++; }
    return n ? [sx / n, sy / n] : [px, py];
  };
  if (gerak === 'putar') {
    // putar searah jarum jam; kalau titik utama jauh dari tengah, sudut dikurangi supaya sudut hitam tidak masuk frame
    const A = awal(0.8);
    for (const deg of [5, 3.5, 2.5, 1.5]) {
      const rot = `rotate=${deg}*PI/180:c=black:ow=iw:oh=ih`, [qx, qy] = await ukur(rot);
      const B = akhir(A, 0.72, qx, qy), x0 = B.x, y0 = B.y;
      const sn = Math.sin(deg * Math.PI / 180), mx = H0 * sn / 2 + 3, my = W0 * sn / 2 + 3; // lebar sudut hitam hasil rotasi
      B.x = jepit(B.x, mx, W0 - mx - B.w); B.y = jepit(B.y, my, H0 - my - B.h);
      if ((Math.abs(B.x - x0) < W0 * 0.012 && Math.abs(B.y - y0) < H0 * 0.012) || deg === 1.5)
        return Promise.all([crop(A), `${rot},${crop(B)}`].map((f, i) => ffJpg(buf, f, 'p' + i)));
    }
  }
  // orbit: warp perspektif (seolah kamera berputar), titik utama tetap di posisi yang sama; margin 4% hindari tepi hitam
  const warp = 'perspective=x0=0:y0=-0.035*H:x1=W:y1=0.035*H:x2=0:y2=H*1.035:x3=W:y3=H*0.965:sense=destination:interpolation=cubic';
  const [qx, qy] = await ukur(warp);
  const A = awal(0.86, 0.04), B = akhir(A, 0.86, qx, qy, W0, H0, 0.04);
  return Promise.all([crop(A), `${warp},${crop(B)}`].map((f, i) => ffJpg(buf, f, 'o' + i)));
}
async function ffJpg(buf, vf, tag) {
  const dir = path.join('/tmp', 'fg-' + tag + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  await mkdir(dir, { recursive: true });
  try {
    const masuk = path.join(dir, 'in.png'), out = path.join(dir, 'out.jpg');
    await writeFile(masuk, buf);
    await run(['-y', '-i', masuk, '-vf', vf, '-q:v', '2', out]);
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
