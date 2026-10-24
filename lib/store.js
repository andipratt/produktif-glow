// Penyimpanan di Vercel Blob (public): state tiap post, foto, slide, daftar link bio.
import { put, get, head } from '@vercel/blob';

// Blob store baru di Vercel memakai OIDC (BLOB_STORE_ID), store lama memakai BLOB_READ_WRITE_TOKEN
export const adaBlob = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

export async function simpanJson(path, obj) {
  const r = await put(path, JSON.stringify(obj), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 60,
  });
  return r.url;
}

export async function bacaJson(path) {
  try {
    const r = await get(path, { access: 'public', useCache: false });
    if (!r || !r.stream) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) {
    // cadangan: lewat URL publik
    try {
      const h = await head(path);
      const t = await fetch(h.url + '?t=' + Date.now()).then((x) => x.text());
      return JSON.parse(t);
    } catch { return null; }
  }
}

export async function simpanGambar(path, buf, type = 'image/png') {
  const r = await put(path, buf, {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: type, cacheControlMaxAge: 31536000,
  });
  return r.url;
}

export const statePath = (id) => `posts/${id}/state.json`;
export const bacaState = (id) => bacaJson(statePath(id));
export const simpanState = (s) => simpanJson(statePath(s.post_id), { ...s, updated: new Date().toISOString() });
