// POST /api/telegram
//   { initData }          — вход из Telegram Mini App (без пароля).
//                           Если запрос от вошедшего по почте игрока, Telegram
//                           привязывается к его аккаунту, прогресс объединяется.
//   { action: 'code' }    — ссылка на бота для привязки Telegram с сайта.
//   { action: 'unlink' }  — отвязать Telegram от аккаунта.
//
// Нужна переменная окружения TELEGRAM_BOT_TOKEN (токен бота от @BotFather).

import { getDb } from '../lib/db.js';
import { signToken, signLinkCode, verifyTelegramInitData } from '../lib/auth.js';
import { send, readBody, handle, currentUser, publicUser } from '../lib/http.js';
import { linkTelegram, maskEmail } from '../lib/link.js';

let botName = null;
async function getBotName(token) {
  if (botName) return botName;
  if (process.env.TELEGRAM_BOT_USERNAME) return (botName = process.env.TELEGRAM_BOT_USERNAME);
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`).then(r => r.json());
  botName = res?.result?.username || null;
  return botName;
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Нужен POST-запрос' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return send(res, 501, { error: 'Вход через Telegram ещё не настроен' });

  const body = await readBody(req);
  const db = await getDb();
  const me = await currentUser(req);

  if (body.action === 'code') {
    if (!me) return send(res, 401, { error: 'Нужно войти в аккаунт' });
    const name = await getBotName(botToken);
    if (!name) return send(res, 502, { error: 'Не удалось связаться с Telegram' });
    const code = signLinkCode(me.id);
    return send(res, 200, { url: `https://t.me/${name}?start=${code}`, bot: name });
  }

  if (body.action === 'unlink') {
    if (!me) return send(res, 401, { error: 'Нужно войти в аккаунт' });
    if (!me.email) {
      return send(res, 400, { error: 'Сначала добавь вход по почте, иначе потеряешь доступ к аккаунту' });
    }
    await db.setTelegram(me.id, null);
    return send(res, 200, { user: publicUser(await db.getUserById(me.id)) });
  }

  const tgUser = verifyTelegramInitData(String(body.initData || ''), botToken);
  if (!tgUser || !tgUser.id) return send(res, 401, { error: 'Не удалось проверить данные Telegram' });
  const tgId = String(tgUser.id);

  // Игрок вошёл по почте прямо в Telegram — привязываем Telegram к этому аккаунту.
  if (me && me.email && me.tg_id !== tgId) {
    const r = await linkTelegram(db, me, tgId);
    if (r.status === 'taken') {
      return send(res, 200, {
        token: signToken(me.id), user: publicUser(me),
        notice: `Этот Telegram уже привязан к другому аккаунту (${maskEmail(r.other.email)}). Чтобы привязать его сюда, сначала отвяжи его там.`,
      });
    }
    return send(res, 200, { token: signToken(r.user.id), user: publicUser(r.user), linked: r.status });
  }

  let user = await db.getUserByTg(tgId);
  if (!user) {
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок';
    user = await db.createUser({ name, tgId });
  }
  return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
});
