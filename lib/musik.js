// Perpustakaan musik bebas royalti untuk video: impor (URL/zip/file Telegram), ubah ke AAC, deteksi tempo & ketukan.
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { unzipSync } from 'fflate';

const jalankan = (args, ambilStdout = false) => new Promise((ok, gagal) => {
  const p = spawn(ffmpegPath, args, { stdio: ['ignore', ambilStdout ? 'pipe' : 'ignore', 'pipe'] });
  const out = []; let err = '';
  if (ambilStdout) p.stdout.on('data', (d) => out.push(d));
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  p.on('close', (c) => (c === 0 ? ok(Buffer.concat(out)) : gagal(new Error('ffmpeg: ' + err.slice(-600)))));
});

export const EKST_AUDIO = /\.(mp3|ogg|wav|m4a|aac|flac|oga)$/i;

// zip -> daftar {nama, buf} file audio (maks n)
export function bukaZip(buf, n = 8) {
  const isi = unzipSync(new Uint8Array(buf), { filter: (f) => EKST_AUDIO.test(f.name) && !/__MACOSX/.test(f.name) });
  return Object.entries(isi).slice(0, n).map(([nama, data]) => ({ nama: path.basename(nama), buf: Buffer.from(data) }));
}

// Tempo & fase ketukan dari amplop onset (energi pita bawah+tengah), cukup untuk lofi/chill hop yang temponya stabil.
function deteksiKetukan(pcm, sr) {
  const hop = 512, win = 1024, n = Math.floor((pcm.length - win) / hop);
  const en = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * hop; for (let j = 0; j < win; j++) { const v = pcm[o + j]; s += v * v; } en[i] = Math.log(1e-9 + s); }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, en[i] - en[i - 1]);
  // rata-rata bergerak dikurangi supaya hanya lonjakan
  const hasil = new Float32Array(n); const w = 16;
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - w); k < Math.min(n, i + w); k++) { s += onset[k]; c++; } hasil[i] = Math.max(0, onset[i] - s / c); }
  const fps = sr / hop;
  let best = { skor: -1, bpm: 90 };
  for (let bpm = 70; bpm <= 160; bpm += 0.5) {
    const lag = (60 / bpm) * fps; let s = 0;
    for (let i = 0; i + 4 * lag < n; i++) s += hasil[i] * (hasil[Math.round(i + lag)] + 0.5 * hasil[Math.round(i + 2 * lag)] + 0.25 * hasil[Math.round(i + 4 * lag)]);
    s /= Math.max(1, n - 4 * lag);
    // sedikit pilih tempo di sekitar 85-120 (lofi/chill)
    s *= 1 + 0.15 * Math.exp(-Math.pow((bpm - 100) / 30, 2));
    if (s > best.skor) best = { skor: s, bpm };
  }
  const per = (60 / best.bpm) * fps;
  let fase = { skor: -1, f: 0 };
  for (let f = 0; f < per; f += 0.5) { let s = 0; for (let t = f; t < n; t += per) s += hasil[Math.round(t)] || 0; if (s > fase.skor) fase = { skor: s, f }; }
  return { bpm: best.bpm, beat0: (fase.f * hop) / sr };
}

// Mulai segmen: cari 16 detik paling "hidup" (energi tinggi), dimulai tepat di awal birama
function cariSegmen(pcm, sr, bpm, beat0, durMax = 16) {
  const birama = (60 / bpm) * 4, total = pcm.length / sr;
  let best = { t: beat0, e: -1 };
  for (let t = beat0; t + durMax < total; t += birama) {
    let s = 0; const a = Math.floor(t * sr), b = Math.floor((t + durMax) * sr);
    for (let i = a; i < b; i += 64) s += Math.abs(pcm[i]);
    const e = s / ((b - a) / 64);
    if (e > best.e) best = { t, e };
  }
  return Math.round(best.t * 1000) / 1000;
}

// buf audio apa saja -> { m4a, bpm, beat0, mulai, dur }
export async function olahLagu(buf, nama = 'lagu') {
  const dir = path.join('/tmp', 'musik-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  await mkdir(dir, { recursive: true });
  try {
    const masuk = path.join(dir, 'in' + (path.extname(nama) || '.mp3')), keluar = path.join(dir, 'out.m4a');
    await writeFile(masuk, buf);
    const sr = 22050;
    const raw = await jalankan(['-v', 'error', '-i', masuk, '-ac', '1', '-ar', String(sr), '-f', 'f32le', 'pipe:1'], true);
    const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
    const dur = pcm.length / sr;
    if (dur < 10) throw new Error(`lagu terlalu pendek (${dur.toFixed(1)} detik)`);
    const { bpm, beat0 } = deteksiKetukan(pcm, sr);
    const mulai = cariSegmen(pcm, sr, bpm, beat0);
    await jalankan(['-y', '-v', 'error', '-i', masuk, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '160k', keluar]);
    return { m4a: await readFile(keluar), bpm, beat0: Math.round(beat0 * 1000) / 1000, mulai, dur: Math.round(dur * 10) / 10 };
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// Pilih lagu: cocok mood, paling jarang dipakai
export const MOOD_MUSIK = { hangat: 'lofi', moody: 'lofi', terang: 'happy', editorial: 'chill' };
export function pilihLagu(daftar, mood) {
  const tag = MOOD_MUSIK[mood] || 'lofi';
  const cocok = daftar.filter((l) => (l.mood || []).includes(tag));
  const pool = (cocok.length ? cocok : daftar).slice().sort((a, b) => (a.dipakai || 0) - (b.dipakai || 0));
  return pool[0] || null;
}
