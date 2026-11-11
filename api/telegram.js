// POST /api/telegram
//   { initData }          — вход из Telegram Mini App (без пароля).
//                           Если запрос от вошедшего по почте игрока, Telegram
//                           привязывается к его аккаунту, прогресс объединяется.
//   { action: 'code' }    — ссылка на бота для привязки Telegram с сайта.
//   { action: 'unlink' }  — отвязать Telegram от аккаунта.
// GET /api/telegram       — имя бота (для ссылки «написать в поддержку»).
//
// Нужна переменная окружения TELEGRAM_BOT_TOKEN (токен бота от @BotFather).

import { getDb } from '../lib/db.js';
import { signToken, signLinkCode, verifyTelegramInitData } from '../lib/auth.js';
import { send, readBody, handle, currentUser, publicUser, tr } from '../lib/http.js';
import { linkTelegram, maskEmail } from '../lib/link.js';
import { notifyNewPlayer } from '../lib/admin.js';

let botName = null;
async function getBotName(token) {
  if (botName) return botName;
  if (process.env.TELEGRAM_BOT_USERNAME) return (botName = process.env.TELEGRAM_BOT_USERNAME);
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`).then(r => r.json());
  botName = res?.result?.username || null;
  return botName;
}

export default handle(async (req, res) => {
  // GET /api/telegram — имя бота игры (для ссылки на поддержку).
  if (req.method === 'GET') {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    return send(res, 200, { bot: token ? await getBotName(token).catch(() => null) : null });
  }
  if (req.method !== 'POST') return send(res, 405, { error: tr(req, 'Нужен POST-запрос', 'POST request required') });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return send(res, 501, { error: tr(req, 'Вход через Telegram ещё не настроен', 'Telegram login is not set up yet') });

  const body = await readBody(req);
  const db = await getDb();
  const me = await currentUser(req);

  if (body.action === 'code') {
    if (!me) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });
    const name = await getBotName(botToken);
    if (!name) return send(res, 502, { error: tr(req, 'Не удалось связаться с Telegram', 'Could not reach Telegram') });
    const code = signLinkCode(me.id);
    return send(res, 200, { url: `https://t.me/${name}?start=${code}`, bot: name });
  }

  if (body.action === 'unlink') {
    if (!me) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });
    if (!me.email) {
      return send(res, 400, { error: tr(req, 'Сначала добавь вход по почте, иначе потеряешь доступ к аккаунту', 'Add an email login first, or you’ll lose access to the account') });
    }
    await db.setTelegram(me.id, null);
    return send(res, 200, { user: publicUser(await db.getUserById(me.id)) });
  }

  const tgUser = verifyTelegramInitData(String(body.initData || ''), botToken);
  if (!tgUser || !tgUser.id) return send(res, 401, { error: tr(req, 'Не удалось проверить данные Telegram', 'Could not verify Telegram data') });
  const tgId = String(tgUser.id);

  // Игрок вошёл по почте прямо в Telegram — привязываем Telegram к этому аккаунту.
  if (me && me.email && me.tg_id !== tgId) {
    const r = await linkTelegram(db, me, tgId);
    if (r.status === 'taken') {
      return send(res, 200, {
        token: signToken(me.id), user: publicUser(me),
        notice: tr(req, `Этот Telegram уже привязан к другому аккаунту (${maskEmail(r.other.email)}). Чтобы привязать его сюда, сначала отвяжи его там.`, `This Telegram is already linked to another account (${maskEmail(r.other.email)}). To link it here, unlink it there first.`),
      });
    }
    return send(res, 200, { token: signToken(r.user.id), user: publicUser(r.user), linked: r.status });
  }

  let user = await db.getUserByTg(tgId);
  if (!user) {
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').slice(0, 40) || tr(req, 'Игрок', 'Player');
    user = await db.createUser({ name, tgId });
    await notifyNewPlayer(db, user, 'Telegram');
  }
  return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
});
