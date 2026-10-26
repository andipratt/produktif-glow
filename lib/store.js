// Penyimpanan di Vercel Blob (public): state tiap post, foto, slide, daftar link bio.
import { put, head } from '@vercel/blob';

// Blob store baru di Vercel memakai OIDC (BLOB_STORE_ID), store lama memakai BLOB_READ_WRITE_TOKEN
export const adaBlob = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

export async function simpanJson(path, obj) {
  const r = await put(path, JSON.stringify(obj), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 60,
  });
  return r.url;
}

// Baca selalu versi terbaru: alamat dari head() (API, tidak di-cache), lalu ambil dengan penanda waktu
// supaya CDN Blob tidak menyajikan versi lama (dulu get() kadang mengembalikan isi sebelum ditimpa).
export async function bacaJson(path) {
  try {
    const h = await head(path);
    const r = await fetch(`${h.url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return JSON.parse(await r.text());
  } catch { return null; }
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
