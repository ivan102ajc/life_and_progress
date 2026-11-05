// Telegram-бот «Древа жизни».
//
// POST /api/bot          — сюда Telegram присылает сообщения боту (webhook).
// GET  /api/bot?setup=1  — один раз открыть в браузере после деплоя:
//                          подключает webhook и кнопку «Открыть» в чате с ботом.
//
// Нужна переменная окружения TELEGRAM_BOT_TOKEN (токен от @BotFather).

import crypto from 'node:crypto';
import { send, readBody, handle } from '../lib/http.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// Секрет, по которому мы узнаём, что запрос пришёл именно от Telegram.
const HOOK_SECRET = crypto.createHash('sha256').update('tol-hook:' + TOKEN).digest('hex').slice(0, 48);

function appUrl(req) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}`;
}

async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

const WELCOME = (name) =>
  `Привет${name ? ', ' + name : ''}! 🌱\n\n` +
  'Это «Древо жизни» — игра, в которой твои реальные дела растят дерево.\n\n' +
  '• Полезное дело — ветка растёт и покрывается листьями\n' +
  '• Новый навык — веточка с плодом\n' +
  '• Вредная привычка — листья желтеют\n' +
  '• Делаешь что-то каждый день — горит огонёк 🔥\n\n' +
  'Нажми кнопку ниже, чтобы открыть своё дерево.';

export default handle(async (req, res) => {
  if (!TOKEN) return send(res, 501, { error: 'Не задана переменная TELEGRAM_BOT_TOKEN' });
  const url = appUrl(req);

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    if (!q.has('setup')) return send(res, 200, { ok: true, hint: 'Откройте /api/bot?setup=1, чтобы подключить бота' });
    const results = {
      webhook: await tg('setWebhook', {
        url: `${url}/api/bot`,
        secret_token: HOOK_SECRET,
        allowed_updates: ['message'],
      }),
      menuButton: await tg('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Открыть', web_app: { url } },
      }),
      commands: await tg('setMyCommands', {
        commands: [
          { command: 'start', description: 'Открыть Древо жизни' },
          { command: 'help', description: 'Как играть' },
        ],
      }),
      description: await tg('setMyShortDescription', {
        short_description: 'Игра для саморазвития: реальные дела растят твоё дерево 🌳',
      }),
    };
    const ok = Object.values(results).every(r => r.ok);
    return send(res, ok ? 200 : 500, { ok, appUrl: url, results });
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Метод не поддерживается' });
  if (req.headers['x-telegram-bot-api-secret-token'] !== HOOK_SECRET) {
    return send(res, 401, { error: 'Неверный секрет' });
  }

  const update = await readBody(req);
  const msg = update.message;
  if (msg?.chat?.id && typeof msg.text === 'string') {
    const text = msg.text.trim();
    const button = { reply_markup: { inline_keyboard: [[{ text: '🌳 Открыть моё дерево', web_app: { url } }]] } };
    if (text.startsWith('/start') || text.startsWith('/help')) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: WELCOME(msg.from?.first_name), ...button });
    } else {
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: 'Отмечать дела и смотреть на дерево можно в приложении 👇',
        ...button,
      });
    }
  }
  // Telegram ждёт быстрый ответ 200, иначе будет повторять запрос.
  return send(res, 200, { ok: true });
});
