// GET /api/state  — получить прогресс игрока
// PUT /api/state  { data } — сохранить прогресс

import { getDb } from '../lib/db.js';
import { send, readBody, handle, currentUser, publicUser } from '../lib/http.js';

const MAX_SIZE = 1_500_000; // ~1,5 МБ — хватит на многие годы игры

export default handle(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: 'Нужно войти в аккаунт' });
  const db = await getDb();

  if (req.method === 'GET') {
    const state = await db.getState(user.id);
    return send(res, 200, {
      user: publicUser(user),
      data: state ? state.data : null,
      updatedAt: state ? state.updatedAt : null,
    });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readBody(req);
    const data = body.data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.events)) {
      return send(res, 400, { error: 'Неверный формат сохранения' });
    }
    if (JSON.stringify(data).length > MAX_SIZE) {
      return send(res, 413, { error: 'Сохранение слишком большое' });
    }
    const updatedAt = await db.saveState(user.id, data);
    return send(res, 200, { ok: true, updatedAt });
  }

  return send(res, 405, { error: 'Метод не поддерживается' });
});
