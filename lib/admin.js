// Сообщения разработчику (администратору) через Telegram-бота игры
// и обезличенная статистика для улучшения приложения.
//
// Администратор задаётся переменной окружения ADMIN_TELEGRAM_ID
// (числовой id в Telegram; узнать его — команда /myid в боте игры).
// Можно указать несколько id через запятую.
//
// В статистику НЕ попадают: почты, имена, тексты заметок, названия своих дел
// и подветвей. Считаются только количества.

import { ACTIONS, BAD_HABITS } from '../public/js/data.js';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';

export function adminIds() {
  return String(process.env.ADMIN_TELEGRAM_ID || '').split(',').map(s => s.trim()).filter(Boolean);
}
export function isAdmin(tgId) {
  return adminIds().includes(String(tgId));
}

export async function tgApi(method, payload, timeoutMs = 4000) {
  if (!TOKEN()) return { ok: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return await res.json();
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// Отправить сообщение всем администраторам. Ошибки не мешают основной работе.
export async function notifyAdmin(text, extra = {}) {
  const ids = adminIds();
  if (!ids.length || !TOKEN()) return;
  await Promise.all(ids.map(id => tgApi('sendMessage', {
    chat_id: id, text: String(text).slice(0, 4000), disable_web_page_preview: true, ...extra,
  })));
}

function appUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'life-and-progress.vercel.app';
  return `https://${host}`;
}

// Часовой пояс по умолчанию, если игрок ещё ни разу не открывал игру после
// обновления и мы не знаем его зону.
const DEFAULT_TZ = 'Europe/Moscow';

// Час (0–23) и дата (ГГГГ-ММ-ДД) в часовом поясе игрока.
function hourInTz(tz, now) {
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now);
    return parseInt(h, 10) % 24;
  } catch { return null; }
}
function dayInTz(tz, now) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch { return null; }
}

// Напоминание зайти в игру. Функция запускается раз в час (расписанием
// GitHub Actions) и шлёт тем, у кого СЕЙЧАС местный час совпал с выбранным,
// кто не отключал напоминания, ещё не получал его сегодня и не заходил сегодня.
export async function sendReminders(db, now = Date.now()) {
  if (!TOKEN()) return { sent: 0, skipped: 0, total: 0 };
  const list = await db.listRemindable();
  const url = appUrl();
  let sent = 0; let skipped = 0;
  for (const u of list) {
    if (u.remindOff > now) { skipped++; continue; }
    const tz = u.tz || DEFAULT_TZ;
    const hour = hourInTz(tz, now);
    const day = dayInTz(tz, now);
    if (hour == null || day == null) { skipped++; continue; }
    // Ещё не наступил выбранный час в его поясе.
    if (hour !== (u.remindHour ?? 20)) { skipped++; continue; }
    // Напоминание за этот местный день уже отправлено.
    if (u.remindSentDay === day) { skipped++; continue; }
    const events = Array.isArray(u.data?.events) ? u.data.events : [];
    const last = events.reduce((m, e) => Math.max(m, e.c || 0, e.t || 0), 0);
    // Уже заходил сегодня (по его поясу) — не беспокоим, но помечаем день.
    if (last && dayInTz(tz, last) === day) { await db.markReminded(u.id, day); skipped++; continue; }
    const en = String(u.data?.lang || '').startsWith('en');
    const r = await tgApi('sendMessage', {
      chat_id: u.tgId,
      text: en
        ? '🌳 Your tree is waiting!\n\nDrop into the game and log at least one good thing you did today — that’s how branches grow and streaks stay lit. 🔥'
        : '🌳 Твоё дерево ждёт!\n\nЗагляни в игру и отметь хотя бы одно доброе дело за сегодня — так растут ветви и не гаснут огоньки. 🔥',
      reply_markup: { inline_keyboard: [[
        { text: en ? '🌳 Open my tree' : '🌳 Открыть дерево', web_app: { url } },
        { text: en ? '🔕 Mute 2 weeks' : '🔕 Не напоминать 2 недели', callback_data: 'snooze' },
      ]] },
    });
    // Помечаем день отправки в любом случае, чтобы не долбить при повторах.
    await db.markReminded(u.id, day);
    if (r && r.ok) sent++; else skipped++;
  }
  return { sent, skipped, total: list.length };
}

export async function notifyNewPlayer(db, user, via) {
  if (!adminIds().length) return;
  let total = '';
  try { total = ` · всего игроков: ${await db.countUsers()}`; } catch { /* не важно */ }
  await notifyAdmin(`🌱 Новый игрок: ${user.name || 'без имени'} (${via})${total}`);
}

// ---------------------------------------------------------------------------
// Статистика
// ---------------------------------------------------------------------------

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const eventTime = (e) => Math.max(e.c || 0, e.t || 0);

export async function computeStats(db, now = Date.now()) {
  const users = await db.listUsersForStats();
  const states = await db.listStates();
  const byUser = new Map(states.map(s => [s.userId, s.data || {}]));

  const total = users.length;
  const new1 = users.filter(u => u.createdAt > now - DAY).length;
  const new7 = users.filter(u => u.createdAt > now - 7 * DAY).length;
  const viaWeb = users.filter(u => u.hasEmail && !u.hasTg).length;
  const viaTg = users.filter(u => u.hasTg && !u.hasEmail).length;
  const viaBoth = users.filter(u => u.hasTg && u.hasEmail).length;

  let dau = 0; let wau = 0; let mau = 0;
  let events7 = 0; let minutes7 = 0;
  const actCount = {}; const badCount = {};
  const adoption = { subs: 0, notes: 0, tracked: 0, customActs: 0, en: 0, tour: 0 };
  const themes = {};
  let withState = 0;

  for (const [, data] of byUser) {
    const events = Array.isArray(data.events) ? data.events : [];
    withState++;
    const last = events.reduce((m, e) => Math.max(m, eventTime(e)), 0);
    if (last > now - DAY) dau++;
    if (last > now - 7 * DAY) wau++;
    if (last > now - 30 * DAY) mau++;
    for (const e of events) {
      if (eventTime(e) < now - 7 * DAY) continue;
      events7++;
      if (e.k === 'act' && ACTIONS.some(a => a.id === e.ref)) actCount[e.ref] = (actCount[e.ref] || 0) + 1;
      if (e.k === 'bad' && BAD_HABITS.some(b => b.id === e.ref)) badCount[e.ref] = (badCount[e.ref] || 0) + 1;
      if (e.k === 'time') minutes7 += Number(e.m) || 0;
    }
    if ((data.custom?.subs || []).some(s => !s.archived)) adoption.subs++;
    if (events.some(e => e.note || e.mood)) adoption.notes++;
    if ((data.tracked || []).length) adoption.tracked++;
    if ((data.custom?.acts || []).length) adoption.customActs++;
    if (data.lang === 'en') adoption.en++;
    if ((data.seenTips || []).includes('core')) adoption.tour++;
    themes[data.theme || 'spring'] = (themes[data.theme || 'spring'] || 0) + 1;
  }

  // Удержание: вернулись ли игроки на следующий день и через неделю.
  const cohort = (minAge, maxAge, after) => {
    const list = users.filter(u => u.createdAt && u.createdAt < now - minAge && u.createdAt > now - maxAge);
    const back = list.filter(u => (byUser.get(u.id)?.events || []).some(e => eventTime(e) > u.createdAt + after)).length;
    return { n: list.length, back };
  };
  const d1 = cohort(2 * DAY, 30 * DAY, 20 * 60 * 60 * 1000);
  const d7 = cohort(8 * DAY, 60 * DAY, 7 * DAY);

  let errors24 = 0;
  try { errors24 = (await db.listErrors(now - DAY, 100)).length; } catch { /* нет таблицы */ }
  let feedback7 = 0;
  try { feedback7 = await db.countFeedbackSince(now - 7 * DAY); } catch { /* нет таблицы */ }

  const top = (counts, list, n = 5) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([id, c]) => `  • ${list.find(x => x.id === id)?.name || id} — ${c}`).join('\n') || '  —';

  return {
    total, new1, new7, dau, wau, mau, events7, minutes7, withState, adoption, themes, d1, d7, errors24, feedback7,
    text: [
      `📊 Древо жизни — статистика`,
      ``,
      `👥 Игроков: ${total} (новых за сутки: ${new1}, за неделю: ${new7})`,
      `   вход: сайт ${viaWeb} · Telegram ${viaTg} · оба ${viaBoth}`,
      `🔥 Активны: за сутки ${dau} · за неделю ${wau} · за месяц ${mau}`,
      `↩️ Вернулись на след. день: ${pct(d1.back, d1.n)}% (из ${d1.n}) · через неделю: ${pct(d7.back, d7.n)}% (из ${d7.n})`,
      `📝 Отметок за неделю: ${events7}${wau ? ` (≈${Math.round(events7 / wau)} на активного)` : ''} · время на подветви: ${Math.round(minutes7 / 60)} ч`,
      ``,
      `🧩 Пользуются функциями (из ${withState}):`,
      `  подветви ${pct(adoption.subs, withState)}% · заметки ${pct(adoption.notes, withState)}% · огоньки ${pct(adoption.tracked, withState)}%`,
      `  свои дела ${pct(adoption.customActs, withState)}% · английский ${pct(adoption.en, withState)}% · прошли обучение ${pct(adoption.tour, withState)}%`,
      `🎨 Стили: ${Object.entries(themes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`,
      ``,
      `⭐ Популярные дела за неделю:`,
      top(actCount, ACTIONS),
      `🥀 Частые срывы за неделю:`,
      top(badCount, BAD_HABITS, 3),
      ``,
      `⚠️ Разных ошибок за сутки: ${errors24} · 💬 отзывов за неделю: ${feedback7}`,
    ].join('\n'),
  };
}
