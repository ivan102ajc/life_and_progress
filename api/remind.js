// POST /api/remind  { off?, hour?, tz? }
//   off:  true  — выключить напоминания на 2 недели; false — включить снова
//   hour: 0–23  — в котором часу (по времени игрока) присылать напоминание
//   tz:   строка вроде "Europe/Moscow" — часовой пояс игрока (шлёт само приложение)

import { getDb } from '../lib/db.js';
import { send, readBody, handle, currentUser, publicUser, tr } from '../lib/http.js';

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

// Проверяем, что часовой пояс настоящий, прежде чем сохранять.
function validTz(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: tr(req, 'Нужен POST-запрос', 'POST request required') });
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });

  const body = await readBody(req);
  const db = await getDb();

  if (typeof body.off === 'boolean') {
    await db.setRemindOff(user.id, body.off ? Date.now() + TWO_WEEKS : 0);
  }
  const hour = Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23 ? body.hour : null;
  const tz = validTz(body.tz);
  if (hour != null || tz != null) {
    await db.setRemindPrefs(user.id, hour, tz);
  }

  return send(res, 200, { ok: true, user: publicUser(await db.getUserById(user.id)) });
});
