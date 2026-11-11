// Небольшие помощники для обработчиков API.
// Работают и на Vercel, и на локальном сервере (dev-server.js).

import { verifyToken } from './auth.js';
import { getDb } from './db.js';

// Язык ответа: приложение присылает его в заголовке X-Lang.
export function isEn(req) {
  const l = String(req.headers['x-lang'] || req.headers['accept-language'] || 'ru').toLowerCase();
  return l.startsWith('en');
}
// Сообщение на языке игрока: tr(req, 'По-русски', 'In English').
export function tr(req, ru, en) {
  return isEn(req) ? en : ru;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body || '{}'); } catch { return {}; }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return JSON.parse(req.body.toString() || '{}'); } catch { return {}; }
    }
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

export async function currentUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = verifyToken(token);
  if (!data) return null;
  const db = await getDb();
  return db.getUserById(data.uid);
}

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, telegram: Boolean(u.tg_id), remindOff: Number(u.remind_off) || 0 };
}

// Оборачивает обработчик: любые неожиданные ошибки превращаются в понятный ответ.
export function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      // Подробности ошибки остаются в журнале сервера: игроку их показывать незачем.
      const known = err && err.expose ? err.message : null;
      if (!res.headersSent) send(res, 500, { error: known || tr(req, 'Что-то пошло не так на сервере. Попробуй ещё раз чуть позже.', 'Something went wrong on the server. Please try again a bit later.') });
    }
  };
}
