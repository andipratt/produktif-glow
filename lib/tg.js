// Kirim pesan ke bot Telegram langsung dari server (token di env TELEGRAM_BOT_TOKEN, diisi Andi sendiri).
const token = () => process.env.TELEGRAM_BOT_TOKEN;
export const CHAT_DEFAULT = '1736337735';

async function call(method, payload) {
  if (!token()) throw new Error('TELEGRAM_BOT_TOKEN belum dipasang di Vercel');
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

export const tgApi = call;

export const kirimTeks = (chat, text, keyboard) => call('sendMessage', {
  chat_id: chat || CHAT_DEFAULT, text: String(text).slice(0, 4096),
  reply_markup: keyboard || undefined, link_preview_options: { is_disabled: true },
});

export const kirimFoto = (chat, url, caption) => call('sendPhoto', { chat_id: chat || CHAT_DEFAULT, photo: url, caption });

export const kirimVideo = (chat, url, caption) => call('sendVideo', { chat_id: chat || CHAT_DEFAULT, video: url, caption, supports_streaming: true, width: 1080, height: 1920 });

export const kirimAlbum = (chat, urls, caption) => call('sendMediaGroup', {
  chat_id: chat || CHAT_DEFAULT,
  media: urls.map((u, i) => ({ type: 'photo', media: u, caption: i === 0 ? caption : undefined })),
});

export const jawabTombol = (id, text) => (id ? call('answerCallbackQuery', { callback_query_id: id, text }).catch(() => {}) : null);

export const tombolDraft = (id) => ({ inline_keyboard: [
  [{ text: 'Setujui draft', callback_data: `draft_ok|${id}` }],
  [{ text: 'Revisi caption', callback_data: `rev_caption|${id}` }, { text: 'Revisi foto', callback_data: `rev_foto|${id}` }],
  [{ text: 'Rapikan pin & label', callback_data: `rev_pin|${id}` }],
] });
