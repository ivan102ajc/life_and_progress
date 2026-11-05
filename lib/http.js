// Небольшие помощники для обработчиков API.
// Работают и на Vercel, и на локальном сервере (dev-server.js).

import { verifyToken } from './auth.js';
import { getDb } from './db.js';

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
  return { id: u.id, name: u.name, email: u.email, telegram: Boolean(u.tg_id) };
}

// Оборачивает обработчик: любые неожиданные ошибки превращаются в понятный ответ.
export function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: err.message || 'Внутренняя ошибка сервера' });
    }
  };
}
