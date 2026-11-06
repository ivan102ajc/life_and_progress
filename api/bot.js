// Telegram-бот «Древа жизни».
//
// POST /api/bot          — сюда Telegram присылает сообщения боту (webhook).
// GET  /api/bot?setup=1  — один раз открыть в браузере после деплоя:
//                          подключает webhook и кнопку «Открыть» в чате с ботом.
//
// Нужна переменная окружения TELEGRAM_BOT_TOKEN (токен от @BotFather).

import crypto from 'node:crypto';
import { send, readBody, handle } from '../lib/http.js';
import { getDb } from '../lib/db.js';
import { verifyLinkCode } from '../lib/auth.js';
import { linkTelegram, maskEmail } from '../lib/link.js';

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

// Бот отвечает на языке, выставленном у пользователя в Telegram.
const isRu = (from) => /^(ru|uk|be|kk)/i.test(from?.language_code || '');
const L = (from, ru, en) => (isRu(from) ? ru : en);

const WELCOME = (from) => {
  const name = from?.first_name;
  return L(from,
    `Привет${name ? ', ' + name : ''}! 🌱\n\n` +
    'Это «Древо жизни» — игра, в которой твои реальные дела растят дерево.\n\n' +
    '• Полезное дело — ветка растёт и покрывается листьями\n' +
    '• Новый навык — веточка с плодом\n' +
    '• Вредная привычка — листья желтеют\n' +
    '• Делаешь что-то каждый день — горит огонёк 🔥\n\n' +
    'Нажми кнопку ниже, чтобы открыть своё дерево.',
    `Hi${name ? ', ' + name : ''}! 🌱\n\n` +
    'This is Tree of Life — a game where your real-life activities grow a tree.\n\n' +
    '• A useful activity — a branch grows and fills with leaves\n' +
    '• A new skill — a twig with fruit\n' +
    '• A bad habit — leaves turn yellow\n' +
    '• Do something every day — a streak lights up 🔥\n\n' +
    'Tap the button below to open your tree.');
};

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
        menu_button: { type: 'web_app', text: '🌳 Play', web_app: { url } },
      }),
      // Команды и описание: английские — по умолчанию, русские — для русского Telegram.
      commands: await tg('setMyCommands', {
        commands: [
          { command: 'start', description: 'Open Tree of Life' },
          { command: 'help', description: 'How to play' },
        ],
      }),
      commandsRu: await tg('setMyCommands', {
        language_code: 'ru',
        commands: [
          { command: 'start', description: 'Открыть Древо жизни' },
          { command: 'help', description: 'Как играть' },
        ],
      }),
      description: await tg('setMyShortDescription', {
        short_description: 'A self-improvement game: real activities grow your tree 🌳',
      }),
      descriptionRu: await tg('setMyShortDescription', {
        language_code: 'ru',
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
    const from = msg.from;
    const button = { reply_markup: { inline_keyboard: [[{ text: L(from, '🌳 Открыть моё дерево', '🌳 Open my tree'), web_app: { url } }]] } };
    const payload = text.startsWith('/start ') ? text.slice(7).trim() : '';
    if (payload.startsWith('L') && msg.from?.id) {
      // Привязка Telegram к аккаунту с сайта по ссылке из настроек игры.
      const userId = verifyLinkCode(payload);
      const db = await getDb();
      const user = userId ? await db.getUserById(userId) : null;
      let reply;
      if (!user) {
        reply = L(from, 'Ссылка для привязки устарела. Открой настройки игры на сайте и нажми «Привязать Telegram» ещё раз.', 'This link has expired. Open the game settings on the website and press “Link Telegram” again.');
      } else {
        const r = await linkTelegram(db, user, String(msg.from.id));
        if (r.status === 'taken') {
          reply = L(from, `Этот Telegram уже привязан к другому аккаунту (${maskEmail(r.other.email)}). Сначала отвяжи его там в настройках игры.`, `This Telegram is already linked to another account (${maskEmail(r.other.email)}). Unlink it there in the game settings first.`);
        } else {
          reply = L(from,
            `✅ Готово! Telegram привязан к аккаунту «${r.user.name}»` +
            (r.status === 'merged' ? '. Прогресс из Telegram перенесён и сложен с прогрессом с сайта.' : '.') +
            '\n\nТеперь на сайте и в Telegram одно и то же дерево.',
            `✅ Done! Telegram is linked to the account “${r.user.name}”` +
            (r.status === 'merged' ? '. Your Telegram progress was moved and added to your website progress.' : '.') +
            '\n\nNow it’s the same tree on the website and in Telegram.');
        }
      }
      await tg('sendMessage', { chat_id: msg.chat.id, text: reply, ...button });
    } else if (text.startsWith('/start') || text.startsWith('/help')) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: WELCOME(from), ...button });
    } else {
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: L(from, 'Отмечать дела и смотреть на дерево можно в приложении 👇', 'Log activities and see your tree in the app 👇'),
        ...button,
      });
    }
  }
  // Telegram ждёт быстрый ответ 200, иначе будет повторять запрос.
  return send(res, 200, { ok: true });
});
