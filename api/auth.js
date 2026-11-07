// POST /api/auth  { action: 'register' | 'login', email, password, name }

import { getDb } from '../lib/db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { send, readBody, handle, publicUser, currentUser, tr } from '../lib/http.js';
import { notifyNewPlayer } from '../lib/admin.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: tr(req, 'Нужен POST-запрос', 'POST request required') });

  const body = await readBody(req);
  const action = body.action;

  // Удалить аккаунт и все его данные (прогресс, отзывы) — право игрока по закону.
  if (action === 'delete') {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });
    if (me.pass_hash && !verifyPassword(String(body.password || ''), me.pass_hash)) {
      return send(res, 401, { error: tr(req, 'Неверный пароль', 'Wrong password') });
    }
    if (!me.pass_hash && body.confirm !== true) {
      return send(res, 400, { error: tr(req, 'Нужно подтверждение', 'Confirmation required') });
    }
    const db = await getDb();
    await db.deleteUser(me.id);
    return send(res, 200, { ok: true });
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!EMAIL_RE.test(email)) return send(res, 400, { error: tr(req, 'Проверьте адрес почты', 'Check your email address') });
  if (password.length < 6) return send(res, 400, { error: tr(req, 'Пароль должен быть не короче 6 символов', 'Password must be at least 6 characters') });

  const db = await getDb();

  if (action === 'register') {
    const name = String(body.name || '').trim().slice(0, 40) || email.split('@')[0];
    if (await db.getUserByEmail(email)) {
      return send(res, 409, { error: tr(req, 'Аккаунт с этой почтой уже есть. Попробуйте войти.', 'An account with this email already exists. Try logging in.') });
    }
    try {
      const user = await db.createUser({ email, name, passHash: hashPassword(password) });
      await notifyNewPlayer(db, user, 'сайт');
      return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
    } catch (err) {
      if (err.code === '23505' || /duplicate/i.test(err.message)) {
        return send(res, 409, { error: tr(req, 'Аккаунт с этой почтой уже есть. Попробуйте войти.', 'An account with this email already exists. Try logging in.') });
      }
      throw err;
    }
  }

  if (action === 'login') {
    const user = await db.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.pass_hash)) {
      return send(res, 401, { error: tr(req, 'Неверная почта или пароль', 'Wrong email or password') });
    }
    return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
  }

  // Добавить вход по почте к аккаунту, созданному в Telegram.
  if (action === 'attach') {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: tr(req, 'Нужно войти в аккаунт', 'Please log in') });
    if (me.email) return send(res, 400, { error: tr(req, 'У аккаунта уже есть почта', 'This account already has an email') });
    const other = await db.getUserByEmail(email);
    if (other) {
      return send(res, 409, {
        error: tr(req, 'Эта почта уже зарегистрирована на сайте. Можно объединить аккаунты — прогресс сложится.', 'This email is already registered on the website. You can merge the accounts — progress will be added together.'),
        code: 'email_taken',
      });
    }
    try {
      await db.setLogin(me.id, email, hashPassword(password));
    } catch (err) {
      if (err.code === '23505' || /duplicate/i.test(err.message)) {
        return send(res, 409, { error: tr(req, 'Эта почта уже зарегистрирована', 'This email is already registered'), code: 'email_taken' });
      }
      throw err;
    }
    return send(res, 200, { user: publicUser(await db.getUserById(me.id)) });
  }

  return send(res, 400, { error: tr(req, 'Неизвестное действие', 'Unknown action') });
});
