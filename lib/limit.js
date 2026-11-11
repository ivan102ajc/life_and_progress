// Простое ограничение частоты: не больше max попыток за окно windowMs.
// Счётчик хранится в таблице meta под постоянным ключом (ключ перезаписывается,
// поэтому таблица не разрастается). Имя и идентификатор хешируются.

import crypto from 'node:crypto';

const keyOf = (name, id) => 'rl:' + name + ':' + crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 24);

async function read(db, key, now) {
  try {
    const v = JSON.parse((await db.getMeta(key)) || 'null');
    return v && v.until > now ? v : null;
  } catch { return null; }
}

// Сколько секунд ещё ждать (0 — можно продолжать).
export async function blockedFor(db, name, id, max, now = Date.now()) {
  const v = await read(db, keyOf(name, id), now);
  return v && v.n >= max ? Math.ceil((v.until - now) / 1000) : 0;
}

// Записать попытку.
export async function hit(db, name, id, windowMs, now = Date.now()) {
  const key = keyOf(name, id);
  const v = await read(db, key, now);
  await db.setMeta(key, JSON.stringify(v ? { n: v.n + 1, until: v.until } : { n: 1, until: now + windowMs }));
}

// Сбросить счётчик (например, после успешного входа).
export async function clear(db, name, id) {
  await db.setMeta(keyOf(name, id), 'null');
}
