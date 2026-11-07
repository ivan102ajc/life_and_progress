// POST /api/report — отчёт об ошибке в приложении.
// Без личных данных: только текст ошибки, место в коде и браузер/устройство.
// Одинаковые ошибки склеиваются; разработчику приходит уведомление о новой
// ошибке (и не чаще раза в сутки — о повторяющейся).

import crypto from 'node:crypto';
import { getDb } from '../lib/db.js';
import { send, readBody, handle } from '../lib/http.js';
import { notifyAdmin } from '../lib/admin.js';

const MAX_NOTIFY_PER_HOUR = 10;

// Убираем из текста то, что может случайно оказаться личным: почты, длинные
// числа, параметры в адресах.
function clean(s, max) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/\d{6,}/g, '<n>')
    .replace(/([?#])[^\s)]*/g, '$1…')
    .slice(0, max);
}

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
  const body = await readBody(req);
  const message = clean(body.message, 300);
  if (!message) return send(res, 400, { error: 'empty' });
  const source = clean(body.source, 200);
  const stack = clean(body.stack, 600);
  const ua = String(req.headers['user-agent'] || body.ua || '').slice(0, 250);
  const where = String(body.where || '').slice(0, 30);

  const hash = crypto.createHash('sha1').update(message + '|' + source).digest('hex');
  const db = await getDb();
  const { count, notifiedAt } = await db.upsertError({ hash, message, source, ua });

  if (count === 1 || Date.now() - notifiedAt > 24 * 60 * 60 * 1000) {
    const hourKey = 'err_notify_' + new Date().toISOString().slice(0, 13);
    const sent = Number(await db.getMeta(hourKey)) || 0;
    if (sent < MAX_NOTIFY_PER_HOUR) {
      await db.setMeta(hourKey, sent + 1);
      await db.markErrorNotified(hash);
      await notifyAdmin(
        `⚠️ ${count === 1 ? 'Новая ошибка' : `Ошибка повторяется (×${count})`}${where ? ` · ${where}` : ''}\n\n${message}` +
        (source ? `\n📍 ${source}` : '') + (stack ? `\n\n${stack}` : '') + `\n\n📱 ${ua}`,
      );
    }
  }
  return send(res, 200, { ok: true });
});
