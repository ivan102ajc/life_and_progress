// Хранилище данных.
// • На Vercel (есть переменная DATABASE_URL) — бесплатная база Postgres от Neon.
// • На своём компьютере без DATABASE_URL — обычный файл .data/db.json,
//   чтобы проект можно было запустить и проверить без всякой настройки.

import fs from 'node:fs/promises';
import path from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

let implPromise = null;

export function getDb() {
  if (!implPromise) {
    implPromise = (DATABASE_URL ? postgresDb() : fileDb()).catch((err) => {
      implPromise = null; // при следующем запросе попробуем снова
      throw err;
    });
  }
  return implPromise;
}

// ---------------------------------------------------------------------------
// Postgres (Neon)
// ---------------------------------------------------------------------------
async function postgresDb() {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);

  // Таблицы создаются автоматически при первом запуске.
  try {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      pass_hash TEXT,
      tg_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    // Отзывы игроков разработчику.
    await sql`CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      lang TEXT, platform TEXT, ua TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    // Ошибки в приложении — без личных данных, одинаковые склеиваются.
    await sql`CREATE TABLE IF NOT EXISTS client_errors (
      hash TEXT PRIMARY KEY,
      message TEXT NOT NULL, source TEXT, ua TEXT,
      count INTEGER NOT NULL DEFAULT 1,
      first_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      notified_at TIMESTAMPTZ
    )`;
    // Служебные значения (например, когда отправлялся последний отчёт).
    await sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`;
    // Напоминания бота: до какого времени (мс) они выключены. 0 — включены.
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS remind_off BIGINT NOT NULL DEFAULT 0`;
  } catch (err) {
    // Если две функции одновременно создавали таблицы, одна может получить
    // ошибку «уже существует» — это не страшно.
    if (!/already exists|duplicate key/i.test(String(err.message))) throw err;
  }

  const one = (rows) => rows[0] || null;

  return {
    async createUser({ email = null, name = '', passHash = null, tgId = null }) {
      return one(await sql`
        INSERT INTO users (email, name, pass_hash, tg_id)
        VALUES (${email}, ${name}, ${passHash}, ${tgId})
        RETURNING id, email, name, tg_id, pass_hash, remind_off`);
    },
    async getUserByEmail(email) {
      return one(await sql`SELECT id, email, name, tg_id, pass_hash, remind_off FROM users WHERE email = ${email}`);
    },
    async getUserById(id) {
      return one(await sql`SELECT id, email, name, tg_id, pass_hash, remind_off FROM users WHERE id = ${id}`);
    },
    async getUserByTg(tgId) {
      return one(await sql`SELECT id, email, name, tg_id, pass_hash, remind_off FROM users WHERE tg_id = ${tgId}`);
    },
    async setTelegram(userId, tgId) {
      await sql`UPDATE users SET tg_id = ${tgId} WHERE id = ${userId}`;
    },
    async setLogin(userId, email, passHash) {
      await sql`UPDATE users SET email = ${email}, pass_hash = ${passHash} WHERE id = ${userId}`;
    },
    async setRemindOff(userId, untilMs) {
      await sql`UPDATE users SET remind_off = ${untilMs} WHERE id = ${userId}`;
    },
    // Кому слать напоминания: у кого привязан Telegram. Берём их сохранение,
    // чтобы знать язык и когда игрок заходил последний раз.
    async listRemindable() {
      const rows = await sql`SELECT u.id, u.tg_id, u.remind_off, s.data
        FROM users u LEFT JOIN states s ON s.user_id = u.id WHERE u.tg_id IS NOT NULL`;
      return rows.map(r => ({ id: r.id, tgId: r.tg_id, remindOff: Number(r.remind_off) || 0, data: r.data || {} }));
    },
    // --- для статистики, отзывов и ошибок ---
    async listUsersForStats() {
      const rows = await sql`SELECT id, (email IS NOT NULL) AS has_email, (tg_id IS NOT NULL) AS has_tg, created_at FROM users`;
      return rows.map(r => ({ id: r.id, hasEmail: r.has_email, hasTg: r.has_tg, createdAt: new Date(r.created_at).getTime() }));
    },
    async listStates() {
      const rows = await sql`SELECT user_id, data, updated_at FROM states`;
      return rows.map(r => ({ userId: r.user_id, data: r.data, updatedAt: new Date(r.updated_at).getTime() }));
    },
    async listRecentUsers(limit = 15) {
      const rows = await sql`SELECT id, name, email, tg_id, created_at FROM users ORDER BY created_at DESC NULLS LAST, id DESC LIMIT ${limit}`;
      return rows.map(r => ({ id: r.id, name: r.name, email: r.email, tgId: r.tg_id, createdAt: new Date(r.created_at).getTime() }));
    },
    async countUsers() {
      return Number(one(await sql`SELECT count(*)::int AS n FROM users`).n);
    },
    async deleteUser(id) {
      await sql`DELETE FROM users WHERE id = ${id}`;
    },
    async addFeedback({ userId, text, lang, platform, ua }) {
      return one(await sql`INSERT INTO feedback (user_id, text, lang, platform, ua)
        VALUES (${userId}, ${text}, ${lang}, ${platform}, ${ua}) RETURNING id`).id;
    },
    async getFeedback(id) {
      const r = one(await sql`SELECT id, user_id, text, lang, platform, created_at FROM feedback WHERE id = ${id}`);
      return r ? { ...r, createdAt: new Date(r.created_at).getTime() } : null;
    },
    async listFeedback(limit = 5) {
      const rows = await sql`SELECT f.id, f.text, f.platform, f.created_at, u.name FROM feedback f
        LEFT JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT ${limit}`;
      return rows.map(r => ({ ...r, createdAt: new Date(r.created_at).getTime() }));
    },
    async countFeedbackSince(ms) {
      return Number(one(await sql`SELECT count(*)::int AS n FROM feedback WHERE created_at > to_timestamp(${ms / 1000})`).n);
    },
    async upsertError({ hash, message, source, ua }) {
      const r = one(await sql`INSERT INTO client_errors (hash, message, source, ua) VALUES (${hash}, ${message}, ${source}, ${ua})
        ON CONFLICT (hash) DO UPDATE SET count = client_errors.count + 1, last_at = now(), ua = EXCLUDED.ua
        RETURNING count, notified_at`);
      return { count: r.count, notifiedAt: r.notified_at ? new Date(r.notified_at).getTime() : 0 };
    },
    async markErrorNotified(hash) {
      await sql`UPDATE client_errors SET notified_at = now() WHERE hash = ${hash}`;
    },
    async listErrors(sinceMs, limit = 10) {
      const rows = await sql`SELECT message, source, ua, count, last_at FROM client_errors
        WHERE last_at > to_timestamp(${sinceMs / 1000}) ORDER BY count DESC LIMIT ${limit}`;
      return rows.map(r => ({ ...r, lastAt: new Date(r.last_at).getTime() }));
    },
    async getMeta(key) {
      return one(await sql`SELECT value FROM meta WHERE key = ${key}`)?.value ?? null;
    },
    async setMeta(key, value) {
      await sql`INSERT INTO meta (key, value) VALUES (${key}, ${String(value)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    },
    async getState(userId) {
      const row = one(await sql`SELECT data, updated_at FROM states WHERE user_id = ${userId}`);
      return row ? { data: row.data, updatedAt: new Date(row.updated_at).getTime() } : null;
    },
    async saveState(userId, data) {
      const row = one(await sql`
        INSERT INTO states (user_id, data, updated_at)
        VALUES (${userId}, ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
        RETURNING updated_at`);
      return new Date(row.updated_at).getTime();
    },
  };
}

// ---------------------------------------------------------------------------
// Файл на диске (только для локального запуска)
// ---------------------------------------------------------------------------
async function fileDb() {
  if (process.env.VERCEL) {
    throw new Error(
      'База данных не подключена. В Vercel откройте Storage → Create Database → Neon ' +
      'и подключите её к проекту, затем сделайте Redeploy. / Database is not connected: ' +
      'in Vercel open Storage → Create Database → Neon, connect it and redeploy.'
    );
  }
  const file = path.join(process.cwd(), '.data', 'db.json');
  let db = { nextId: 1, users: [], states: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch { /* файла ещё нет */ }
  db.feedback = db.feedback || [];
  db.errors = db.errors || {};
  db.meta = db.meta || {};

  let writing = Promise.resolve();
  const persist = () => {
    writing = writing.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(db, null, 2));
    });
    return writing;
  };
  const copy = (u) => (u ? { ...u } : null);

  return {
    async createUser({ email = null, name = '', passHash = null, tgId = null }) {
      if (email && db.users.some(u => u.email === email)) {
        const e = new Error('duplicate key'); e.code = '23505'; throw e;
      }
      const user = { id: db.nextId++, email, name, pass_hash: passHash, tg_id: tgId, created_at: Date.now(), remind_off: 0 };
      db.users.push(user);
      await persist();
      return copy(user);
    },
    async getUserByEmail(email) { return copy(db.users.find(u => u.email === email)); },
    async getUserById(id) { return copy(db.users.find(u => u.id === Number(id))); },
    async getUserByTg(tgId) { return copy(db.users.find(u => u.tg_id === tgId)); },
    async setTelegram(userId, tgId) {
      const u = db.users.find(x => x.id === Number(userId));
      if (u) { u.tg_id = tgId; await persist(); }
    },
    async setLogin(userId, email, passHash) {
      if (db.users.some(u => u.email === email && u.id !== Number(userId))) {
        const e = new Error('duplicate key'); e.code = '23505'; throw e;
      }
      const u = db.users.find(x => x.id === Number(userId));
      if (u) { u.email = email; u.pass_hash = passHash; await persist(); }
    },
    async setRemindOff(userId, untilMs) {
      const u = db.users.find(x => x.id === Number(userId));
      if (u) { u.remind_off = untilMs; await persist(); }
    },
    async listRemindable() {
      return db.users.filter(u => u.tg_id).map(u => ({
        id: u.id, tgId: u.tg_id, remindOff: Number(u.remind_off) || 0, data: db.states[u.id]?.data || {},
      }));
    },
    async listUsersForStats() {
      return db.users.map(u => ({ id: u.id, hasEmail: Boolean(u.email), hasTg: Boolean(u.tg_id), createdAt: u.created_at || 0 }));
    },
    async listStates() {
      return Object.entries(db.states).map(([userId, s]) => ({ userId: Number(userId), data: s.data, updatedAt: s.updatedAt }));
    },
    async listRecentUsers(limit = 15) {
      return db.users.slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0) || b.id - a.id).slice(0, limit)
        .map(u => ({ id: u.id, name: u.name, email: u.email, tgId: u.tg_id, createdAt: u.created_at || 0 }));
    },
    async countUsers() { return db.users.length; },
    async deleteUser(id) {
      db.users = db.users.filter(u => u.id !== Number(id));
      delete db.states[id];
      db.feedback = db.feedback.filter(f => f.user_id !== Number(id));
      await persist();
    },
    async addFeedback({ userId, text, lang, platform, ua }) {
      const id = (Number(db.meta.feedback_seq) || db.feedback.reduce((m, f) => Math.max(m, f.id), 0)) + 1;
      db.meta.feedback_seq = String(id);
      db.feedback.push({ id, user_id: userId, text, lang, platform, ua, createdAt: Date.now() });
      await persist();
      return id;
    },
    async getFeedback(id) { return db.feedback.find(f => f.id === Number(id)) || null; },
    async listFeedback(limit = 5) {
      return db.feedback.slice(-limit).reverse().map(f => ({ ...f, name: db.users.find(u => u.id === f.user_id)?.name }));
    },
    async countFeedbackSince(ms) { return db.feedback.filter(f => f.createdAt > ms).length; },
    async upsertError({ hash, message, source, ua }) {
      const e = db.errors[hash] || (db.errors[hash] = { hash, message, source, count: 0, firstAt: Date.now(), notifiedAt: 0 });
      e.count++; e.lastAt = Date.now(); e.ua = ua;
      await persist();
      return { count: e.count, notifiedAt: e.notifiedAt };
    },
    async markErrorNotified(hash) { if (db.errors[hash]) { db.errors[hash].notifiedAt = Date.now(); await persist(); } },
    async listErrors(sinceMs, limit = 10) {
      return Object.values(db.errors).filter(e => e.lastAt > sinceMs).sort((a, b) => b.count - a.count).slice(0, limit);
    },
    async getMeta(key) { return db.meta[key] ?? null; },
    async setMeta(key, value) { db.meta[key] = String(value); await persist(); },
    async getState(userId) { return db.states[userId] || null; },
    async saveState(userId, data) {
      const updatedAt = Date.now();
      db.states[userId] = { data, updatedAt };
      await persist();
      return updatedAt;
    },
  };
}
