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
import { isAdmin, adminIds, computeStats, notifyAdmin, appUrl as siteUrl } from '../lib/admin.js';
import { signResetCode } from '../lib/auth.js';
import { blockedFor, hit } from '../lib/limit.js';

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const fmtDay = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');

// Сколько дней назад была последняя отметка игрока (по журналу событий).
function lastActive(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const last = events.reduce((m, e) => Math.max(m, e.c || 0, e.t || 0), 0);
  if (!last) return 'нет отметок';
  const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  return days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : `${days} дн. назад`;
}

// Команды разработчика. Возвращает текст ответа или null, если это не команда админа.
async function adminCommand(msg, text) {
  const db = await getDb();
  if (/^\/stats\b/.test(text)) return (await computeStats(db)).text;
  if (/^\/errors\b/.test(text)) {
    const list = await db.listErrors(Date.now() - 7 * 24 * 60 * 60 * 1000, 8);
    if (!list.length) return '✅ За неделю ошибок не было.';
    return '⚠️ Частые ошибки за неделю:\n\n' + list.map(e =>
      `×${e.count} · ${e.message}${e.source ? `\n📍 ${e.source}` : ''}\n🕒 последняя ${fmtDate(e.lastAt)} UTC`).join('\n\n');
  }
  if (/^\/users\b/.test(text)) {
    const [list, states] = await Promise.all([db.listRecentUsers(15), db.listStates()]);
    if (!list.length) return 'Пока никто не зарегистрировался.';
    const byUser = new Map(states.map(s => [s.userId, s.data || {}]));
    const total = await db.countUsers();
    const lines = list.map(u => {
      const who = u.email ? maskEmail(u.email) : (u.tgId ? 'Telegram' : '—');
      return `• ${u.name || 'без имени'} · ${who}\n  рег. ${fmtDay(u.createdAt)} · заходил: ${lastActive(byUser.get(u.id))}`;
    });
    return `👥 Игроков всего: ${total}\nПоследние ${list.length}:\n\n${lines.join('\n')}` +
      '\n\nПочта скрыта, пароли и дневники не показываются.';
  }
  if (/^\/feedback\b/.test(text)) {
    const list = await db.listFeedback(8);
    if (!list.length) return 'Отзывов пока нет.';
    return '💬 Последние отзывы:\n\n' + list.map(f =>
      `#${f.id} · ${f.name || 'игрок удалён'} · ${f.platform === 'telegram' ? 'Telegram' : 'сайт'} · ${fmtDate(f.createdAt)}\n${f.text}`).join('\n\n') +
      '\n\nЧтобы ответить игроку — ответь (reply) на уведомление об отзыве.';
  }
  // /reset почта — ссылка для сброса пароля аккаунту без Telegram (через поддержку).
  const rm = text.match(/^\/reset(?:@\w+)?\s+(\S+@\S+)/i);
  if (rm) {
    const user = await db.getUserByEmail(rm[1].trim().toLowerCase());
    if (!user) return 'Аккаунта с такой почтой нет.';
    if (!user.pass_hash) return 'У этого аккаунта нет пароля — в него входят через Telegram.';
    const state = await db.getState(user.id);
    const events = state?.data?.events || [];
    const last = events.reduce((m, e) => Math.max(m, e.c || 0, e.t || 0), 0);
    const link = `${siteUrl()}/?pwreset=${encodeURIComponent(signResetCode(user.id, user.pass_hash))}`;
    return `🔑 Аккаунт «${user.name}»
зарегистрирован: ${user.created_at ? fmtDate(new Date(user.created_at).getTime()) : '—'}
отметок: ${events.length}, последняя: ${last ? fmtDate(last) : '—'} (время UTC)
Telegram: ${user.tg_id ? 'привязан' : 'нет'}

` +
      `⚠️ Сначала убедись, что пишет владелец: спроси имя в игре, когда регистрировался, что отмечал в последние дни.

Ссылка (действует 30 минут, одноразовая):
${link}`;
  }
  if (/^\/reset\b/.test(text)) return 'Напиши так: /reset почта@игрока.ru';

  // Ответ разработчика на уведомление об отзыве уходит игроку.
  const quoted = msg.reply_to_message?.text || '';
  // Ответ на обращение в поддержку уходит тому, кто написал.
  const sm = quoted.match(/Поддержка · tg:(\d+) · (ru|en)/);
  if (sm && !text.startsWith('/')) {
    const en = sm[2] === 'en';
    const r = await tg('sendMessage', {
      chat_id: sm[1],
      text: (en ? '💬 Reply from Tree of Life support:\n\n' : '💬 Ответ поддержки «Древа жизни»:\n\n') + text,
      disable_web_page_preview: true,
    });
    return r.ok ? '✅ Ответ отправлен.' : 'Не получилось отправить: человек, возможно, остановил бота.';
  }
  const m = quoted.match(/Отзыв #(\d+)/);
  if (m && !text.startsWith('/')) {
    const fb = await db.getFeedback(m[1]);
    const player = fb ? await db.getUserById(fb.user_id) : null;
    if (!player) return 'Игрок удалил аккаунт — ответить не получится.';
    if (!player.tg_id) return 'У игрока не привязан Telegram — ответить через бота не получится.';
    const en = (fb.lang || '').startsWith('en');
    const r = await tg('sendMessage', {
      chat_id: player.tg_id,
      text: (en ? '💬 Reply from the Tree of Life developer:\n\n' : '💬 Ответ разработчика «Древа жизни»:\n\n') + text,
    });
    return r.ok ? `✅ Ответ отправлен игроку «${player.name}».` : 'Не получилось отправить: игрок, возможно, остановил бота.';
  }
  return null;
}

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
    'Нажми кнопку ниже, чтобы открыть своё дерево.\n\nЕсли что-то не работает — просто напиши сюда, сообщение получит разработчик.',
    `Hi${name ? ', ' + name : ''}! 🌱\n\n` +
    'This is Tree of Life — a game where your real-life activities grow a tree.\n\n' +
    '• A useful activity — a branch grows and fills with leaves\n' +
    '• A new skill — a twig with fruit\n' +
    '• A bad habit — leaves turn yellow\n' +
    '• Do something every day — a streak lights up 🔥\n\n' +
    'Tap the button below to open your tree.\n\nIf something doesn’t work, just write here — the developer will get your message.');
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
        allowed_updates: ['message', 'callback_query'],
      }),
      menuButton: await tg('setChatMenuButton', {
        menu_button: { type: 'web_app', text: '🌳 Play', web_app: { url } },
      }),
      // Команды и описание: английские — по умолчанию, русские — для русского Telegram.
      commands: await tg('setMyCommands', {
        commands: [
          { command: 'start', description: 'Open Tree of Life' },
          { command: 'help', description: 'How to play' },
          { command: 'support', description: 'Write to support' },
        ],
      }),
      commandsRu: await tg('setMyCommands', {
        language_code: 'ru',
        commands: [
          { command: 'start', description: 'Открыть Древо жизни' },
          { command: 'help', description: 'Как играть' },
          { command: 'support', description: 'Написать в поддержку' },
        ],
      }),
      // Для разработчика — отдельный список команд, его видят только админы.
      adminCommands: adminIds().length ? await Promise.all(adminIds().map(id => tg('setMyCommands', {
        scope: { type: 'chat', chat_id: Number(id) },
        commands: [
          { command: 'stats', description: 'Статистика игры' },
          { command: 'users', description: 'Последние игроки' },
          { command: 'errors', description: 'Частые ошибки' },
          { command: 'feedback', description: 'Последние отзывы' },
          { command: 'reset', description: 'Ссылка сброса пароля: /reset почта' },
          { command: 'start', description: 'Открыть Древо жизни' },
          { command: 'myid', description: 'Мой Telegram id' },
        ],
      }))).then(rs => ({ ok: rs.every(r => r.ok), results: rs })) : { ok: true, skipped: 'ADMIN_TELEGRAM_ID не задан' },
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

  // Нажатие кнопки под напоминанием: «Не напоминать 2 недели».
  const cq = update.callback_query;
  if (cq) {
    if (cq.data === 'snooze' && cq.from?.id) {
      const db = await getDb();
      const user = await db.getUserByTg(String(cq.from.id));
      if (user) await db.setRemindOff(user.id, Date.now() + 14 * 24 * 60 * 60 * 1000);
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: L(cq.from, 'Напоминания выключены на 2 недели 🔕', 'Reminders muted for 2 weeks 🔕'),
        show_alert: true,
      });
      // Убираем кнопку «не напоминать», оставляем кнопку «открыть».
      if (cq.message) {
        await tg('editMessageReplyMarkup', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          reply_markup: { inline_keyboard: [[{ text: L(cq.from, '🌳 Открыть дерево', '🌳 Open my tree'), web_app: { url } }]] },
        });
      }
    } else {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
    }
    return send(res, 200, { ok: true });
  }

  const msg = update.message;
  if (msg?.chat?.id && typeof msg.text === 'string') {
    const text = msg.text.trim();
    const from = msg.from;
    const button = { reply_markup: { inline_keyboard: [[{ text: L(from, '🌳 Открыть моё дерево', '🌳 Open my tree'), web_app: { url } }]] } };
    const payload = text.startsWith('/start ') ? text.slice(7).trim() : '';
    // Команды разработчика работают только в личном чате с ботом: если бота
    // добавят в группу, статистика и отзывы там не появятся.
    const adminReply = msg.chat.type === 'private' && msg.from?.id && isAdmin(msg.from.id) ? await adminCommand(msg, text) : null;
    if (adminReply) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: adminReply.slice(0, 4000), disable_web_page_preview: true });
    } else if (/^\/myid\b/.test(text)) {
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: L(from, `Твой Telegram id: ${msg.from?.id}`, `Your Telegram id: ${msg.from?.id}`),
      });
    } else if (payload.startsWith('L') && msg.from?.id) {
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
    } else if (/^\/support\b/.test(text) || payload === 'support') {
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: L(from,
          '🆘 Поддержка «Древа жизни»\n\nНапиши сюда одним сообщением, что случилось, — я передам разработчику, а ответ придёт в этот чат.\n\nЕсли не можешь войти по почте: укажи почту аккаунта, имя в игре и примерно когда регистрировался и что отмечал — так разработчик убедится, что аккаунт твой.',
          '🆘 Tree of Life support\n\nWrite what happened in one message here — I’ll pass it to the developer, and the reply will come to this chat.\n\nIf you can’t log in with email: include the account email, your in-game name, roughly when you signed up and what you logged — so the developer can confirm the account is yours.'),
      });
    } else if (text.startsWith('/start') || text.startsWith('/help')) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: WELCOME(from), ...button });
    } else if (msg.chat.type === 'private' && text && !text.startsWith('/') && msg.from?.id && !isAdmin(msg.from.id)) {
      // Обычное сообщение боту — обращение в поддержку: передаём разработчику.
      const db = await getDb();
      const tgId = String(msg.from.id);
      let reply;
      if (!adminIds().length) {
        reply = L(from, 'Поддержка пока не подключена. Попробуй позже.', 'Support isn’t set up yet. Please try later.');
      } else if (await blockedFor(db, 'support', tgId, 6)) {
        reply = L(from, 'Ты уже отправил несколько сообщений — разработчик их получил. Подожди ответа, пожалуйста.', 'You’ve sent several messages already — the developer has them. Please wait for a reply.');
      } else {
        await hit(db, 'support', tgId, 60 * 60 * 1000);
        const account = await db.getUserByTg(tgId);
        const who = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') + (msg.from.username ? ` @${msg.from.username}` : '');
        await notifyAdmin(
          `🆘 Поддержка · tg:${tgId} · ${String(from?.language_code || '').startsWith('en') ? 'en' : 'ru'}\nОт: ${who || 'без имени'} · аккаунт: ${account ? `«${account.name}»${account.email ? ' ' + maskEmail(account.email) : ''}` : 'Telegram не привязан'}\n\n${text.slice(0, 3000)}\n\n↩️ Ответь на это сообщение — ответ уйдёт человеку. Для сброса пароля: /reset почта`,
        );
        reply = L(from, '✅ Передал разработчику. Ответ придёт сюда, в этот чат.', '✅ Passed to the developer. The reply will come here, to this chat.');
      }
      await tg('sendMessage', { chat_id: msg.chat.id, text: reply, ...button });
    } else if (msg.chat.type === 'private' && text && !text.startsWith('/') && msg.from?.id && isAdmin(msg.from.id)) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: 'Это сообщение никуда не ушло. Чтобы ответить человеку, ответь (reply) на его обращение или отзыв.' });
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
