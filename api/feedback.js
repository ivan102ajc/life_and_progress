// POST /api/feedback  { text, platform } — отзыв игрока разработчику.
// Сохраняется в базе и приходит администратору в Telegram. Если у игрока
// привязан Telegram, администратор может ответить прямо из бота.

import { getDb } from '../lib/db.js';
import { send, readBody, handle, currentUser, tr } from '../lib/http.js';
import { notifyAdmin } from '../lib/admin.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: tr(req, 'Нужен POST-запрос', 'POST request required') });
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });

  const body = await readBody(req);
  const text = String(body.text || '').trim().slice(0, 2000);
  if (text.length < 3) return send(res, 400, { error: tr(req, 'Напиши хотя бы пару слов', 'Write at least a few words') });
  const platform = body.platform === 'telegram' ? 'telegram' : 'web';
  const lang = String(req.headers['x-lang'] || 'ru').slice(0, 5);

  const db = await getDb();
  const id = await db.addFeedback({
    userId: user.id, text, lang, platform, ua: String(req.headers['user-agent'] || '').slice(0, 300),
  });

  await notifyAdmin(
    `💬 Отзыв #${id}\nОт: ${user.name || 'без имени'} · ${platform === 'telegram' ? 'Telegram' : 'сайт'} · ${lang}\n\n${text}\n\n` +
    (user.tg_id ? '↩️ Ответь на это сообщение — ответ уйдёт игроку в Telegram.' : 'У игрока не привязан Telegram — ответить через бота не получится.'),
  );
  return send(res, 200, { ok: true, id });
});
