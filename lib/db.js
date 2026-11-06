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
        RETURNING id, email, name, tg_id, pass_hash`);
    },
    async getUserByEmail(email) {
      return one(await sql`SELECT id, email, name, tg_id, pass_hash FROM users WHERE email = ${email}`);
    },
    async getUserById(id) {
      return one(await sql`SELECT id, email, name, tg_id, pass_hash FROM users WHERE id = ${id}`);
    },
    async getUserByTg(tgId) {
      return one(await sql`SELECT id, email, name, tg_id, pass_hash FROM users WHERE tg_id = ${tgId}`);
    },
    async setTelegram(userId, tgId) {
      await sql`UPDATE users SET tg_id = ${tgId} WHERE id = ${userId}`;
    },
    async setLogin(userId, email, passHash) {
      await sql`UPDATE users SET email = ${email}, pass_hash = ${passHash} WHERE id = ${userId}`;
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
      const user = { id: db.nextId++, email, name, pass_hash: passHash, tg_id: tgId };
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
    async getState(userId) { return db.states[userId] || null; },
    async saveState(userId, data) {
      const updatedAt = Date.now();
      db.states[userId] = { data, updatedAt };
      await persist();
      return updatedAt;
    },
  };
}
