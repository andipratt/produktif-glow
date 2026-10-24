// Panggilan langsung ke Claude dan OpenRouter. API key hanya dibaca dari environment variable Vercel.
async function post(url, headers, body, label) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok || !j) throw new Error(`${label} ${r.status}: ${(j && (j.error && (j.error.message || j.error))) || t.slice(0, 200)}`);
  return j;
}

export async function claude(body) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY belum dipasang di Vercel');
  const j = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body, 'Claude');
  return (j.content || []).map((c) => c.text || '').join('');
}

const orHeaders = () => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY belum dipasang di Vercel');
  return { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://produktif-glow.vercel.app', 'X-Title': 'Produktif Glow' };
};

// Buat/edit foto. Balikan: { buf, mime }
export async function gambar(body) {
  const j = await post('https://openrouter.ai/api/v1/images', orHeaders(), body, 'Foto');
  const d = (j.data || [])[0];
  if (!d || !d.b64_json) throw new Error('Foto: model tidak mengembalikan gambar');
  return { buf: Buffer.from(d.b64_json, 'base64'), mime: d.media_type || 'image/png' };
}

export async function chatOR(body) {
  const j = await post('https://openrouter.ai/api/v1/chat/completions', orHeaders(), body, 'Deteksi');
  return ((j.choices || [])[0] || {}).message?.content || '';
}
