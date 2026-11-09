// POST /api/reset
//   { action: 'request', email } — прислать ссылку для сброса пароля в Telegram
//                                   (работает, если к аккаунту привязан Telegram).
//   { action: 'reset', code, password } — задать новый пароль по ссылке.
//
// Почту мы не отправляем: сброс идёт через бота игры. Поэтому восстановить
// пароль можно у аккаунтов, к которым привязан Telegram.

import { getDb } from '../lib/db.js';
import { hashPassword, signToken, signResetCode, verifyResetCode, resetCodeUserId } from '../lib/auth.js';
import { send, readBody, handle, publicUser, tr } from '../lib/http.js';
import { tgApi, appUrl } from '../lib/admin.js';

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: tr(req, 'Нужен POST-запрос', 'POST request required') });
  const body = await readBody(req);
  const db = await getDb();

  if (body.action === 'request') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = email ? await db.getUserByEmail(email) : null;
    // Если к аккаунту привязан Telegram — шлём ссылку туда.
    if (user && user.tg_id && process.env.TELEGRAM_BOT_TOKEN) {
      const code = signResetCode(user.id, user.pass_hash);
      const link = `${appUrl()}/?pwreset=${encodeURIComponent(code)}`;
      const state = await db.getState(user.id);
      const en = String(state?.data?.lang || '').startsWith('en');
      await tgApi('sendMessage', {
        chat_id: user.tg_id,
        text: en
          ? `🔑 Password reset for your Tree of Life account.\n\nTap the link to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn’t ask for this, just ignore this message.`
          : `🔑 Сброс пароля для аккаунта «Древо жизни».\n\nНажми на ссылку, чтобы задать новый пароль (действует 30 минут):\n${link}\n\nЕсли это были не ты — просто не обращай внимания.`,
        disable_web_page_preview: true,
      });
    }
    // Ответ одинаковый в любом случае, чтобы нельзя было подобрать, какие
    // почты зарегистрированы. Есть Telegram или нет — узнаёт только владелец.
    return send(res, 200, { ok: true });
  }

  if (body.action === 'reset') {
    const code = String(body.code || '');
    const password = String(body.password || '');
    if (password.length < 6) return send(res, 400, { error: tr(req, 'Пароль должен быть не короче 6 символов', 'Password must be at least 6 characters') });
    const uid = resetCodeUserId(code);
    const user = uid ? await db.getUserById(uid) : null;
    if (!user || verifyResetCode(code, user.pass_hash) !== user.id) {
      return send(res, 400, { error: tr(req, 'Ссылка недействительна или устарела. Запроси сброс заново.', 'This link is invalid or expired. Request a new reset.') });
    }
    await db.setPassword(user.id, hashPassword(password));
    // Сразу впускаем в аккаунт.
    return send(res, 200, { ok: true, token: signToken(user.id), user: publicUser(await db.getUserById(user.id)) });
  }

  return send(res, 400, { error: tr(req, 'Неизвестное действие', 'Unknown action') });
});
