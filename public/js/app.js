// Интерфейс игры: экраны, кнопки, сохранение.

import { SPHERES, SPHERE_BY_ID, SKILLS, SKILL_BY_ID, MATERIALS, RULES } from './data.js';
import {
  newSave, normalizeSave, compute, uid, allActions, allBadHabits, findAction, findBad,
  findMaterial, countOnDay, skillStatus, dependentSkills, dayKey,
  findSub, subsOf, SUB_RULES, linkedAction, guessAction,
  STREAK_MILESTONES, nextMilestone,
} from './game.js';
import { THEMES, THEME_BY_ID, applyTheme } from './themes.js';
import { renderTree, renderBranch, subColor } from './tree.js';
import { T, name as nm, plural, locale, setLang, getLang, detectLang, formatMinutes, LANGS } from './i18n.js';
import { api, auth } from './api.js';
import { mergeSaves, sameSave } from './sync.js';
import { planTour, runTour, tourActive, tourBack } from './tour.js';
import { installErrorReporting } from './report.js';

installErrorReporting();

const DAY = 24 * 60 * 60 * 1000;
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  user: null,
  save: null,
  state: null,
  tab: 'tree',
  selected: null,
  logDay: 0,            // 0 — сегодня, 1 — вчера
  filter: 'all',
  skillSphere: 'health',
  matSphere: 'all',
  sync: 'saved',
  authMode: 'register',
  zoom: null,           // id ветви, к которой приблизились
  subPeriod: 'week',    // период сравнения подветвей: week | month | all
  histMode: 'all',      // История: all — все отметки, diary — только заметки
  diaryQuery: '',
  diarySphere: 'all',
};

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

// ---------------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------------

async function start() {
  window.__appStarted = true; // загрузчик в index.html больше не покажет экран ошибки
  applyTheme(THEME_BY_ID.spring);
  bindEvents();

  const tg = await initTelegram();
  setLang(detectLang(tg?.initDataUnsafe?.user?.language_code));
  applyStaticTexts();
  if (tg?.initData) {
    try {
      const res = await api.telegram(tg.initData);
      auth.token = res.token;
      if (res.notice) setTimeout(() => toast(res.notice, 'info'), 800);
    } catch (err) {
      if (err.status !== 501) console.warn('Telegram:', err.message);
    }
  }

  if (auth.token) {
    await loadGame();
  } else {
    showAuth();
  }
}

async function initTelegram() {
  // Telegram передаёт данные запуска в адресе страницы (#tgWebAppData=...).
  if (!location.hash.includes('tgWebAppData')) return null;
  await new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
  const wa = window.Telegram?.WebApp;
  if (!wa) return null;
  wa.ready();
  wa.expand();
  try { wa.disableVerticalSwipes?.(); } catch { /* старая версия Telegram */ }
  wa.BackButton?.onClick(onTelegramBack);
  document.documentElement.classList.add('in-telegram');
  TG.wa = wa;
  return wa;
}

// --- Telegram: цвета шапки, кнопка «Назад», вибрация ---
const TG = { wa: null };

function haptic(kind) {
  const h = TG.wa?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') h.notificationOccurred(kind);
    else h.impactOccurred(kind || 'light');
  } catch { /* не поддерживается */ }
}

function syncTelegram() {
  const wa = TG.wa;
  if (!wa) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  try { wa.setHeaderColor?.(bg); wa.setBackgroundColor?.(bg); wa.setBottomBarColor?.(bg); } catch { /* старая версия */ }
  const needBack = tourActive() || !$('#sheet').hidden || (ui.save && (ui.tab !== 'tree' || ui.zoom));
  try { needBack ? wa.BackButton?.show() : wa.BackButton?.hide(); } catch { /* старая версия */ }
}

function onTelegramBack() {
  if (tourActive()) { tourBack(); syncTelegram(); return; }
  if (!$('#sheet').hidden) {
    closeSheet();
    if (ui.selected) { ui.selected = null; render(); }
  } else if (ui.zoom) {
    zoomOut();
  } else if (ui.tab !== 'tree') {
    ui.tab = 'tree';
    render();
  }
  syncTelegram();
}

async function loadGame() {
  showScreen('loading');
  try {
    const res = await api.load();
    ui.user = res.user;
    const cached = readLocal(res.user.id);
    // Складываем версию с сервера и несохранённую версию с этого устройства.
    const server = res.data ? normalizeSave(res.data, res.user.name) : null;
    const local = cached?.save ? normalizeSave(cached.save, res.user.name) : null;
    ui.save = normalizeSave(mergeSaves(server, local), res.user.name);
    // Язык хранится в аккаунте: выбранный на одном устройстве — и на другом.
    if (ui.save.lang && ui.save.lang !== getLang()) { setLang(ui.save.lang); applyStaticTexts(); }
    if (!ui.save.lang) ui.save.lang = getLang();
    if (!server || !sameSave(server, ui.save)) queueSync();
    showScreen('game');
    render();
    maybeStartTour();
  } catch (err) {
    if (err.status === 401) {
      auth.token = null;
      showAuth();
    } else {
      showScreen('error', err.message);
    }
  }
}

function showScreen(name, message) {
  $('#auth').hidden = name !== 'auth';
  if (name !== 'auth') $('#auth').innerHTML = '';
  $('#game').hidden = name !== 'game';
  $('#loading').hidden = name !== 'loading' && name !== 'error';
  if (name === 'loading') $('#loading').innerHTML = `<div class="loader-seed"></div><p>${T('Поливаем дерево…', 'Watering the tree…')}</p>`;
  if (name === 'error') {
    $('#loading').innerHTML = `<p class="error-text">${esc(message)}</p><button class="btn" data-action="retry">${T('Попробовать снова', 'Try again')}</button>`;
  }
}

// ---------------------------------------------------------------------------
// Язык
// ---------------------------------------------------------------------------

function langSwitch(cls = '') {
  return `<div class="segmented small lang-switch ${cls}" role="group" aria-label="${T('Язык', 'Language')}">
    ${LANGS.map(l => `<button aria-selected="${getLang() === l.id}" data-action="set-lang" data-lang="${l.id}">${l.name}</button>`).join('')}
  </div>`;
}

// Тексты, которые лежат прямо в index.html (вкладки, заголовок страницы).
function applyStaticTexts() {
  document.title = T('Древо жизни', 'Tree of Life');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', T('Игра для саморазвития: реальные полезные дела растят твоё дерево, а вредные привычки заставляют листья желтеть.', 'A self-improvement game: real useful activities grow your tree, bad habits turn its leaves yellow.'));
  const tabs = { tree: T('Дерево', 'Tree'), log: T('Отметить', 'Log'), skills: T('Навыки', 'Skills'), materials: T('Материалы', 'Resources'), history: T('История', 'History') };
  for (const [tab, label] of Object.entries(tabs)) {
    const span = document.querySelector(`#tabs [data-tab="${tab}"] span`);
    if (span) span.textContent = label;
  }
  $('#tabs')?.setAttribute('aria-label', T('Разделы', 'Sections'));
  document.querySelector('.scene-wrap')?.setAttribute('aria-label', T('Дерево', 'Tree'));
}

// ---------------------------------------------------------------------------
// Вход и регистрация
// ---------------------------------------------------------------------------

function showAuth() {
  showScreen('auth');
  renderAuth();
}

function renderAuth(error = '') {
  const reg = ui.authMode === 'register';
  const demo = { player: { level: 6 }, stage: { name: '' }, spheres: {} };
  for (const s of SPHERES) {
    const lv = { health: 5, mind: 6, career: 3, finance: 2, social: 4, creative: 3, soul: 4, home: 0 }[s.id];
    demo.spheres[s.id] = {
      started: lv > 0, level: lv, progress: .5, health: s.id === 'soul' ? 35 : 100,
      unlocked: (SKILLS[s.id] || []).slice(0, Math.min(3, Math.floor(lv / 2))).map(k => k.id),
    };
  }
  $('#auth').innerHTML = `
    <div class="auth-art">${renderTree(demo, THEME_BY_ID.spring, { reduceMotion })}</div>
    <div class="auth-card">
      <div class="auth-top">
        <h1 class="logo">${T('Древо жизни', 'Tree of Life')}</h1>
        ${langSwitch('lang-auth')}
      </div>
      <p class="auth-lead">${T('Каждое полезное дело в жизни растит ветвь твоего дерева. Вредные привычки заставляют листья желтеть. Прогресс, который видно.', 'Every useful thing you do in real life grows a branch of your tree. Bad habits turn the leaves yellow. Progress you can actually see.')}</p>
      <div class="segmented" role="tablist">
        <button role="tab" aria-selected="${reg}" data-action="auth-mode" data-mode="register">${T('Новый игрок', 'New player')}</button>
        <button role="tab" aria-selected="${!reg}" data-action="auth-mode" data-mode="login">${T('Уже играю', 'I have an account')}</button>
      </div>
      <form id="auth-form" novalidate>
        ${reg ? `<label class="field"><span>${T('Как тебя зовут', 'Your name')}</span><input name="name" autocomplete="nickname" maxlength="40" placeholder="${T('Иван', 'Alex')}"></label>` : ''}
        <label class="field"><span>${T('Почта', 'Email')}</span><input name="email" type="email" autocomplete="email" required placeholder="${T('you@mail.ru', 'you@example.com')}"></label>
        <label class="field"><span>${T('Пароль', 'Password')}</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6" placeholder="${T('Не короче 6 символов', 'At least 6 characters')}"></label>
        <p class="form-error" role="alert">${esc(error)}</p>
        <button class="btn btn-primary btn-wide" type="submit">${reg ? T('Посадить своё дерево', 'Plant my tree') : T('Войти', 'Log in')}</button>
        ${reg ? `<p class="small muted consent">${T('Регистрируясь, ты соглашаешься с', 'By signing up you agree to the')} <a href="/privacy.html${T('', '?lang=en')}" target="_blank" rel="noopener">${T('политикой конфиденциальности', 'privacy policy')}</a>.</p>` : ''}
      </form>
    </div>`;
}

async function submitAuth(form) {
  const fd = new FormData(form);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const name = String(fd.get('name') || '').trim();
  if (!email || !password) return renderAuth(T('Заполните почту и пароль', 'Enter your email and password'));
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = T('Секунду…', 'One moment…');
  try {
    const res = ui.authMode === 'register'
      ? await api.register(email, password, name)
      : await api.login(email, password);
    auth.token = res.token;
    if (TG.wa?.initData) {
      try { auth.token = (await api.telegram(TG.wa.initData)).token; } catch { /* привязка не обязательна */ }
    }
    await loadGame();
  } catch (err) {
    renderAuth(err.message);
    const f = $('#auth-form');
    f.email.value = email;
  }
}

// ---------------------------------------------------------------------------
// Сохранение: сначала на устройстве, затем на сервер
// ---------------------------------------------------------------------------

function readLocal(userId) {
  try { return JSON.parse(localStorage.getItem('tol_save_' + userId) || 'null'); } catch { return null; }
}
function writeLocal() {
  try {
    localStorage.setItem('tol_save_' + ui.user.id, JSON.stringify({ save: ui.save, savedAt: Date.now() }));
  } catch { /* нет места или приватный режим */ }
}

let syncTimer = null;
let retryTimer = null;
function queueSync() {
  clearTimeout(syncTimer);
  setSync('pending');
  syncTimer = setTimeout(syncNow, 700);
}
async function syncNow() {
  clearTimeout(retryTimer);
  try {
    const res = await api.save(ui.save);
    // Сервер вернул общую версию — с изменениями с других устройств.
    if (res.data && ui.save) {
      const merged = normalizeSave(mergeSaves(res.data, ui.save), ui.user.name);
      if (!sameSave(merged, ui.save)) {
        ui.save = merged;
        writeLocal();
        if ($('#sheet').hidden && !tourActive()) render();
      }
      // За время запроса игрок мог отметить что-то ещё — отправим и это.
      if (!sameSave(ui.save, normalizeSave(res.data, ui.user.name))) { queueSync(); return; }
    }
    setSync('saved');
  } catch (err) {
    if (err.status === 401) { auth.token = null; showAuth(); return; }
    setSync('offline', err.message);
    retryTimer = setTimeout(syncNow, 15000);
  }
}
function setSync(status, msg = '') {
  ui.sync = status;
  const el = $('#sync');
  if (!el) return;
  el.dataset.status = status;
  el.title = { saved: T('Прогресс сохранён', 'Progress saved'), pending: T('Сохраняем…', 'Saving…'), offline: T('Не удалось сохранить: ', 'Could not save: ') + msg }[status];
  el.querySelector('span').textContent = { saved: T('Сохранено', 'Saved'), pending: T('Сохраняем', 'Saving'), offline: T('Нет связи', 'Offline') }[status];
}

function commit() {
  ui.save.changedAt = Date.now();
  writeLocal();
  queueSync();
  render();
}

// ---------------------------------------------------------------------------
// Действия игрока
// ---------------------------------------------------------------------------

function eventTime() {
  return ui.logDay === 1 ? Date.now() - DAY : Date.now();
}

function addEvent(k, ref, t = eventTime(), extra = {}) {
  const before = ui.state;
  const e = { id: uid(), t, k, ref, c: Date.now(), ...extra };
  ui.save.events.push(e);
  const after = compute(ui.save);
  reportChange(before, after, e);
  if (after.effects[e.id]?.valid) {
    const info = eventInfo(e);
    showSnack(`${info.icon} ${info.title}`, T('Добавить заметку', 'Add a note'), () => openNote(e.id));
  }
  haptic(k === 'bad' ? 'warning' : after.player.level > before.player.level || after.effects[e.id]?.streak ? 'success' : 'light');
  commit();
  if (!reduceMotion) {
    const sphere = Object.keys(after.effects[e.id]?.gains || {})[0];
    if (sphere) requestAnimationFrame(() => pulse(sphere));
  }
}

function removeEvent(id) {
  hideSnack();
  const before = ui.state;
  ui.save.events = ui.save.events.filter(e => e.id !== id);
  ui.save.deleted = [...ui.save.deleted, id];
  const after = compute(ui.save);
  commit();
  if (after.player.level < before.player.level) toast(T(`Общий уровень откатился до ${after.player.level}`, `Overall level dropped back to ${after.player.level}`), 'info');
  else toast(T('Отметка отменена — дерево пересчитано', 'Entry undone — the tree was recalculated'), 'info');
}

function reportChange(before, after, e) {
  const eff = after.effects[e.id];
  if (!eff || !eff.valid) { toast(T('Это не засчиталось', 'That didn’t count'), 'info'); return; }
  for (const [sid, xp] of Object.entries(eff.gains)) {
    const sp = SPHERE_BY_ID[sid];
    const sub = eff.sub ? findSub(ui.save, eff.sub) : null;
    const note = eff.repeat ? T(' (повтор за день — опыта меньше)', ' (repeat today — less XP)')
      : eff.over ? T(` (больше ${SUB_RULES.dailyFullMinutes / 60} ч за день — опыт медленнее)`, ` (over ${SUB_RULES.dailyFullMinutes / 60} h today — slower XP)`) : '';
    const where = sub ? `${sp.icon} ${sub.name}${eff.minutes ? ', ' + formatMinutes(eff.minutes) : ''}` : `${sp.icon} ${nm(sp)}`;
    toast(T(`+${xp} опыта: ${where}${note}`, `+${xp} XP: ${where}${note}`), 'good');
    const lb = before.spheres[sid].level; const la = after.spheres[sid].level;
    if (la > lb) toast(T(`Ветвь «${nm(sp)}» выросла до уровня ${la}`, `The ${nm(sp)} branch grew to level ${la}`), 'level');
  }
  if (eff.act) {
    toast(T(`✓ Засчитано дело «${nm(findAction(ui.save, eff.act))}»`, `✓ Counted as “${nm(findAction(ui.save, eff.act))}”`), 'info');
  }
  const losses = Object.entries(eff.losses);
  if (losses.length) {
    toast(T('Листья желтеют: ', 'Leaves are turning yellow: ') + losses.map(([sid, v]) => `${nm(SPHERE_BY_ID[sid])} −${v}`).join(', '), 'bad');
  }
  if (eff.streak) {
    const label = e.k === 'time' ? findSub(ui.save, e.ref)?.name : nm(findAction(ui.save, e.ref));
    toast(T(`🔥 ${eff.streak.days} ${daysWord(eff.streak.days)} подряд: «${label}». Бонус +${eff.streak.bonus}`, `🔥 ${eff.streak.days} ${daysWord(eff.streak.days)} in a row: “${label}”. Bonus +${eff.streak.bonus}`), 'level');
  } else if (e.k === 'act') {
    const k = after.streaks[e.ref];
    if (k && k.days >= 2 && after.effects[e.id]?.repeat === 0) toast(T(`🔥 Огонёк: ${k.days} ${daysWord(k.days)} подряд`, `🔥 Streak: ${k.days} ${daysWord(k.days)} in a row`), 'info');
  }
  if (after.player.level > before.player.level) toast(T(`Общий уровень ${after.player.level}!`, `Overall level ${after.player.level}!`), 'level');
  if (after.stage.name !== before.stage.name && after.player.level > before.player.level) {
    toast(T(`Новая стадия: ${nm(after.stage)}`, `New stage: ${nm(after.stage)}`), 'level');
  }
}

function pulse(sphereId) {
  const el = document.querySelector(`#tree .branch[data-sphere="${sphereId}"]`);
  if (!el) return;
  el.classList.remove('is-pulsing');
  void el.getBoundingClientRect();
  el.classList.add('is-pulsing');
}

// ---------------------------------------------------------------------------
// Отрисовка
// ---------------------------------------------------------------------------

const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 1.8 1 3 2.5 3.5C11 9 11 5.5 12 2z"/></svg>';

function flameChip(st, actionId) {
  const k = st.streaks[actionId];
  if (!k || !k.days) return '';
  const title = k.status === 'lit' ? T('дней подряд', 'days in a row') : T('дней подряд — продли сегодня', 'days in a row — keep it going today');
  return `<span class="flame-chip is-${k.status}" title="${k.days} ${title}">${FLAME}${k.days}</span>`;
}

function daysWord(n) {
  return plural(n, ['день', 'дня', 'дней'], ['day', 'days']);
}

function streaksBlock(st) {
  const ids = new Set(ui.save.tracked);
  for (const [id, k] of Object.entries(st.streaks)) if (k.days >= 2) ids.add(id);
  const items = [...ids].map(id => ({ a: findAction(ui.save, id), k: st.streaks[id] || { days: 0, best: 0, status: 'out' } }))
    .filter(x => x.a && !x.a.archived)
    .sort((x, y) => (y.k.days - x.k.days) || nm(x.a).localeCompare(nm(y.a)));

  const cards = items.map(({ a, k }) => {
    const sp = SPHERE_BY_ID[a.sphere];
    const pinned = ui.save.tracked.includes(a.id);
    const next = nextMilestone(k.days);
    let status;
    if (k.status === 'lit') status = T('Горит: сегодня уже сделано', 'Lit: done today');
    else if (k.status === 'risk') status = T('Сделай сегодня, иначе огонёк погаснет', 'Do it today or the streak goes out');
    else status = k.best ? T(`Погас. Рекорд: ${k.best} ${daysWord(k.best)}`, `Out. Best: ${k.best} ${daysWord(k.best)}`) : T('Ещё не зажжён — начни сегодня', 'Not lit yet — start today');
    const goal = next ? `<small class="muted">${T(`До бонуса +${STREAK_MILESTONES[next]}: ещё ${next - k.days} ${daysWord(next - k.days)}`, `Bonus +${STREAK_MILESTONES[next]} in ${next - k.days} ${daysWord(next - k.days)}`)}</small>` : '';
    const btn = k.status === 'lit'
      ? `<span class="tr-done">✓ ${T('Сегодня', 'Today')}</span>`
      : `<button class="btn btn-small btn-primary" data-action="log-act" data-id="${a.id}" data-today="1">${T('Сделал сегодня', 'Done today')}</button>`;
    return `
      <div class="tracker is-${k.status}" style="--c:${sp.color}">
        <div class="tr-flame">${FLAME}<b>${k.days}</b></div>
        <div class="tr-body">
          <strong>${sp.icon} ${esc(nm(a))}</strong>
          <small>${status}</small>
          ${goal}
        </div>
        <div class="tr-side">
          ${btn}
          ${pinned ? `<button class="tr-unpin" data-action="untrack" data-id="${a.id}" aria-label="${T('Не следить за огоньком', 'Stop tracking this streak')}">${T('Убрать', 'Remove')}</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `<section id="streaks-block" class="streaks-block">
    <div class="panel-head">
      <h2>${T('Огоньки', 'Streaks')}</h2>
      <p class="muted">${T('Делай одно и то же дело несколько дней подряд — загорится огонёк. На 3, 7, 14, 30, 60 и 100 день — бонус опыта. Пропустил день — огонёк гаснет.', 'Do the same thing several days in a row and a streak lights up. Day 3, 7, 14, 30, 60 and 100 give bonus XP. Miss a day and it goes out.')}</p>
    </div>
    ${cards ? `<div class="tracker-list">${cards}</div>` : ''}
    <button class="btn btn-ghost btn-wide" data-action="add-tracker">${T('Следить за огоньком', 'Track a streak')}</button>
  </section>`;
}

function render() {
  const theme = THEME_BY_ID[ui.save.theme] || THEME_BY_ID.spring;
  applyTheme(theme);
  ui.state = compute(ui.save);
  const st = ui.state;

  if (ui.zoom && ui.tab !== 'tree') ui.zoom = null;
  $('#game').dataset.tab = ui.tab;
  $('#game').classList.toggle('is-zoomed', Boolean(ui.zoom));
  renderTopbar(st);
  const tree = $('#tree');
  const html = ui.zoom
    ? renderBranch(st, theme, ui.zoom, {
      reduceMotion: reduceMotion || tree.dataset.view === 'branch:' + ui.zoom,
      neglectDays: SUB_RULES.neglectDays,
      labelScale: (tree.clientWidth || window.innerWidth) < 520 ? 1.45 : 1,
    })
    : renderTree(st, theme, { selected: ui.selected, reduceMotion });
  tree.innerHTML = html;
  tree.dataset.view = ui.zoom ? 'branch:' + ui.zoom : 'tree';
  $('#scene-caption').innerHTML = sceneCaption(st);
  for (const b of document.querySelectorAll('#tabs [data-tab]')) {
    b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
  }
  const panel = $('#panel');
  panel.innerHTML = ui.zoom ? panelBranch(st) : {
    tree: panelTree, log: panelLog, skills: panelSkills, materials: panelMaterials, history: panelHistory,
  }[ui.tab](st);
  syncTelegram();
}

function renderTopbar(st) {
  const p = st.player;
  $('#topbar').innerHTML = `
    <div class="tb-stage">
      <div class="tb-level" style="--p:${Math.round(p.progress * 100)}" aria-label="${T('Уровень', 'Level')} ${p.level}">${p.level}</div>
      <div class="tb-text">
        <strong>${esc(nm(st.stage))}</strong>
        <span>${T(`${p.into} / ${p.need} опыта до уровня ${p.level + 1}`, `${p.into} / ${p.need} XP to level ${p.level + 1}`)}</span>
      </div>
    </div>
    <div class="tb-right">
      <button class="streak${st.streak ? '' : ' is-zero'}" data-action="tab" data-tab="log" title="${T('Дней подряд с полезными делами. Нажми, чтобы открыть огоньки', 'Days in a row with something useful. Tap to open streaks')}">
        ${FLAME}
        <span>${st.streak}</span>
      </button>
      <div id="sync" class="sync" data-status="${ui.sync}"><i></i><span></span></div>
      <button class="icon-btn" data-action="settings" aria-label="${T('Настройки и стиль', 'Settings and style')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
      </button>
    </div>`;
  setSync(ui.sync);
}

function sceneCaption(st) {
  if (ui.zoom) {
    const sp = SPHERE_BY_ID[ui.zoom];
    return `<div class="zoom-bar">
      <button class="caption-chip" data-action="zoom-out">← ${T('Всё дерево', 'Whole tree')}</button>
      <span class="caption-text">${sp.icon} ${T(`${nm(sp)} крупным планом. Нажми на подветвь, чтобы отметить время.`, `${nm(sp)} close up. Tap a sub-branch to log time.`)}</span>
    </div>`;
  }
  if (ui.selected) {
    const sp = SPHERE_BY_ID[ui.selected];
    const s = st.spheres[ui.selected];
    return `<button class="caption-chip" data-action="open-sphere" data-sphere="${sp.id}">${sp.icon} ${nm(sp)}: ${s.started ? T(`уровень ${s.level}, сила ${s.health}%`, `level ${s.level}, vitality ${s.health}%`) : T('ещё почка', 'still a bud')}</button>`;
  }
  const next = st.stage.next;
  return `<p class="caption-text">${next ? T(`До стадии «${nm(next)}» — общий уровень ${next.level}`, `Next stage “${nm(next)}” at overall level ${next.level}`) : T('Высшая стадия достигнута', 'Highest stage reached')}. ${T('Нажми на ветку, чтобы рассмотреть её.', 'Tap a branch to take a closer look.')}</p>`;
}

function healthWord(h) {
  if (h >= 85) return T('цветёт', 'blooming');
  if (h >= 60) return T('в порядке', 'doing fine');
  if (h >= 35) return T('желтеет', 'turning yellow');
  return T('сохнет', 'drying out');
}

// --- Вкладка «Дерево» ---
function panelTree(st) {
  const started = SPHERES.filter(s => st.spheres[s.id].started).length;
  const intro = st.totalXp === 0 ? `
    <div class="callout">
      <h3>${T('С чего начать', 'Where to start')}</h3>
      <p>${T('Твоё дерево пока росток с восемью почками — по одной на каждую сферу жизни. Открой «Отметить» и отметь что-то полезное, что ты сделал сегодня: почка превратится в ветку.', 'Your tree is a sprout with eight buds — one for each area of life. Open “Log” and mark something useful you did today: a bud will turn into a branch.')}</p>
      <button class="btn btn-primary" data-action="tab" data-tab="log">${T('Отметить первое дело', 'Log your first activity')}</button>
    </div>` : '';
  const rows = SPHERES.map(sp => {
    const s = st.spheres[sp.id];
    const idle = s.started && s.idleDays > RULES.idleGraceDays ? `<span class="warn">${T(`не поливали ${s.idleDays} дн.`, `not watered for ${s.idleDays} d`)}</span>` : '';
    return `
      <button class="sphere-row${ui.selected === sp.id ? ' is-selected' : ''}" data-action="open-sphere" data-sphere="${sp.id}" style="--c:${sp.color}">
        <span class="sr-icon">${sp.icon}</span>
        <span class="sr-main">
          <span class="sr-top"><strong>${nm(sp)}</strong><span class="sr-lvl">${s.started ? T(`ур. ${s.level}`, `lv ${s.level}`) : T('почка', 'bud')}</span></span>
          <span class="bar"><i style="width:${Math.round(s.progress * 100)}%"></i></span>
          <span class="sr-sub">${s.started ? T(`${s.into}/${s.need} опыта · сила ${s.health}%, ${healthWord(s.health)}`, `${s.into}/${s.need} XP · vitality ${s.health}%, ${healthWord(s.health)}`) : T('ещё не начато', 'not started yet')}${s.subList.length ? ` · ${s.subList.length} ${subWord(s.subList.length)}` : ''} ${idle}</span>
        </span>
      </button>`;
  }).join('');
  return `
    ${intro}
    <div class="panel-head">
      <h2>${T('Ветви', 'Branches')}</h2>
      <p class="muted">${T(`${started} из ${SPHERES.length} сфер растут · ${st.totalXp} опыта всего`, `${started} of ${SPHERES.length} areas growing · ${st.totalXp} XP in total`)}</p>
    </div>
    <div class="sphere-list">${rows}</div>
    <details class="rules">
      <summary>${T('Как растёт дерево', 'How the tree grows')}</summary>
      <ul>
        <li>${T('Каждое полезное дело даёт опыт своей ветви. Ветвь становится длиннее, на ней больше листьев.', 'Every useful activity gives XP to its branch. The branch gets longer and grows more leaves.')}</li>
        <li>${T('Повтор одного и того же дела за день даёт меньше опыта: 100%, потом 50%, потом 20%. Так нельзя «нафармить» уровень.', 'Repeating the same activity in one day gives less XP: 100%, then 50%, then 20%. No grinding levels.')}</li>
        <li>${T('Освоенный навык — это новая веточка с плодом и большой бонус опыта.', 'A mastered skill is a new twig with fruit and a big XP bonus.')}</li>
        <li>${T('Вредные привычки отнимают жизненную силу: листья желтеют и опадают, а ветвь растёт медленнее (до половины скорости).', 'Bad habits drain vitality: leaves turn yellow and fall, and the branch grows slower (down to half speed).')}</li>
        <li>${T(`Если ветвь не поливать больше ${RULES.idleGraceDays} дней, она понемногу сохнет. Любое полезное дело лечит её.`, `If a branch isn’t watered for more than ${RULES.idleGraceDays} days, it slowly dries out. Any useful activity heals it.`)}</li>
        <li>${T('Отметил то, чего не было? Любую отметку можно отменить в «Истории» — дерево честно пересчитается.', 'Logged something that didn’t happen? Undo any entry in “History” — the tree recalculates honestly.')}</li>
      </ul>
    </details>`;
}

// --- Вкладка «Отметить» ---
function panelLog(st) {
  const t = eventTime();
  const chips = [{ id: 'all', name: T('Все', 'All'), icon: '' }, ...SPHERES].map(s =>
    `<button class="chip${ui.filter === s.id ? ' is-on' : ''}" data-action="filter" data-sphere="${s.id}">${s.icon ? s.icon + ' ' : ''}${nm(s)}</button>`
  ).join('');
  const acts = allActions(ui.save).filter(a => ui.filter === 'all' || a.sphere === ui.filter);
  const actHtml = acts.map(a => {
    const n = countOnDay(st, a.id, t);
    const f = RULES.repeatFactors[Math.min(n, RULES.repeatFactors.length - 1)];
    const sp = SPHERE_BY_ID[a.sphere];
    return `
      <button class="act${n ? ' is-done' : ''}" data-action="log-act" data-id="${a.id}" style="--c:${sp.color}">
        <span class="act-icon">${sp.icon}</span>
        <span class="act-name">${esc(nm(a))}</span>
        ${flameChip(st, a.id)}
        <span class="act-xp">+${Math.round(a.xp * f)}${n ? `<small>×${n}</small>` : ''}</span>
      </button>`;
  }).join('');

  const bads = allBadHabits(ui.save).map(b => {
    const dmg = Object.entries(b.damage).map(([sid, v]) => `${SPHERE_BY_ID[sid]?.icon || ''}−${v}`).join(' ');
    const clean = st.cleanDays[b.id];
    const cleanText = clean === undefined ? T('ни разу', 'never') : clean === 0 ? T('сегодня', 'today') : T(`${clean} дн. без срыва`, `${clean} d clean`);
    return `
      <button class="act act-bad" data-action="log-bad" data-id="${b.id}">
        <span class="act-name">${esc(nm(b))}</span>
        <span class="act-meta">${cleanText}</span>
        <span class="act-xp">${dmg}</span>
      </button>`;
  }).join('');

  return `
    ${streaksBlock(st)}
    <div class="panel-head spaced">
      <h2>${T('Что ты сделал?', 'What did you do?')}</h2>
      <div class="segmented small">
        <button aria-selected="${ui.logDay === 0}" data-action="log-day" data-day="0">${T('Сегодня', 'Today')}</button>
        <button aria-selected="${ui.logDay === 1}" data-action="log-day" data-day="1">${T('Вчера', 'Yesterday')}</button>
      </div>
    </div>
    <div class="chips">${chips}</div>
    <div class="act-list">${actHtml || `<p class="muted">${T('Здесь пока пусто.', 'Nothing here yet.')}</p>`}</div>
    <button class="btn btn-ghost btn-wide" data-action="custom-act">${T('Добавить своё дело', 'Add your own activity')}</button>

    <div class="panel-head spaced">
      <h2>${T('Вредные привычки', 'Bad habits')}</h2>
      <p class="muted">${T('Отмечай честно: так ты увидишь, что на самом деле мешает расти.', 'Be honest: this is how you see what really holds you back.')}</p>
    </div>
    <div class="act-list">${bads}</div>
    <button class="btn btn-ghost btn-wide" data-action="custom-bad">${T('Добавить свою привычку', 'Add your own habit')}</button>`;
}

// --- Вкладка «Навыки» ---
function panelSkills(st) {
  const chips = SPHERES.map(s =>
    `<button class="chip${ui.skillSphere === s.id ? ' is-on' : ''}" data-action="skill-sphere" data-sphere="${s.id}">${s.icon} ${nm(s)}</button>`
  ).join('');
  const sp = SPHERE_BY_ID[ui.skillSphere];
  const s = st.spheres[sp.id];
  const list = SKILLS[sp.id];
  const depth = (sk) => { let d = 0; let p = sk.parent; while (p) { d++; p = SKILL_BY_ID[p].parent; } return d; };

  // порядок: как дерево (родитель, затем его дети)
  const ordered = [];
  const walk = (parent) => list.filter(k => k.parent === parent).forEach(k => { ordered.push(k); walk(k.id); });
  walk(null);

  const nodes = ordered.map(sk => {
    const status = skillStatus(st, sk.id);
    const bonus = RULES.skillXp(sk.minLevel);
    let action = '';
    let note = '';
    if (status === 'done') {
      action = `<button class="btn btn-small btn-ghost" data-action="undo-skill" data-id="${sk.id}">${T('Откатить', 'Undo')}</button>`;
      note = T('Освоено', 'Mastered');
    } else if (status === 'ready') {
      action = `<button class="btn btn-small btn-primary" data-action="unlock-skill" data-id="${sk.id}">${T('Я освоил', 'I did it')}</button>`;
      note = T(`+${bonus} опыта`, `+${bonus} XP`);
    } else if (status === 'needLevel') {
      note = T(`Откроется на уровне ${sk.minLevel} (сейчас ${s.level})`, `Unlocks at level ${sk.minLevel} (now ${s.level})`);
    } else {
      note = T(`Сначала: ${nm(SKILL_BY_ID[sk.parent])}`, `First: ${nm(SKILL_BY_ID[sk.parent])}`);
    }
    return `
      <li class="skill is-${status}" style="--d:${depth(sk)};--c:${sp.color}">
        <span class="skill-dot" aria-hidden="true"></span>
        <span class="skill-body">
          <strong>${esc(nm(sk))}</strong>
          <small>${note}</small>
        </span>
        ${action}
      </li>`;
  }).join('');

  return `
    <div class="panel-head">
      <h2>${T('Навыки', 'Skills')}</h2>
      <p class="muted">${T('Каждый освоенный навык — новая веточка с плодом. Отмечай, только когда действительно получилось.', 'Every mastered skill is a new twig with fruit. Only mark it when you’ve really done it.')}</p>
    </div>
    <div class="chips">${chips}</div>
    <div class="skill-summary" style="--c:${sp.color}">
      <span>${sp.icon}</span>
      <div><strong>${nm(sp)}</strong><span class="muted">${T(`Уровень ${s.level} · освоено ${s.unlocked.length} из ${list.length}`, `Level ${s.level} · ${s.unlocked.length} of ${list.length} mastered`)}</span></div>
    </div>
    <ul class="skill-tree">${nodes}</ul>`;
}

// --- Вкладка «Материалы» ---
function panelMaterials(st) {
  const chips = [{ id: 'all', name: T('Все', 'All'), icon: '' }, ...SPHERES].map(s =>
    `<button class="chip${ui.matSphere === s.id ? ' is-on' : ''}" data-action="mat-sphere" data-sphere="${s.id}">${s.icon ? s.icon + ' ' : ''}${nm(s)}</button>`
  ).join('');
  // Русскоязычные сайты показываем только на русском, англоязычные — только на английском.
  const items = MATERIALS.filter(m => (!m.only || m.only === getLang()) && (ui.matSphere === 'all' || m.sphere === ui.matSphere)).map(m => {
    const sp = SPHERE_BY_ID[m.sphere];
    const done = st.learned.has(m.id);
    const url = nm(m, 'url');
    return `
      <article class="mat${done ? ' is-done' : ''}" style="--c:${sp.color}">
        <div class="mat-kind">${sp.icon} ${esc(nm(m, 'kind'))}</div>
        <h3>${esc(nm(m, 'title'))}</h3>
        <p>${esc(nm(m, 'note'))}</p>
        <div class="mat-actions">
          ${url ? `<a class="btn btn-small btn-ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${T('Открыть', 'Open')}</a>` : `<span class="muted small">${T('Ищи в библиотеке или книжном', 'Find it at a library or bookshop')}</span>`}
          ${done
            ? `<button class="btn btn-small btn-ghost" data-action="undo-mat" data-id="${m.id}">${T('Изучено ✓', 'Done ✓')}</button>`
            : `<button class="btn btn-small btn-primary" data-action="learn" data-id="${m.id}">${T('Изучил', 'Done')} · +${RULES.materialXp}</button>`}
        </div>
      </article>`;
  }).join('');
  return `
    <div class="panel-head">
      <h2>${T('Материалы', 'Resources')}</h2>
      <p class="muted">${T('Книги, курсы и сайты, которые помогут прокачать каждую ветвь.', 'Books, courses and websites to help each branch grow.')}</p>
    </div>
    <div class="chips">${chips}</div>
    <div class="mat-list">${items}</div>`;
}

// --- Вкладка «История» ---
// Название, значок и сфера отметки — для истории и дневника.
function eventInfo(e) {
  if (e.k === 'act') { const a = findAction(ui.save, e.ref); return { title: a ? nm(a) : T('Удалённое дело', 'Deleted activity'), icon: SPHERE_BY_ID[a?.sphere]?.icon || '•', sphere: a?.sphere }; }
  if (e.k === 'time') { const sb = findSub(ui.save, e.ref); return { title: `${sb?.name || T('Удалённая подветвь', 'Deleted sub-branch')} · ${formatMinutes(Number(e.m) || 0)}`, icon: SPHERE_BY_ID[sb?.sphere]?.icon || '⏱', sphere: sb?.sphere }; }
  if (e.k === 'bad') { const b = findBad(ui.save, e.ref); return { title: b ? nm(b) : T('Удалённая привычка', 'Deleted habit'), icon: '🥀', sphere: b ? Object.keys(b.damage || {})[0] : null, bad: true }; }
  if (e.k === 'skill') { const k = SKILL_BY_ID[e.ref]; return { title: T('Навык: ', 'Skill: ') + (k ? nm(k) : '?'), icon: '🌱', sphere: k?.sphere }; }
  if (e.k === 'mat') { const m = findMaterial(e.ref); return { title: T('Изучил: ', 'Studied: ') + (m ? nm(m, 'title') || m.title || m.title_en : '?'), icon: '📖', sphere: m?.sphere }; }
  return { title: '?', icon: '•', sphere: null };
}

function fmtDay(t) {
  const k = dayKey(t);
  if (k === dayKey(Date.now())) return T('Сегодня', 'Today');
  if (k === dayKey(Date.now() - DAY)) return T('Вчера', 'Yesterday');
  return new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'long', weekday: 'short' });
}
const fmtTime = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const hasNote = (e) => Boolean(e.note || e.mood);

function panelHistory(st) {
  const notes = ui.save.events.filter(hasNote).length;
  const head = `
    <div class="panel-head">
      <h2>${ui.histMode === 'diary' ? T('Дневник', 'Journal') : T('История', 'History')}</h2>
      <div class="segmented small">
        <button aria-selected="${ui.histMode === 'all'}" data-action="hist-mode" data-mode="all">${T('Отметки', 'Entries')}</button>
        <button aria-selected="${ui.histMode === 'diary'}" data-action="hist-mode" data-mode="diary">${T('Дневник', 'Journal')}${notes ? ` · ${notes}` : ''}</button>
      </div>
      <p class="muted">${ui.histMode === 'diary'
        ? T('Твои заметки к делам: что получилось, что мешало, какие мысли. Добавить заметку можно сразу после отметки или кнопкой ✎ в отметках.', 'Your notes on activities: what worked, what got in the way, your thoughts. Add a note right after logging or with the ✎ button in entries.')
        : T('Понял, что был не так хорош, как отметил? Отмени — дерево пересчитается честно. Кнопка ✎ — заметка к делу.', 'Realised you logged more than you did? Undo it — the tree recalculates honestly. The ✎ button adds a note.')}</p>
    </div>`;
  if (ui.histMode === 'diary') return head + panelDiary(st);

  const events = [...ui.save.events].sort((a, b) => b.t - a.t).slice(0, 200);
  if (!events.length) {
    return head + `<div class="callout"><p>${T('Здесь будут все твои отметки. Любую можно отменить, если понял, что поторопился.', 'All your entries will appear here. You can undo any of them if you were too quick.')}</p>
      <button class="btn btn-primary" data-action="tab" data-tab="log">${T('Отметить первое дело', 'Log your first activity')}</button></div>`;
  }
  let html = '';
  let lastDay = '';
  for (const e of events) {
    const d = fmtDay(e.t);
    if (d !== lastDay) { html += `<h3 class="hist-day">${d}</h3>`; lastDay = d; }
    const eff = st.effects[e.id] || { gains: {}, losses: {} };
    const { title, icon } = eventInfo(e);
    const fx = [
      ...Object.entries(eff.gains).map(([sid, v]) => `<span class="fx-good">+${v} ${nm(SPHERE_BY_ID[sid])}</span>`),
      ...Object.entries(eff.losses).map(([sid, v]) => `<span class="fx-bad">−${v} ${T('сила', 'vitality')}: ${nm(SPHERE_BY_ID[sid])}</span>`),
      ...(eff.act ? [`<span class="fx-act">✓ ${esc(nm(findAction(ui.save, eff.act)))}</span>`] : []),
    ].join(' ') || `<span class="muted">${T('не засчитано', 'didn’t count')}</span>`;
    const note = hasNote(e)
      ? `<button class="hist-note" data-action="note" data-id="${e.id}">${e.mood ? MOODS[e.mood - 1] + ' ' : ''}${esc((e.note || '').slice(0, 140))}${(e.note || '').length > 140 ? '…' : ''}</button>`
      : '';
    html += `
      <div class="hist${eff.valid === false ? ' is-void' : ''}">
        <span class="hist-icon">${icon}</span>
        <span class="hist-body"><strong>${esc(title)}</strong><small>${fmtTime(e.t)} · ${fx}</small>${note}</span>
        <span class="hist-actions">
          <button class="icon-btn small${hasNote(e) ? ' is-on' : ''}" data-action="note" data-id="${e.id}" aria-label="${hasNote(e) ? T('Изменить заметку', 'Edit note') : T('Добавить заметку', 'Add a note')}" title="${T('Заметка', 'Note')}">✎</button>
          <button class="btn btn-small btn-ghost" data-action="undo" data-id="${e.id}">${T('Отменить', 'Undo')}</button>
        </span>
      </div>`;
  }
  return head + `<div class="hist-list">${html}</div>`;
}

function panelDiary(st) {
  const all = ui.save.events.filter(hasNote);
  if (!all.length) {
    return `<div class="callout">
      <h3>${T('Дневник пока пуст', 'Your journal is empty')}</h3>
      <p>${T('Отметь дело — внизу появится кнопка «Добавить заметку». Напиши пару слов: что получилось, что было трудно, как настроение. Здесь соберётся твой дневник прогресса.', 'Log an activity and an “Add a note” button appears at the bottom. Write a few words: what worked, what was hard, how you feel. Your progress journal builds up here.')}</p>
      <button class="btn btn-primary" data-action="tab" data-tab="log">${T('Отметить дело', 'Log an activity')}</button>
    </div>`;
  }
  const spheresUsed = new Set(all.map(e => eventInfo(e).sphere).filter(Boolean));
  const chips = [{ id: 'all', name: T('Все', 'All'), icon: '' }, ...SPHERES.filter(sp => spheresUsed.has(sp.id))].map(sp =>
    `<button class="chip${ui.diarySphere === sp.id ? ' is-on' : ''}" data-action="diary-sphere" data-sphere="${sp.id}">${sp.icon ? sp.icon + ' ' : ''}${nm(sp)}</button>`).join('');
  return `
    <label class="field diary-search"><span class="sr-only">${T('Поиск по дневнику', 'Search the journal')}</span>
      <input id="diary-search" type="search" placeholder="${T('Поиск по заметкам', 'Search notes')}" value="${esc(ui.diaryQuery)}" autocomplete="off">
    </label>
    <div class="chips">${chips}</div>
    <div id="diary-list" class="diary-list">${diaryList()}</div>
    ${TG.wa ? '' : `<button class="btn btn-ghost btn-wide" data-action="diary-export">${T('Скачать дневник текстом', 'Download journal as text')}</button>`}`;
}

function diaryEntries() {
  const q = ui.diaryQuery.trim().toLowerCase();
  return ui.save.events.filter(hasNote).map(e => ({ e, info: eventInfo(e) }))
    .filter(({ e, info }) => ui.diarySphere === 'all' || info.sphere === ui.diarySphere)
    .filter(({ e, info }) => !q || (e.note || '').toLowerCase().includes(q) || info.title.toLowerCase().includes(q))
    .sort((a, b) => b.e.t - a.e.t);
}

function diaryList() {
  const items = diaryEntries();
  if (!items.length) return `<p class="muted">${T('Ничего не нашлось.', 'Nothing found.')}</p>`;
  let html = '';
  let lastDay = '';
  for (const { e, info } of items) {
    const d = fmtDay(e.t);
    if (d !== lastDay) { html += `<h3 class="hist-day">${d}</h3>`; lastDay = d; }
    const sp = SPHERE_BY_ID[info.sphere];
    html += `
      <article class="diary-entry${info.bad ? ' is-bad' : ''}" style="--c:${info.bad ? 'var(--bad)' : sp?.color || 'var(--line)'}">
        <header>
          <span class="de-title">${info.icon} ${esc(info.title)}</span>
          <span class="de-time">${fmtTime(e.t)}</span>
        </header>
        ${e.note ? `<p class="de-text">${esc(e.note)}</p>` : ''}
        <footer>
          ${e.mood ? `<span class="de-mood" title="${T('Настроение', 'Mood')}">${MOODS[e.mood - 1]}</span>` : '<span></span>'}
          <button class="link-btn" data-action="note" data-id="${e.id}">${T('Изменить', 'Edit')}</button>
        </footer>
      </article>`;
  }
  return html;
}

function exportDiary() {
  const items = diaryEntries().reverse();
  const text = T('Дневник — Древо жизни', 'Journal — Tree of Life') + '\n\n' + items.map(({ e, info }) =>
    `${new Date(e.t).toLocaleString(locale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n` +
    `${info.title}${e.mood ? '  ' + MOODS[e.mood - 1] : ''}\n${e.note || ''}`).join('\n\n———\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${T('dnevnik', 'journal')}-${dayKey(Date.now())}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openNote(eventId) {
  const e = ui.save.events.find(x => x.id === eventId);
  if (!e) return;
  const info = eventInfo(e);
  const when = new Date(e.t).toLocaleString(locale(), { day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  openSheet(`
    <h2>${info.icon} ${esc(info.title)}</h2>
    <p class="small">${when}</p>
    <form id="sheet-form" novalidate>
      <fieldset class="field mood-field"><legend>${T('Настроение', 'Mood')}</legend>
        <div class="mood-row">${MOODS.map((m, i) => `
          <label class="mood"><input type="radio" name="mood" value="${i + 1}"${e.mood === i + 1 ? ' checked' : ''}><span>${m}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="field"><span>${T('Заметка', 'Note')}</span>
        <textarea name="note" rows="6" maxlength="2000" placeholder="${info.bad ? T('Что привело к срыву? Что поможет в следующий раз?', 'What led to the slip? What will help next time?') : T('Что получилось? Что было трудно? Что понял?', 'What worked? What was hard? What did you learn?')}">${esc(e.note || '')}</textarea>
      </label>
      <div class="sheet-actions">
        ${hasNote(e) ? `<button type="button" class="btn btn-ghost" data-action="note-delete" data-id="${e.id}">${T('Удалить', 'Delete')}</button>` : ''}
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${T('Сохранить', 'Save')}</button>
      </div>
    </form>`, (fd) => {
    const note = String(fd.get('note') || '').trim().slice(0, 2000);
    const mood = Number(fd.get('mood')) || 0;
    if (note) e.note = note; else delete e.note;
    if (mood) e.mood = mood; else delete e.mood;
    e.ne = Date.now();
    commit();
    toast(note || mood ? T('Заметка сохранена в дневнике', 'Note saved to your journal') : T('Заметка удалена', 'Note deleted'), 'info');
  });
  // Курсор сразу в поле заметки, если это компьютер.
  if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => $('#sheet textarea')?.focus(), 40);
}

// Плашка внизу экрана с кнопкой действия (например, «Добавить заметку»).
let snackTimer = null;
function showSnack(text, actionLabel, onAction) {
  let el = $('#snack');
  if (!el) {
    el = document.createElement('div');
    el.id = 'snack';
    el.className = 'snack';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="snack-text">${esc(text)}</span><button class="snack-btn">${esc(actionLabel)}</button>`;
  el.querySelector('.snack-btn').onclick = () => { hideSnack(); onAction(); };
  el.classList.add('is-visible');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(hideSnack, 6000);
}
function hideSnack() {
  clearTimeout(snackTimer);
  $('#snack')?.classList.remove('is-visible');
}

// ---------------------------------------------------------------------------
// Всплывающие окна
// ---------------------------------------------------------------------------

function openSheet(html, onSubmit) {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet-card" role="dialog" aria-modal="true">${html}</div>`;
  sheet.hidden = false;
  sheet._onSubmit = onSubmit;
  lockScroll();
  syncTelegram();
  // На телефоне не ставим фокус сами: иначе выскакивает клавиатура.
  if (window.matchMedia('(pointer: fine)').matches) {
    const first = sheet.querySelector('input, select, button.btn-primary');
    if (first) setTimeout(() => first.focus(), 30);
  }
}
function closeSheet() {
  const sheet = $('#sheet');
  sheet.hidden = true;
  sheet.innerHTML = '';
  sheet._onSubmit = null;
  unlockScroll();
  syncTelegram();
}

// Пока открыто окно, страница под ним не должна прокручиваться.
// На iPhone (и в Telegram) overflow: hidden не помогает, поэтому страницу
// «замораживаем» на месте через position: fixed и потом возвращаем прокрутку.
let lockedY = null;
function lockScroll() {
  if (lockedY !== null) return;
  lockedY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed';
  b.top = `-${lockedY}px`;
  b.left = '0';
  b.right = '0';
  b.overflow = 'hidden';
}
function unlockScroll() {
  if (lockedY === null) return;
  const b = document.body.style;
  b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.overflow = '';
  window.scrollTo(0, lockedY);
  lockedY = null;
}

function confirmSheet(title, text, okLabel, onOk, danger = false) {
  openSheet(`
    <h2>${title}</h2>
    <p>${text}</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="sheet-ok">${okLabel}</button>
    </div>`, () => { onOk(); });
}

// ---------------------------------------------------------------------------
// Обучение
// ---------------------------------------------------------------------------

// Открыть нужный экран без анимаций — для шагов обучения.
function navigate({ tab = 'tree', zoom = null, histMode } = {}) {
  if (!$('#sheet').hidden) closeSheet();
  hideSnack();
  ui.selected = null;
  ui.tab = tab;
  ui.zoom = tab === 'tree' ? zoom : null;
  if (histMode) ui.histMode = histMode;
  render();
  syncTelegram();
}

function startTour(plan) {
  if (!plan || !ui.save) return;
  closeSheet();
  hideSnack();
  runTour(plan, {
    navigate,
    reduceMotion,
    onFinish: ({ features }) => {
      // Обучение показываем один раз — даже если игрок его пропустил.
      ui.save.seenTips = [...new Set([...ui.save.seenTips, ...features])];
      commit();
      syncTelegram();
    },
  });
  syncTelegram();
}

// Новичкам и тем, кто ещё не проходил, — полное обучение;
// остальным — короткий тур по новым функциям, если они появились.
function maybeStartTour() {
  const plan = planTour(ui.save.seenTips);
  if (plan) setTimeout(() => { if (ui.save && !tourActive() && $('#sheet').hidden) startTour(plan); }, 600);
}

// ---------------------------------------------------------------------------
// Приближение к ветви и подветви
// ---------------------------------------------------------------------------

function subWord(n) {
  return plural(n, ['подветвь', 'подветви', 'подветвей'], ['sub-branch', 'sub-branches']);
}

function animateViewBox(svg, from, to, ms) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = ease(k);
      svg.setAttribute('viewBox', from.map((v, i) => (v + (to[i] - v) * e).toFixed(1)).join(' '));
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

// Камера плавно наезжает на ветку, потом показываем её крупным планом.
async function zoomTo(sphereId) {
  if (ui.zooming) return;
  ui.selected = null;
  ui.tab = 'tree';
  const svg = $('#tree svg');
  const g = svg?.querySelector(`.branch[data-sphere="${sphereId}"]`);
  if (svg && g && !reduceMotion && $('#tree').dataset.view === 'tree') {
    ui.zooming = true;
    try {
      const from = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      const bb = g.getBBox();
      const aspect = from[2] / from[3];
      let w = Math.max(bb.width, bb.height * aspect) * 1.35;
      w = Math.max(w, 120);
      const h = w / aspect;
      const to = [bb.x + bb.width / 2 - w / 2, bb.y + bb.height / 2 - h / 2, w, h];
      $('#tree').classList.add('is-zooming');
      await animateViewBox(svg, from, to, 420);
    } catch { /* без анимации */ }
    $('#tree').classList.remove('is-zooming');
    ui.zooming = false;
  }
  ui.zoom = sphereId;
  render();
  if (window.matchMedia('(max-width: 899px)').matches) window.scrollTo({ top: 0, behavior: 'auto' });
}

async function zoomOut() {
  const sphereId = ui.zoom;
  ui.zoom = null;
  render();
  const svg = $('#tree svg');
  const g = svg?.querySelector(`.branch[data-sphere="${sphereId}"]`);
  if (!svg || !g || reduceMotion) return;
  try {
    const full = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const bb = g.getBBox();
    const aspect = full[2] / full[3];
    const w = Math.max(120, Math.max(bb.width, bb.height * aspect) * 1.35);
    const h = w / aspect;
    const from = [bb.x + bb.width / 2 - w / 2, bb.y + bb.height / 2 - h / 2, w, h];
    svg.setAttribute('viewBox', from.join(' '));
    await animateViewBox(svg, from, full, 380);
  } catch { /* без анимации */ }
}

function periodValue(sb, kind) {
  const key = { week: 7, month: 30, all: '' }[ui.subPeriod];
  return sb[kind + key];
}

function panelBranch(st) {
  const sp = SPHERE_BY_ID[ui.zoom];
  const s = st.spheres[ui.zoom];
  const subs = s.subList;
  const t = eventTime();

  // Сравнение подветвей за выбранный период: по времени, а если времени нет — по опыту.
  const byMinutes = subs.some(x => periodValue(x, 'minutes') > 0);
  const kind = byMinutes ? 'minutes' : 'xp';
  const rows = [...subs].sort((a, b) => periodValue(b, kind) - periodValue(a, kind) || a.order - b.order);
  const max = Math.max(1, ...rows.map(x => periodValue(x, kind)));
  const sum = rows.reduce((a, x) => a + periodValue(x, kind), 0);
  const periodName = { week: T('за неделю', 'this week'), month: T('за месяц', 'this month'), all: T('за всё время', 'all time') }[ui.subPeriod];

  let insight = '';
  if (subs.length >= 2 && sum > 0) {
    const top = rows[0];
    const neglected = subs.filter(x => x.idleDays == null || x.idleDays >= SUB_RULES.neglectDays)
      .sort((a, b) => (b.idleDays ?? 1e9) - (a.idleDays ?? 1e9))[0];
    const pct = Math.round(periodValue(top, kind) / sum * 100);
    insight = `<p class="insight">${T(`Больше всего ${byMinutes ? 'времени' : 'опыта'} ${periodName}: <b>${esc(top.name)}</b> — ${pct}%.`, `Most ${byMinutes ? 'time' : 'XP'} ${periodName}: <b>${esc(top.name)}</b> — ${pct}%.`)}` +
      (neglected ? ' ' + T(`Давно не поливал: <b>${esc(neglected.name)}</b>${neglected.idleDays == null ? ' (ещё ни разу)' : ` — ${neglected.idleDays} ${daysWord(neglected.idleDays)}`}.`, `Neglected for a while: <b>${esc(neglected.name)}</b>${neglected.idleDays == null ? ' (never yet)' : ` — ${neglected.idleDays} ${daysWord(neglected.idleDays)}`}.`) : '') + '</p>';
  }

  const subRows = rows.map((sb) => {
    const i = subs.indexOf(sb);
    const v = periodValue(sb, kind);
    const minutesP = periodValue(sb, 'minutes');
    const idle = sb.idleDays == null ? T('ещё не начато', 'not started yet') : sb.idleDays === 0 ? T('сегодня', 'today') : sb.idleDays === 1 ? T('вчера', 'yesterday') : T(`${sb.idleDays} ${daysWord(sb.idleDays)} назад`, `${sb.idleDays} ${daysWord(sb.idleDays)} ago`);
    const warn = sb.idleDays == null || sb.idleDays >= SUB_RULES.neglectDays;
    return `
      <div class="sub-row" style="--c:${subColor(sp.color, i)}">
        <button class="sub-main" data-action="sub-menu" data-id="${sb.id}">
          <span class="sub-top"><strong>${esc(sb.name)}</strong>${flameChip(st, linkedAction(ui.save, findSub(ui.save, sb.id)) || sb.id)}<span class="sub-lvl">${T('ур.', 'lv')} ${sb.level}</span></span>
          <span class="bar"><i style="width:${Math.round(v / max * 100)}%"></i></span>
          ${linkLine(sb.id)}
          <span class="sub-meta">${formatMinutes(minutesP)} ${periodName} · ${T(`${sb.xp} опыта всего`, `${sb.xp} XP total`)} · <span class="${warn ? 'warn' : ''}">${idle}</span></span>
        </button>
        <button class="btn btn-small btn-primary" data-action="log-time" data-id="${sb.id}" aria-label="${T('Отметить время', 'Log time')}: ${esc(sb.name)}">+ ${T('время', 'time')}</button>
      </div>`;
  }).join('');

  const acts = allActions(ui.save).filter(a => a.sphere === ui.zoom);
  return `
    <div class="sphere-head" style="--c:${sp.color}">
      <span class="sh-icon">${sp.icon}</span>
      <div><h2>${nm(sp)}</h2><p class="muted">${s.started ? T(`Уровень ${s.level} · ${s.into}/${s.need} опыта`, `Level ${s.level} · ${s.into}/${s.need} XP`) : T('Ветвь ещё не проросла', 'This branch hasn’t sprouted yet')}</p></div>
    </div>
    <div class="meters">
      <div><span>${T(`Опыт до уровня ${s.level + 1}`, `XP to level ${s.level + 1}`)}</span><div class="bar"><i style="width:${Math.round(s.progress * 100)}%;background:${sp.color}"></i></div></div>
      <div><span>${T('Жизненная сила', 'Vitality')}: ${s.health}% — ${healthWord(s.health)}</span><div class="bar"><i style="width:${s.health}%;background:${s.health >= 60 ? 'var(--good)' : s.health >= 35 ? '#E0A526' : 'var(--bad)'}"></i></div></div>
    </div>

    <div class="panel-head spaced">
      <h2>${T('Подветви', 'Sub-branches')}</h2>
      ${subs.length ? `<div class="segmented small">
        <button aria-selected="${ui.subPeriod === 'week'}" data-action="sub-period" data-period="week">${T('Неделя', 'Week')}</button>
        <button aria-selected="${ui.subPeriod === 'month'}" data-action="sub-period" data-period="month">${T('Месяц', 'Month')}</button>
        <button aria-selected="${ui.subPeriod === 'all'}" data-action="sub-period" data-period="all">${T('Всё', 'All')}</button>
      </div>` : ''}
      <p class="muted">${subs.length
        ? T('Раздели ветвь на части — предметы, виды спорта, проекты — и отмечай время на каждую. Сразу видно, чему уделяешь больше, а что забросил.', 'Split a branch into parts — subjects, sports, projects — and log time for each. You’ll see right away what gets most of your time and what you’ve neglected.')
        : T('Ветвь можно разделить на подветви: например, «Разум» — на предметы в вузе. Отмечай время на каждую, и станет видно, чему ты уделяешь больше, а что забросил.', 'A branch can be split into sub-branches: for example, “Mind” into your university subjects. Log time for each and you’ll see what gets most attention and what you’ve neglected.')}</p>
    </div>
    ${insight}
    ${subRows ? `<div class="sub-list">${subRows}</div>` : ''}
    ${subs.length < SUB_RULES.maxPerSphere ? `<button class="btn ${subs.length ? 'btn-ghost' : 'btn-primary'} btn-wide" data-action="add-sub">${T('Добавить подветвь', 'Add a sub-branch')}</button>` : ''}

    <div class="panel-head spaced">
      <h2>${T('Дела ветви', 'Branch activities')}</h2>
      <div class="segmented small">
        <button aria-selected="${ui.logDay === 0}" data-action="log-day" data-day="0">${T('Сегодня', 'Today')}</button>
        <button aria-selected="${ui.logDay === 1}" data-action="log-day" data-day="1">${T('Вчера', 'Yesterday')}</button>
      </div>
    </div>
    <div class="act-list">
      ${acts.map(a => {
        const sb = a.sub ? findSub(ui.save, a.sub) : null;
        return `<button class="act" data-action="log-act" data-id="${a.id}" style="--c:${sp.color}">
        <span class="act-name">${esc(nm(a))}${sb ? `<small class="act-sub">${esc(sb.name)}</small>` : ''}</span>${flameChip(st, a.id)}<span class="act-xp">+${Math.round(a.xp * RULES.repeatFactors[Math.min(countOnDay(st, a.id, t), 2)])}</span></button>`;
      }).join('')}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="custom-act" data-sphere="${sp.id}">${T('Своё дело', 'Own activity')}</button>
      <button class="btn btn-ghost" data-action="branch-notes" data-sphere="${sp.id}">${T('Заметки ветви', 'Branch notes')}</button>
      <button class="btn btn-ghost" data-action="goto-skills" data-sphere="${sp.id}">${T('Навыки ветви', 'Branch skills')}</button>
    </div>`;
}

// Подсказки названий подветвей: [по-русски, по-английски].
const SUB_SUGGESTIONS = {
  health: [['Бег', 'Running'], ['Зал', 'Gym'], ['Плавание', 'Swimming'], ['Йога', 'Yoga'], ['Велосипед', 'Cycling'], ['Футбол', 'Football']],
  mind: [['Математика', 'Maths'], ['Английский', 'Foreign language'], ['Физика', 'Physics'], ['Программирование', 'Programming'], ['История', 'History'], ['Чтение', 'Reading']],
  career: [['Учёба по профессии', 'Job training'], ['Свой проект', 'Side project'], ['Портфолио', 'Portfolio'], ['Подработка', 'Part-time job'], ['Стажировка', 'Internship']],
  finance: [['Бюджет', 'Budget'], ['Накопления', 'Savings'], ['Инвестиции', 'Investing'], ['Подработка', 'Side income']],
  social: [['Семья', 'Family'], ['Друзья', 'Friends'], ['Отношения', 'Partner'], ['Новые знакомства', 'Meeting people']],
  creative: [['Рисование', 'Drawing'], ['Музыка', 'Music'], ['Фото', 'Photography'], ['Писательство', 'Writing'], ['Видео', 'Video']],
  soul: [['Медитация', 'Meditation'], ['Дневник', 'Journaling'], ['Прогулки', 'Walks'], ['Чтение для души', 'Reading for fun']],
  home: [['Готовка', 'Cooking'], ['Уборка', 'Cleaning'], ['Ремонт', 'Repairs'], ['Растения', 'Plants']],
};

function openAddSub(sphereId) {
  const sp = SPHERE_BY_ID[sphereId];
  const taken = new Set(subsOf(ui.save, sphereId).map(x => x.name.toLowerCase()));
  const ideas = (SUB_SUGGESTIONS[sphereId] || []).map(([ru, en]) => T(ru, en)).filter(x => !taken.has(x.toLowerCase()));
  openSheet(`
    <h2>${T('Новая подветвь', 'New sub-branch')}: ${sp.icon} ${nm(sp)}</h2>
    <form id="sheet-form" novalidate>
      <label class="field"><span>${T('Название', 'Name')}</span><input name="name" maxlength="30" required placeholder="${T('Например', 'For example')}: ${esc(ideas[0] || T('Матанализ', 'Calculus'))}"></label>
      ${ideas.length ? `<div class="chips wrap">${ideas.map(x => `<button type="button" class="chip" data-action="fill-sub" data-name="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      ${linkSelect(sphereId, null, true)}
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${T('Добавить', 'Add')}</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim().slice(0, 30);
    const err = $('#sheet .form-error');
    if (!name) { err.textContent = T('Напиши название', 'Enter a name'); return false; }
    if (taken.has(name.toLowerCase())) { err.textContent = T('Такая подветвь уже есть', 'That sub-branch already exists'); return false; }
    const order = Math.max(-1, ...ui.save.custom.subs.filter(x => x.sphere === sphereId).map(x => x.order ?? 0)) + 1;
    const id = 'sb_' + uid();
    const sub = { id, sphere: sphereId, name, order, createdAt: Date.now() };
    const link = String(fd.get('act') || 'auto');
    if (link !== 'auto') sub.act = link === 'none' ? null : link; // иначе — угадываем по названию
    ui.save.custom.subs.push(sub);
    commit();
    toast(T(`Подветвь «${name}» проросла`, `Sub-branch “${name}” has sprouted`), 'good');
    haptic('success');
    setTimeout(() => openLogTime(id, true), 150);
  });
}

function openLogTime(subId, fresh = false) {
  const sb = findSub(ui.save, subId);
  if (!sb) return;
  const sp = SPHERE_BY_ID[sb.sphere];
  const presets = [15, 30, 45, 60, 90, 120, 180];
  openSheet(`
    <h2>${sp.icon} ${esc(sb.name)}</h2>
    <p>${fresh ? T('Сколько времени ты уже уделил этому? Можно пропустить и отметить потом.', 'How much time have you already spent on this? You can skip and log it later.') : T('Сколько времени ты на это потратил?', 'How much time did you spend on it?')}</p>
    <form id="sheet-form" novalidate>
      <div class="segmented small">
        <button type="button" aria-selected="${ui.logDay === 0}" data-action="time-day" data-day="0">${T('Сегодня', 'Today')}</button>
        <button type="button" aria-selected="${ui.logDay === 1}" data-action="time-day" data-day="1">${T('Вчера', 'Yesterday')}</button>
      </div>
      <div class="time-grid">
        ${presets.map(m => `<button type="button" class="time-chip" data-action="pick-time" data-m="${m}">${formatMinutes(m)}</button>`).join('')}
      </div>
      <label class="field"><span>${T('Или своё число минут', 'Or enter minutes')}</span><input name="m" type="number" inputmode="numeric" min="1" max="900" placeholder="${T('Например, 50', 'e.g. 50')}"></label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${fresh ? T('Пропустить', 'Skip') : T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${T('Отметить', 'Log')}</button>
      </div>
    </form>`, (fd) => {
    const m = Math.round(Number(fd.get('m')));
    if (!m || m < 1 || m > 900) { $('#sheet .form-error').textContent = T('Выбери время или впиши число минут от 1 до 900', 'Pick a time or enter 1 to 900 minutes'); return false; }
    addEvent('time', subId, eventTime(), { m });
  });
}

function subNotes(subId) {
  const list = ui.save.events
    .filter(e => hasNote(e) && ((e.k === 'time' && e.ref === subId) || (e.k === 'act' && findAction(ui.save, e.ref)?.sub === subId)))
    .sort((a, b) => b.t - a.t).slice(0, 3);
  if (!list.length) return '';
  return `<div class="sub-notes"><h3>${T('Последние заметки', 'Recent notes')}</h3>${list.map(e => `
    <button class="sub-note" data-action="note" data-id="${e.id}">
      <small>${fmtDay(e.t)}${e.mood ? ' · ' + MOODS[e.mood - 1] : ''}</small>
      <span>${esc((e.note || '').slice(0, 160))}${(e.note || '').length > 160 ? '…' : ''}</span>
    </button>`).join('')}</div>`;
}

// Подпись «↳ засчитывается как …» под названием подветви.
function linkLine(subId) {
  const actId = linkedAction(ui.save, findSub(ui.save, subId));
  if (!actId) return '';
  return `<span class="sub-link">↳ ${T('засчитывается как', 'counts as')} «${esc(nm(findAction(ui.save, actId)))}»</span>`;
}

// Выбор дела, которое засчитывается при отметке времени на подветвь.
function linkSelect(sphereId, sb, fresh) {
  const acts = allActions(ui.save).filter(a => a.sphere === sphereId && !a.sub);
  const explicit = sb && Object.prototype.hasOwnProperty.call(sb, 'act');
  const current = explicit ? (sb.act || 'none') : 'auto';
  const guess = sb ? guessAction(sb.name, sphereId) : null;
  const autoLabel = fresh
    ? T('Определить по названию', 'Pick by name')
    : guess ? T(`Автоматически: «${nm(findAction(ui.save, guess))}»`, `Automatic: “${nm(findAction(ui.save, guess))}”`) : T('Автоматически: не найдено', 'Automatic: none found');
  return `<label class="field"><span>${T('Засчитывать как дело', 'Count as activity')}</span>
    <select name="act">
      <option value="auto"${current === 'auto' ? ' selected' : ''}>${autoLabel}</option>
      ${acts.map(a => `<option value="${a.id}"${current === a.id ? ' selected' : ''}>${esc(nm(a))}</option>`).join('')}
      <option value="none"${current === 'none' ? ' selected' : ''}>${T('Не засчитывать', 'Don’t count')}</option>
    </select>
    <small class="field-hint">${T('Отметил время на подветвь — это дело тоже отметится за день и продлит свой огонёк.', 'Log time on the sub-branch and this activity is marked done for the day too, keeping its streak going.')}</small>
  </label>`;
}

function openSubMenu(subId) {
  const sb = findSub(ui.save, subId);
  if (!sb) return;
  const sp = SPHERE_BY_ID[sb.sphere];
  const stat = ui.state.subStats[subId];
  openSheet(`
    <h2>${sp.icon} ${esc(sb.name)}</h2>
    <p>${stat.minutes ? T(`Всего ${formatMinutes(stat.minutes)}, ${stat.xp} опыта. `, `${formatMinutes(stat.minutes)} in total, ${stat.xp} XP. `) : stat.xp ? T(`${stat.xp} опыта. `, `${stat.xp} XP. `) : T('Пока ни одной отметки. ', 'No entries yet. ')}${T(`За неделю — ${formatMinutes(stat.minutes7)}, за месяц — ${formatMinutes(stat.minutes30)}.`, `This week: ${formatMinutes(stat.minutes7)}, this month: ${formatMinutes(stat.minutes30)}.`)}</p>
    ${subNotes(sb.id)}
    <form id="sheet-form" novalidate>
      <label class="field"><span>${T('Название', 'Name')}</span><input name="name" maxlength="30" value="${esc(sb.name)}"></label>
      ${linkSelect(sb.sphere, sb, false)}
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions stack">
        <button type="button" class="btn btn-primary" data-action="log-time" data-id="${sb.id}">${T('Отметить время', 'Log time')}</button>
        <button class="btn btn-ghost" type="submit">${T('Сохранить', 'Save')}</button>
        <button type="button" class="btn btn-ghost" data-action="delete-sub" data-id="${sb.id}">${T('Удалить подветвь', 'Delete sub-branch')}</button>
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Закрыть', 'Close')}</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim().slice(0, 30);
    if (!name) { $('#sheet .form-error').textContent = T('Название не может быть пустым', 'The name can’t be empty'); return false; }
    if (subsOf(ui.save, sb.sphere).some(x => x.id !== sb.id && x.name.toLowerCase() === name.toLowerCase())) {
      $('#sheet .form-error').textContent = T('Такая подветвь уже есть', 'That sub-branch already exists'); return false;
    }
    sb.name = name;
    const link = String(fd.get('act') || 'auto');
    if (link === 'auto') delete sb.act; else sb.act = link === 'none' ? null : link;
    commit();
    toast(T('Сохранено', 'Saved'), 'info');
  });
}

function openSettings() {
  const themes = THEMES.map(th => {
    const leaves = th.tree.leaves || ['#5CF2C4', '#FF6B8B', '#5B8DEF'];
    return `
      <button class="theme-card${ui.save.theme === th.id ? ' is-on' : ''}" data-action="theme" data-id="${th.id}"
        style="--s1:${th.tree.sky[0]};--s2:${th.tree.sky[1]};--g:${th.tree.ground};--t:${th.tree.trunk};--l1:${leaves[0]};--l2:${leaves[1]};--l3:${leaves[2]}">
        <span class="theme-preview ${th.tree.pixel ? 'is-pixel' : ''}"><i class="tp-trunk"></i><i class="tp-l1"></i><i class="tp-l2"></i><i class="tp-l3"></i></span>
        <span>${nm(th)}</span>
      </button>`;
  }).join('');
  openSheet(`
    <h2>${T('Настройки', 'Settings')}</h2>
    <h3>${T('Язык', 'Language')}</h3>
    ${langSwitch('lang-settings')}
    <h3>${T('Стиль игры', 'Game style')}</h3>
    <div class="theme-grid">${themes}</div>
    <h3>${T('Профиль', 'Profile')}</h3>
    <label class="field"><span>${T('Имя', 'Name')}</span><input id="set-name" maxlength="40" value="${esc(ui.save.name || ui.user.name)}"></label>
    ${accountBlock()}
    ${remindRow()}
    <div class="sheet-actions stack">
      <button class="btn btn-ghost" data-action="save-name">${T('Сохранить имя', 'Save name')}</button>
      <button class="btn btn-ghost" data-action="tour-again">${T('Пройти обучение заново', 'Replay the tutorial')}</button>
      <button class="btn btn-ghost" data-action="reset">${T('Начать заново', 'Start over')}</button>
      <button class="btn btn-ghost" data-action="logout">${T('Выйти из аккаунта', 'Log out')}</button>
    </div>
    <h3>${T('Помощь', 'Help')}</h3>
    <div class="sheet-actions stack">
      <button class="btn btn-ghost" data-action="feedback">💬 ${T('Написать разработчику', 'Message the developer')}</button>
      <a class="btn btn-ghost" href="/privacy.html${T('', '?lang=en')}" target="_blank" rel="noopener">${T('Политика конфиденциальности', 'Privacy policy')}</a>
      <button class="btn btn-ghost btn-danger-text" data-action="delete-account">${T('Удалить аккаунт', 'Delete account')}</button>
      <button class="btn btn-primary" data-action="close-sheet">${T('Готово', 'Done')}</button>
    </div>`);
}

// --- Отзыв разработчику ---
function openFeedback() {
  openSheet(`
    <h2>${T('Написать разработчику', 'Message the developer')}</h2>
    <p>${T('Нашёл ошибку, чего-то не хватает или есть идея? Напиши — сообщение придёт разработчику.', 'Found a bug, missing something, or have an idea? Write it here — it goes straight to the developer.')}
      ${ui.user.telegram ? T('Ответ придёт в Telegram от бота игры.', 'The reply will come to you in Telegram from the game bot.') : T('Чтобы получить ответ, привяжи Telegram в настройках.', 'To get a reply, link Telegram in settings.')}</p>
    <form id="sheet-form" novalidate>
      <label class="field"><span>${T('Сообщение', 'Message')}</span>
        <textarea name="text" rows="5" maxlength="2000" required placeholder="${T('Например: хочу, чтобы…', 'For example: I wish that…')}"></textarea></label>
      <p class="field-hint">${T('Не пиши сюда пароли и личные данные.', 'Don’t include passwords or personal details.')}</p>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${T('Отправить', 'Send')}</button>
      </div>
    </form>`, async (fd) => {
    const text = String(fd.get('text') || '').trim();
    const err = $('#sheet .form-error');
    if (text.length < 3) { err.textContent = T('Напиши хотя бы пару слов', 'Write at least a few words'); return false; }
    const btn = $('#sheet button[type=submit]');
    btn.disabled = true;
    try {
      await api.feedback(text, TG.wa ? 'telegram' : 'web');
      closeSheet();
      toast(T('Спасибо! Сообщение отправлено', 'Thank you! Your message was sent'), 'good');
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
    return false;
  });
}

// --- Удаление аккаунта ---
function openDeleteAccount() {
  const needPass = Boolean(ui.user.email);
  openSheet(`
    <h2>${T('Удалить аккаунт?', 'Delete your account?')}</h2>
    <p>${T('Аккаунт, всё дерево, история, заметки и отзывы будут удалены с сервера навсегда. Это нельзя отменить.', 'Your account, the whole tree, history, notes and feedback will be permanently deleted from the server. This can’t be undone.')}</p>
    <form id="sheet-form" novalidate>
      ${needPass ? `<label class="field"><span>${T('Пароль для подтверждения', 'Password to confirm')}</span><input name="password" type="password" autocomplete="current-password" required></label>` : ''}
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-danger" type="submit">${T('Удалить навсегда', 'Delete forever')}</button>
      </div>
    </form>`, async (fd) => {
    const err = $('#sheet .form-error');
    try {
      await api.deleteAccount(String(fd.get('password') || ''));
      auth.token = null;
      ui.user = null; ui.save = null; ui.selected = null;
      closeSheet();
      applyTheme(THEME_BY_ID.spring);
      showAuth();
      toast(T('Аккаунт удалён', 'Account deleted'), 'info');
    } catch (e) { err.textContent = e.message; }
    return false;
  });
}

// --- Связь аккаунтов сайта и Telegram ---
function accountBlock() {
  const u = ui.user;
  const mail = u.email
    ? `<span class="tr-done">✓</span>`
    : `<button class="btn btn-small btn-primary" data-action="attach-email">${T('Добавить', 'Add')}</button>`;
  const tgBtn = u.telegram
    ? (u.email ? `<button class="btn btn-small btn-ghost" data-action="unlink-tg">${T('Отвязать', 'Unlink')}</button>` : `<span class="tr-done">✓</span>`)
    : `<button class="btn btn-small btn-primary" data-action="link-tg">${T('Привязать', 'Link')}</button>`;
  return `
    <h3>${T('Аккаунт', 'Account')}</h3>
    <div class="link-list">
      <div class="link-row">
        <span class="link-ic">✉️</span>
        <span class="link-body"><strong>${T('Вход по почте', 'Email login')}</strong><small>${u.email ? esc(u.email) : T('Не добавлен: без него не войти на сайте', 'Not added: you need it to log in on the website')}</small></span>
        ${mail}
      </div>
      <div class="link-row">
        <span class="link-ic">✈️</span>
        <span class="link-body"><strong>Telegram</strong><small>${u.telegram ? T('Привязан: на сайте и в Telegram одно дерево', 'Linked: one tree on the website and in Telegram') : T('Не привязан', 'Not linked')}</small></span>
        ${tgBtn}
      </div>
    </div>
    ${TG.wa && !u.email ? `<button class="btn btn-ghost btn-wide" data-action="merge-login">${T('Уже играю на сайте — объединить', 'I already play on the website — merge')}</button>` : ''}
    <p class="small muted">${T('Связанные вход по почте и Telegram — это один аккаунт: отметил дело на телефоне — увидишь его на компьютере. При объединении прогресс складывается, ничего не теряется.', 'Linked email login and Telegram are one account: log on your phone, see it on your computer. Merging adds the progress together — nothing is lost.')}</p>`;
}

// Управление ежедневными напоминаниями бота (только если привязан Telegram).
function remindRow() {
  const u = ui.user;
  if (!u.telegram) {
    return `<h3>${T('Напоминания', 'Reminders')}</h3>
      <p class="small muted">${T('Привяжи Telegram выше — и бот будет раз в день напоминать зайти в игру.', 'Link Telegram above and the bot will remind you once a day to drop into the game.')}</p>`;
  }
  const off = (u.remindOff || 0) > Date.now();
  const until = off ? new Date(u.remindOff).toLocaleDateString(T('ru-RU', 'en-US')) : '';
  return `<h3>${T('Напоминания', 'Reminders')}</h3>
    <p class="small muted">${off
      ? T(`Напоминания выключены до ${until}.`, `Reminders are off until ${until}.`)
      : T('Бот раз в день напоминает зайти в игру, если ты ещё не заходил в этот день.', 'The bot reminds you once a day to drop in, unless you’ve already been in that day.')}</p>
    <button class="btn btn-ghost btn-wide" data-action="${off ? 'remind-on' : 'remind-off'}">${off
      ? T('Включить напоминания', 'Turn reminders on')
      : T('🔕 Не напоминать 2 недели', '🔕 Mute for 2 weeks')}</button>`;
}

async function setReminders(off) {
  try {
    const res = await api.reminders(off);
    ui.user.remindOff = res.remindOff;
    openSettings();
    toast(off ? T('Напоминания выключены на 2 недели', 'Reminders muted for 2 weeks') : T('Напоминания включены', 'Reminders turned on'), 'good');
  } catch (e) { toast(e.message, 'bad'); }
}

function credentialsForm(title, text, submitLabel, extra = '') {
  return `
    <h2>${title}</h2>
    <p>${text}</p>
    <form id="sheet-form" novalidate>
      <label class="field"><span>${T('Почта', 'Email')}</span><input name="email" type="email" autocomplete="email" required placeholder="${T('you@mail.ru', 'you@example.com')}"></label>
      <label class="field"><span>${T('Пароль', 'Password')}</span><input name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="${T('Не короче 6 символов', 'At least 6 characters')}"></label>
      <p class="form-error" role="alert"></p>
      ${extra}
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${submitLabel}</button>
      </div>
    </form>`;
}

// Войти в аккаунт с сайта прямо в Telegram — прогресс объединится.
async function mergeLogin(email, password) {
  const res = await api.login(email, password);
  auth.token = res.token;
  if (TG.wa?.initData) {
    const linked = await api.telegram(TG.wa.initData);
    auth.token = linked.token;
    if (linked.notice) toast(linked.notice, 'info');
  }
  closeSheet();
  await loadGame();
  toast(T('Аккаунты объединены: теперь здесь и на сайте одно дерево', 'Accounts merged: now it’s one tree here and on the website'), 'good');
}

function openMergeLogin() {
  openSheet(credentialsForm(T('Объединить с аккаунтом сайта', 'Merge with your website account'),
    T('Введи почту и пароль, с которыми играешь на сайте. Прогресс из Telegram сложится с прогрессом на сайте.', 'Enter the email and password you use on the website. Your Telegram progress will be added to it.'),
    T('Объединить', 'Merge')), async (fd) => {
    const err = $('#sheet .form-error');
    try {
      await mergeLogin(String(fd.get('email') || '').trim(), String(fd.get('password') || ''));
    } catch (e) { err.textContent = e.message; }
    return false;
  });
}

function openAttachEmail() {
  openSheet(credentialsForm(T('Вход по почте', 'Email login'),
    T('Добавь почту и пароль, чтобы заходить в этот же аккаунт с сайта на компьютере.', 'Add an email and password to open this same account on the website.'),
    T('Добавить', 'Add')), async (fd) => {
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const err = $('#sheet .form-error');
    try {
      const res = await api.attachEmail(email, password);
      ui.user = res.user;
      closeSheet();
      toast(T('Готово: теперь можно входить на сайте по почте', 'Done: you can now log in on the website with your email'), 'good');
    } catch (e) {
      err.textContent = e.message;
      if (e.code === 'email_taken' && TG.wa) {
        err.insertAdjacentHTML('afterend', `<button type="button" class="btn btn-primary btn-wide" data-action="merge-now">${T('Объединить с этим аккаунтом', 'Merge with this account')}</button>`);
        $('#sheet')._merge = { email, password };
      }
    }
    return false;
  });
}

async function startLinkTelegram() {
  let res;
  try { res = await api.linkCode(); } catch (e) { toast(e.message, 'bad'); return; }
  openSheet(`
    <h2>${T('Привязать Telegram', 'Link Telegram')}</h2>
    <p>${T(`Открой бота @${esc(res.bot)} и нажми «Start». Бот привяжет твой Telegram к этому аккаунту. Ссылка действует 30 минут.`, `Open the bot @${esc(res.bot)} and press “Start”. The bot will link your Telegram to this account. The link works for 30 minutes.`)}</p>
    <p>${T('Если ты уже играл в Telegram, прогресс оттуда сложится с этим.', 'If you’ve already played in Telegram, that progress will be added to this one.')}</p>
    <div class="sheet-actions stack">
      <a class="btn btn-primary" href="${esc(res.url)}" target="_blank" rel="noopener">${T('Открыть бота', 'Open the bot')}</a>
      <button class="btn btn-ghost" data-action="check-link">${T('Я нажал Start', 'I pressed Start')}</button>
    </div>`);
}

async function refreshUser() {
  const res = await api.load();
  ui.user = res.user;
  if (res.data) {
    ui.save = normalizeSave(mergeSaves(res.data, ui.save), ui.user.name);
    writeLocal();
  }
  return res.user;
}

function openAddTracker() {
  const groups = SPHERES.map(sp => {
    const acts = allActions(ui.save).filter(a => a.sphere === sp.id && !ui.save.tracked.includes(a.id));
    if (!acts.length) return '';
    return `<h3>${sp.icon} ${nm(sp)}</h3><div class="act-list compact">${acts.map(a =>
      `<button class="act" data-action="track" data-id="${a.id}" style="--c:${sp.color}"><span class="act-name">${esc(nm(a))}</span>${flameChip(ui.state, a.id)}</button>`).join('')}</div>`;
  }).join('');
  openSheet(`
    <h2>${T('За каким делом следить?', 'Which activity to track?')}</h2>
    <p>${T('Огонёк будет всегда на виду, даже когда погаснет. Своё дело можно сначала добавить во вкладке «Отметить».', 'Its streak will always be visible, even when it goes out. You can add your own activity first in the “Log” tab.')}</p>
    ${groups}
    <div class="sheet-actions"><button class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button></div>`);
}

function openCustomAct(presetSphere) {
  const pre = presetSphere || (ui.filter !== 'all' ? ui.filter : null);
  const subGroups = SPHERES.map(sp => {
    const list = subsOf(ui.save, sp.id);
    return list.length ? `<optgroup label="${sp.icon} ${nm(sp)}">${list.map(sb => `<option value="${sb.id}">${esc(sb.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  openSheet(`
    <h2>${T('Своё полезное дело', 'Your own activity')}</h2>
    <form id="sheet-form">
      <label class="field"><span>${T('Что ты делаешь', 'What do you do')}</span><input name="name" required maxlength="60" placeholder="${T('Например: решал задачи по матану', 'e.g. solved calculus problems')}"></label>
      <label class="field"><span>${T('Какую ветвь растит', 'Which branch it grows')}</span>
        <select name="sphere">${SPHERES.map(s => `<option value="${s.id}"${pre === s.id ? ' selected' : ''}>${s.icon} ${nm(s)}</option>`).join('')}</select>
      </label>
      ${subGroups ? `<label class="field"><span>${T('Подветвь (необязательно)', 'Sub-branch (optional)')}</span>
        <select name="sub"><option value="">${T('Без подветви', 'No sub-branch')}</option>${subGroups}</select>
      </label>` : ''}
      <label class="field"><span>${T('Насколько это трудно', 'How hard is it')}</span>
        <select name="xp">
          <option value="6">${T('Легко, пара минут — 6 опыта', 'Easy, a few minutes — 6 XP')}</option>
          <option value="12" selected>${T('Обычно, полчаса — 12 опыта', 'Normal, half an hour — 12 XP')}</option>
          <option value="20">${T('Серьёзно, час и больше — 20 опыта', 'Serious, an hour or more — 20 XP')}</option>
          <option value="30">${T('Подвиг — 30 опыта', 'Heroic — 30 XP')}</option>
        </select>
      </label>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${T('Добавить', 'Add')}</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim();
    if (!name) return false;
    const sub = fd.get('sub') ? findSub(ui.save, fd.get('sub')) : null;
    ui.save.custom.acts.push({
      id: 'ca_' + uid(), name, sphere: sub ? sub.sphere : fd.get('sphere'), xp: Number(fd.get('xp')) || 12,
      ...(sub ? { sub: sub.id } : {}),
    });
    toast(T('Дело добавлено в список', 'Activity added to the list'), 'info');
    commit();
  });
}

function openCustomBad() {
  openSheet(`
    <h2>${T('Своя вредная привычка', 'Your own bad habit')}</h2>
    <form id="sheet-form">
      <label class="field"><span>${T('Что мешает', 'What holds you back')}</span><input name="name" required maxlength="60" placeholder="${T('Например: ночные сериалы', 'e.g. late-night TV shows')}"></label>
      <fieldset class="field"><legend>${T('Какие ветви страдают', 'Which branches suffer')}</legend>
        <div class="check-grid">${SPHERES.map(s => `<label class="check"><input type="checkbox" name="sp" value="${s.id}"> ${s.icon} ${nm(s)}</label>`).join('')}</div>
      </fieldset>
      <label class="field"><span>${T('Насколько вредит', 'How harmful')}</span>
        <select name="dmg">
          <option value="5">${T('Немного — −5 силы', 'A little — −5 vitality')}</option>
          <option value="10" selected>${T('Заметно — −10 силы', 'Noticeably — −10 vitality')}</option>
          <option value="15">${T('Сильно — −15 силы', 'A lot — −15 vitality')}</option>
        </select>
      </label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${T('Отмена', 'Cancel')}</button>
        <button class="btn btn-primary" type="submit">${T('Добавить', 'Add')}</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim();
    const spheres = fd.getAll('sp');
    if (!name || !spheres.length) {
      $('#sheet .form-error').textContent = T('Напиши название и выбери хотя бы одну ветвь', 'Enter a name and pick at least one branch');
      return false;
    }
    const dmg = Number(fd.get('dmg')) || 10;
    ui.save.custom.bads.push({ id: 'cb_' + uid(), name, damage: Object.fromEntries(spheres.map(s => [s, dmg])) });
    toast(T('Привычка добавлена', 'Habit added'), 'info');
    commit();
  });
}

// ---------------------------------------------------------------------------
// Уведомления
// ---------------------------------------------------------------------------

function toast(text, kind = 'info') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); }, kind === 'level' ? 4200 : 2800);
}

// ---------------------------------------------------------------------------
// Обработка нажатий
// ---------------------------------------------------------------------------

// Когда игрок возвращается в приложение (например, отметил что-то на другом
// устройстве), подтягиваем свежую версию с сервера.
let lastPull = 0;
async function pullFromServer() {
  if (!ui.save || !auth.token || Date.now() - lastPull < 5000) return;
  lastPull = Date.now();
  try {
    const res = await api.load();
    if (res.user) ui.user = res.user;
    if (!res.data || !ui.save) return;
    const merged = normalizeSave(mergeSaves(res.data, ui.save), ui.user.name);
    if (!sameSave(merged, ui.save)) {
      ui.save = merged;
      writeLocal();
      if ($('#sheet').hidden && !tourActive()) render();
    }
    if (!sameSave(merged, normalizeSave(res.data, ui.user.name))) queueSync();
  } catch { /* нет связи — попробуем позже */ }
}

function bindEvents() {
  document.addEventListener('input', (e) => {
    if (e.target.id === 'diary-search') {
      ui.diaryQuery = e.target.value;
      const list = $('#diary-list');
      if (list) list.innerHTML = diaryList();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullFromServer(); });
  window.addEventListener('focus', pullFromServer);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#sheet').hidden) closeSheet();
      else if (ui.zoom) zoomOut();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#tree .branch')) {
      e.preventDefault();
      zoomTo(e.target.closest('.branch').dataset.sphere);
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#tree [data-sub]')) {
      e.preventDefault();
      openSubMenu(e.target.closest('[data-sub]').dataset.sub);
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#tree .add-sub')) {
      e.preventDefault();
      openAddSub(ui.zoom);
    }
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'auth-form') return submitAuth(e.target);
    if (e.target.id === 'sheet-form') {
      const fn = $('#sheet')._onSubmit;
      if (!fn) return;
      const result = fn(new FormData(e.target));
      // Асинхронные формы сами закрывают окно, когда всё получилось.
      if (!(result instanceof Promise) && result !== false) closeSheet();
    }
  });
}

function onClick(e) {
  const branch = e.target.closest('#tree .branch');
  if (branch) return zoomTo(branch.dataset.sphere);
  const subEl = e.target.closest('#tree [data-sub]');
  if (subEl) return openSubMenu(subEl.dataset.sub);

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;

  switch (a) {
    case 'retry': return loadGame();
    case 'auth-mode': ui.authMode = el.dataset.mode; return renderAuth();
    case 'set-lang': {
      if (el.dataset.lang === getLang()) return;
      setLang(el.dataset.lang);
      applyStaticTexts();
      if (!ui.save) return renderAuth();
      ui.save.lang = getLang();
      const inSettings = !$('#sheet').hidden;
      commit();
      if (inSettings) openSettings();
      return;
    }
    case 'tab':
      ui.tab = el.dataset.tab;
      render();
      return window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    case 'open-sphere': return zoomTo(el.dataset.sphere);
    case 'zoom-out': return zoomOut();
    case 'tour-again':
      closeSheet();
      return startTour(planTour(ui.save.seenTips, { full: true }));
    case 'hist-mode': ui.histMode = el.dataset.mode; return render();
    case 'diary-sphere': ui.diarySphere = el.dataset.sphere; return render();
    case 'diary-export': return exportDiary();
    case 'note': return openNote(id);
    case 'note-delete': {
      const e2 = ui.save.events.find(x => x.id === id);
      if (e2) { delete e2.note; delete e2.mood; e2.ne = Date.now(); commit(); toast(T('Заметка удалена', 'Note deleted'), 'info'); }
      return closeSheet();
    }
    case 'branch-notes':
      ui.tab = 'history'; ui.histMode = 'diary'; ui.diarySphere = el.dataset.sphere; ui.zoom = null;
      render();
      return window.scrollTo({ top: 0, behavior: 'auto' });
    case 'sub-period': ui.subPeriod = el.dataset.period; return render();
    case 'add-sub': return openAddSub(ui.zoom);
    case 'fill-sub': {
      const input = $('#sheet input[name=name]');
      if (input) { input.value = el.dataset.name; input.focus(); }
      return;
    }
    case 'sub-menu': return openSubMenu(id);
    case 'log-time': return openLogTime(id);
    case 'pick-time': {
      const input = $('#sheet input[name=m]');
      if (input) input.value = el.dataset.m;
      for (const b of document.querySelectorAll('#sheet .time-chip')) b.classList.toggle('is-on', b === el);
      return;
    }
    case 'time-day': {
      ui.logDay = Number(el.dataset.day);
      for (const b of document.querySelectorAll('#sheet [data-action=time-day]')) b.setAttribute('aria-selected', String(b === el));
      return;
    }
    case 'delete-sub': {
      const sb = findSub(ui.save, id);
      return confirmSheet(T('Удалить подветвь?', 'Delete sub-branch?'), T(`«${esc(sb.name)}» исчезнет с дерева. Опыт останется в ветви «${nm(SPHERE_BY_ID[sb.sphere])}», отметки — в истории.`, `“${esc(sb.name)}” will disappear from the tree. Its XP stays in the ${nm(SPHERE_BY_ID[sb.sphere])} branch, entries stay in history.`),
        T('Удалить', 'Delete'), () => { sb.archived = true; commit(); toast(T('Подветвь удалена', 'Sub-branch deleted'), 'info'); }, true);
    }
    case 'filter': ui.filter = el.dataset.sphere; return render();
    case 'skill-sphere': ui.skillSphere = el.dataset.sphere; return render();
    case 'mat-sphere': ui.matSphere = el.dataset.sphere; return render();
    case 'log-day': ui.logDay = Number(el.dataset.day); return render();
    case 'log-act':
      addEvent('act', id, el.dataset.today ? Date.now() : eventTime());
      return;
    case 'log-bad': {
      const b = findBad(ui.save, id);
      return confirmSheet(T('Отметить срыв?', 'Log a slip?'), T(`«${esc(nm(b))}». Листья на затронутых ветвях пожелтеют. Это нормально — главное видеть, что происходит, и не сдаваться.`, `“${esc(nm(b))}”. Leaves on the affected branches will turn yellow. That’s okay — what matters is seeing what’s going on and not giving up.`),
        T('Отметить честно', 'Log it honestly'), () => addEvent('bad', id));
    }
    case 'custom-act': return openCustomAct(el.dataset.sphere);
    case 'add-tracker': return openAddTracker();
    case 'attach-email': return openAttachEmail();
    case 'merge-login': return openMergeLogin();
    case 'merge-now': {
      const m = $('#sheet')._merge;
      if (m) mergeLogin(m.email, m.password).catch(err => toast(err.message, 'bad'));
      return;
    }
    case 'link-tg': return startLinkTelegram();
    case 'feedback': return openFeedback();
    case 'delete-account': return openDeleteAccount();
    case 'remind-off': return setReminders(true);
    case 'remind-on': return setReminders(false);
    case 'check-link':
      refreshUser().then((u) => {
        closeSheet();
        render();
        toast(u.telegram ? T('Telegram привязан: теперь одно дерево на сайте и в Telegram', 'Telegram linked: now it’s one tree on the website and in Telegram') : T('Пока не привязан. Открой бота и нажми Start', 'Not linked yet. Open the bot and press Start'), u.telegram ? 'good' : 'info');
        if (u.telegram) openSettings();
      }).catch(err => toast(err.message, 'bad'));
      return;
    case 'unlink-tg':
      return confirmSheet(T('Отвязать Telegram?', 'Unlink Telegram?'), T('Прогресс останется в этом аккаунте. Открыв бота снова, ты начнёшь новое дерево, пока не привяжешь Telegram обратно.', 'Your progress stays in this account. If you open the bot again, you’ll start a new tree until you link Telegram back.'),
        T('Отвязать', 'Unlink'), async () => {
          try { ui.user = (await api.unlinkTelegram()).user; toast(T('Telegram отвязан', 'Telegram unlinked'), 'info'); } catch (e) { toast(e.message, 'bad'); }
        }, true);
    case 'track':
      if (!ui.save.tracked.includes(id)) ui.save.tracked.push(id);
      closeSheet(); commit(); toast(T('Огонёк добавлен', 'Streak added'), 'info');
      return;
    case 'untrack':
      ui.save.tracked = ui.save.tracked.filter(x => x !== id);
      commit();
      return;
    case 'custom-bad': return openCustomBad();
    case 'unlock-skill': {
      const sk = SKILL_BY_ID[id];
      return confirmSheet(T('Навык освоен?', 'Skill mastered?'), T(`«${esc(nm(sk))}». Отмечай, только если это правда получилось. Если поторопился — навык можно откатить.`, `“${esc(nm(sk))}”. Only mark it if you really did it. If you were too quick, you can undo it.`),
        T('Да, освоил', 'Yes, I did it'), () => addEvent('skill', id, Date.now()));
    }
    case 'undo-skill': {
      const deps = dependentSkills(ui.state, id);
      const ev = [...ui.save.events].reverse().find(e2 => e2.k === 'skill' && e2.ref === id && ui.state.effects[e2.id]?.valid);
      const depList = deps.map(d => esc(nm(SKILL_BY_ID[d]))).join(', ');
      const depText = deps.length ? '<br><br>' + T(`Вместе с ним закроются зависимые навыки: ${depList}.`, `Dependent skills will be locked too: ${depList}.`) : '';
      return confirmSheet(T('Откатить навык?', 'Undo this skill?'), T(`«${esc(nm(SKILL_BY_ID[id]))}» снова станет неосвоенным, а бонус опыта уйдёт.`, `“${esc(nm(SKILL_BY_ID[id]))}” will be un-mastered and its XP bonus removed.`) + depText,
        T('Откатить', 'Undo'), () => { if (ev) removeEvent(ev.id); }, true);
    }
    case 'learn': return addEvent('mat', id, Date.now());
    case 'undo-mat': {
      const ev = ui.save.events.find(e2 => e2.k === 'mat' && e2.ref === id);
      return confirmSheet(T('Отменить отметку?', 'Undo this entry?'), T('Материал снова станет неизученным, опыт за него уйдёт.', 'The resource will be marked as not done and its XP removed.'), T('Отменить отметку', 'Undo entry'), () => { if (ev) removeEvent(ev.id); }, true);
    }
    case 'undo': {
      return confirmSheet(T('Отменить отметку?', 'Undo this entry?'), T('Дерево пересчитается так, будто этого не было. Навыки, которые держались на этом опыте, могут закрыться.', 'The tree will be recalculated as if it never happened. Skills that relied on this XP may get locked.'),
        T('Отменить', 'Undo'), () => removeEvent(id), true);
    }
    case 'goto-skills':
      ui.skillSphere = el.dataset.sphere; ui.tab = 'skills'; closeSheet(); render();
      return;
    case 'settings': return openSettings();
    case 'theme':
      ui.save.theme = id;
      commit();
      return openSettings();
    case 'save-name': {
      const v = $('#set-name').value.trim().slice(0, 40);
      ui.save.name = v; commit(); toast(T('Имя сохранено', 'Name saved'), 'info');
      return;
    }
    case 'reset':
      return confirmSheet(T('Начать заново?', 'Start over?'), T('Весь прогресс, история и свои привычки будут удалены. Стиль оформления останется. Это нельзя отменить.', 'All progress, history and your own habits will be deleted. Your style stays. This can’t be undone.'),
        T('Удалить прогресс', 'Delete progress'), () => {
          const { theme, lang, seenTips } = ui.save;
          ui.save = newSave(ui.save.name);
          Object.assign(ui.save, { theme, lang, seenTips, resetAt: Date.now() });
          ui.selected = null; commit();
        }, true);
    case 'logout':
      auth.token = null;
      ui.user = null; ui.save = null; ui.selected = null;
      closeSheet();
      applyTheme(THEME_BY_ID.spring);
      return showAuth();
    case 'close-sheet':
      closeSheet();
      if (ui.selected) { ui.selected = null; render(); }
      return;
    case 'sheet-ok': {
      const fn = $('#sheet')._onSubmit;
      closeSheet();
      if (fn) fn();
      return;
    }
  }
}

start();
