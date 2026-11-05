// POST /api/auth  { action: 'register' | 'login', email, password, name }

import { getDb } from '../lib/db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { send, readBody, handle, publicUser, currentUser } from '../lib/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Нужен POST-запрос' });

  const body = await readBody(req);
  const action = body.action;
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Проверьте адрес почты' });
  if (password.length < 6) return send(res, 400, { error: 'Пароль должен быть не короче 6 символов' });

  const db = await getDb();

  if (action === 'register') {
    const name = String(body.name || '').trim().slice(0, 40) || email.split('@')[0];
    if (await db.getUserByEmail(email)) {
      return send(res, 409, { error: 'Аккаунт с этой почтой уже есть. Попробуйте войти.' });
    }
    try {
      const user = await db.createUser({ email, name, passHash: hashPassword(password) });
      return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
    } catch (err) {
      if (err.code === '23505' || /duplicate/i.test(err.message)) {
        return send(res, 409, { error: 'Аккаунт с этой почтой уже есть. Попробуйте войти.' });
      }
      throw err;
    }
  }

  if (action === 'login') {
    const user = await db.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.pass_hash)) {
      return send(res, 401, { error: 'Неверная почта или пароль' });
    }
    return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
  }

  // Добавить вход по почте к аккаунту, созданному в Telegram.
  if (action === 'attach') {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: 'Нужно войти в аккаунт' });
    if (me.email) return send(res, 400, { error: 'У аккаунта уже есть почта' });
    const other = await db.getUserByEmail(email);
    if (other) {
      return send(res, 409, {
        error: 'Эта почта уже зарегистрирована на сайте. Можно объединить аккаунты — прогресс сложится.',
        code: 'email_taken',
      });
    }
    try {
      await db.setLogin(me.id, email, hashPassword(password));
    } catch (err) {
      if (err.code === '23505' || /duplicate/i.test(err.message)) {
        return send(res, 409, { error: 'Эта почта уже зарегистрирована', code: 'email_taken' });
      }
      throw err;
    }
    return send(res, 200, { user: publicUser(await db.getUserById(me.id)) });
  }

  return send(res, 400, { error: 'Неизвестное действие' });
});
