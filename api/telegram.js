// POST /api/telegram  { initData }
// Вход из Telegram Mini App. Работает, когда в Vercel задана переменная
// TELEGRAM_BOT_TOKEN (токен бота от @BotFather).
// Если запрос пришёл от уже вошедшего пользователя, Telegram привязывается
// к его аккаунту, и прогресс становится общим для сайта и Telegram.

import { getDb } from '../lib/db.js';
import { signToken, verifyTelegramInitData } from '../lib/auth.js';
import { send, readBody, handle, currentUser, publicUser } from '../lib/http.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Нужен POST-запрос' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return send(res, 501, { error: 'Вход через Telegram ещё не настроен' });

  const body = await readBody(req);
  const tgUser = verifyTelegramInitData(String(body.initData || ''), botToken);
  if (!tgUser || !tgUser.id) return send(res, 401, { error: 'Не удалось проверить данные Telegram' });

  const db = await getDb();
  const tgId = String(tgUser.id);
  const existing = await db.getUserByTg(tgId);
  const me = await currentUser(req);

  if (me && !existing) {
    await db.setTelegram(me.id, tgId);
    const user = await db.getUserById(me.id);
    return send(res, 200, { token: signToken(user.id), user: publicUser(user), linked: true });
  }

  let user = existing;
  if (!user) {
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок';
    user = await db.createUser({ name, tgId });
  }
  return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
});
