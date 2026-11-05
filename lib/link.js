// Связывание аккаунта сайта и аккаунта Telegram.

import { mergeSaves } from '../public/js/sync.js';

// Переносит Telegram и весь прогресс из аккаунта source в аккаунт target.
// Прогресс складывается, ничего не теряется. Аккаунт source остаётся пустым.
export async function mergeAccounts(db, target, source) {
  if (!source || source.id === target.id) return target;
  const [a, b] = await Promise.all([db.getState(target.id), db.getState(source.id)]);
  if (b?.data) {
    await db.saveState(target.id, mergeSaves(a?.data || null, b.data));
    await db.saveState(source.id, { events: [], merged_into: target.id });
  }
  const tgId = source.tg_id;
  if (tgId) {
    await db.setTelegram(source.id, null);
    await db.setTelegram(target.id, tgId);
  }
  return db.getUserById(target.id);
}

// Привязать Telegram (tgId) к аккаунту user. Если у этого Telegram уже был
// свой аккаунт без почты — его прогресс переносится. Если Telegram привязан
// к другому аккаунту с почтой — привязка не делается.
export async function linkTelegram(db, user, tgId) {
  const existing = await db.getUserByTg(tgId);
  if (existing && existing.id === user.id) return { user, status: 'already' };
  if (existing && existing.email) return { user, status: 'taken', other: existing };
  if (existing) return { user: await mergeAccounts(db, user, existing), status: 'merged' };
  if (user.tg_id) await db.setTelegram(user.id, null);
  await db.setTelegram(user.id, tgId);
  return { user: await db.getUserById(user.id), status: 'linked' };
}

export function maskEmail(email) {
  if (!email) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}
