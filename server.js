// Локальный сервер для разработки: `npm run dev` или `node server.js`.
// На Vercel этот файл не используется — там всё делает сама платформа.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, '');
    const file = path.join(root, 'api', `${name}.js`);
    try {
      await fs.access(file);
    } catch {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }

  let filePath = path.join(publicDir, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(publicDir)) { res.statusCode = 403; return res.end(); }
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const data = await fs.readFile(filePath);
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Древо жизни запущено: http://localhost:${PORT}`);
  if (!process.env.DATABASE_URL) console.log('База данных: локальный файл .data/db.json');
});
