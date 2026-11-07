// POST /api/remind  { off: true | false }
// Игрок включает или выключает ежедневные напоминания бота на 2 недели.

import { getDb } from '../lib/db.js';
import { send, readBody, handle, currentUser, tr } from '../lib/http.js';

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: tr(req, 'Нужен POST-запрос', 'POST request required') });
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });

  const body = await readBody(req);
  const until = body.off ? Date.now() + TWO_WEEKS : 0;
  const db = await getDb();
  await db.setRemindOff(user.id, until);
  return send(res, 200, { ok: true, remindOff: until });
});
