// Video Reels gratis (tanpa AI): slide carousel dirangkai jadi video 9:16 dengan zoom pelan dan transisi.
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const run = (args) => new Promise((ok, gagal) => {
  const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
  p.on('close', (c) => (c === 0 ? ok() : gagal(new Error('ffmpeg: ' + err.slice(-2500)))));
});

// gambar: array Buffer PNG/JPG (1080x1350). dur: detik per slide. Hasil: Buffer MP4 1080x1920
export async function buatVideo(gambar, { dur = 3.2, fade = 0.45 } = {}) {
  const dir = path.join('/tmp', 'vid-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  try {
    const files = [];
    for (let i = 0; i < gambar.length; i++) { const f = path.join(dir, `s${i}.png`); await writeFile(f, gambar[i]); files.push(f); }
    const fps = 30, fr = Math.round(dur * fps);
    const args = ['-y'];
    files.forEach((f) => args.push('-i', f));
    const parts = files.map((_, i) => {
      // latar: slide yang sama diperbesar + blur; depan: slide utuh dengan zoom pelan
      return `[${i}:v]split=2[b${i}][f${i}];` +
        `[b${i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.08,loop=loop=${fr}:size=1:start=0,setpts=N/${fps}/TB,fps=${fps}[bb${i}];` +
        `[f${i}]scale=1080:1350,setsar=1,zoompan=z='min(1+0.0009*on,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1350:fps=${fps}[ff${i}];` +
        `[bb${i}]setsar=1[bs${i}];[bs${i}][ff${i}]overlay=0:285:shortest=1,format=yuv420p,trim=duration=${dur},setpts=PTS-STARTPTS,fps=${fps}[v${i}]`;
    });
    let chain = parts.join(';');
    let last = 'v0', off = dur - fade;
    for (let i = 1; i < files.length; i++) {
      const out = i === files.length - 1 ? 'vout' : `x${i}`;
      chain += `;[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${off.toFixed(2)}[${out}]`;
      last = out; off += dur - fade;
    }
    if (files.length === 1) chain = chain.replace('[v0]', '[vout]');
    const out = path.join(dir, 'reels.mp4');
    args.push('-filter_complex', chain, '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(fps), out);
    await run(args);
    return await readFile(out);
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
