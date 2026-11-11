// GET /api/state  — получить прогресс игрока
// PUT /api/state  { data } — сохранить прогресс

import { getDb } from '../lib/db.js';
import { send, readBody, handle, currentUser, publicUser, tr } from '../lib/http.js';
import { mergeSaves } from '../public/js/sync.js';
import { signToken } from '../lib/auth.js';

const MAX_SIZE = 1_500_000; // ~1,5 МБ — хватит на многие годы игры

export default handle(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });
  const db = await getDb();

  if (req.method === 'GET') {
    const state = await db.getState(user.id);
    return send(res, 200, {
      user: publicUser(user),
      // Свежий токен при каждом входе в игру: кто играет регулярно, тому не
      // придётся заново вводить пароль каждые два месяца.
      token: signToken(user.id),
      data: state ? state.data : null,
      updatedAt: state ? state.updatedAt : null,
    });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readBody(req);
    const data = body.data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.events)) {
      return send(res, 400, { error: tr(req, 'Неверный формат сохранения', 'Invalid save format') });
    }
    if (JSON.stringify(data).length > MAX_SIZE) {
      return send(res, 413, { error: tr(req, 'Сохранение слишком большое', 'Save is too large') });
    }
    // Игрок мог играть на другом устройстве: складываем обе версии,
    // чтобы ничего не потерялось.
    const stored = await db.getState(user.id);
    const merged = mergeSaves(stored?.data || null, data);
    if (JSON.stringify(merged).length > MAX_SIZE) {
      return send(res, 413, { error: tr(req, 'Сохранение слишком большое', 'Save is too large') });
    }
    const updatedAt = await db.saveState(user.id, merged);
    return send(res, 200, { ok: true, updatedAt, data: merged });
  }

  return send(res, 405, { error: tr(req, 'Метод не поддерживается', 'Method not allowed') });
});
