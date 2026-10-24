// POST /api/slide  body JSON: { slide: "hook"|"peta"|"struk", img: "<base64 atau URL>", mime?, ... }
// Balasan: PNG 1080x1350, atau JSON {b64} jika format: "json".
import { renderSlide } from '../lib/render.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Gunakan POST' }); return; }
  try {
    let d = req.body;
    if (typeof d === 'string') d = JSON.parse(d);
    if (!d || !d.img) { res.status(400).json({ error: 'img wajib diisi' }); return; }
    if (!/^https?:|^data:/.test(d.img)) d.img = `data:${d.mime || 'image/png'};base64,${d.img}`;
    if (typeof d.items === 'string') d.items = JSON.parse(d.items);
    if (typeof d.allBoxes === 'string') d.allBoxes = JSON.parse(d.allBoxes);
    if (typeof d.boxes === 'string') d.boxes = JSON.parse(d.boxes);
    if (typeof d.meta === 'string') d.meta = JSON.parse(d.meta);
    const out = Buffer.from(await renderSlide(d).arrayBuffer());
    res.setHeader('Cache-Control', 'no-store');
    if (d.format === 'json') { res.status(200).json({ b64: out.toString('base64'), mime: 'image/png', bytes: out.length }); return; }
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(out);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
