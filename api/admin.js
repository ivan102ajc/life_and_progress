// GET /api/admin?task=report — ежедневный отчёт разработчику.
// Вызывается расписанием Vercel (см. "crons" в vercel.json) раз в сутки.

import { getDb } from '../lib/db.js';
import { send, handle } from '../lib/http.js';
import { computeStats, notifyAdmin, adminIds } from '../lib/admin.js';

export default handle(async (req, res) => {
  // Запрос должен прийти от расписания Vercel.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!fromCron) return send(res, 401, { error: 'Only for the Vercel schedule' });
  if (!adminIds().length) return send(res, 200, { ok: true, skipped: 'ADMIN_TELEGRAM_ID is not set' });

  const db = await getDb();
  // Не больше одного отчёта в сутки, даже если запрос повторится.
  const today = new Date().toISOString().slice(0, 10);
  if ((await db.getMeta('last_report_day')) === today) return send(res, 200, { ok: true, skipped: 'already sent' });
  await db.setMeta('last_report_day', today);

  const stats = await computeStats(db);
  await notifyAdmin('☀️ Ежедневный отчёт\n\n' + stats.text);
  return send(res, 200, { ok: true });
});
