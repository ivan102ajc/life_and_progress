// Интерфейс игры: экраны, кнопки, сохранение.

import { SPHERES, SPHERE_BY_ID, SKILLS, SKILL_BY_ID, MATERIALS, RULES } from './data.js';
import {
  newSave, normalizeSave, compute, uid, allActions, allBadHabits, findAction, findBad,
  findMaterial, countOnDay, skillStatus, dependentSkills, dayKey,
  findSub, subsOf, SUB_RULES,
  STREAK_MILESTONES, nextMilestone,
} from './game.js';
import { THEMES, THEME_BY_ID, applyTheme } from './themes.js';
import { renderTree, renderBranch, subColor, formatMinutes } from './tree.js';
import { api, auth } from './api.js';
import { mergeSaves, sameSave } from './sync.js';

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
};

// ---------------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------------

async function start() {
  applyTheme(THEME_BY_ID.spring);
  bindEvents();

  const tg = await initTelegram();
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
  const needBack = !$('#sheet').hidden || (ui.save && (ui.tab !== 'tree' || ui.zoom));
  try { needBack ? wa.BackButton?.show() : wa.BackButton?.hide(); } catch { /* старая версия */ }
}

function onTelegramBack() {
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
    if (!server || !sameSave(server, ui.save)) queueSync();
    showScreen('game');
    render();
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
  $('#game').hidden = name !== 'game';
  $('#loading').hidden = name !== 'loading' && name !== 'error';
  if (name === 'loading') $('#loading').innerHTML = `<div class="loader-seed"></div><p>Поливаем дерево…</p>`;
  if (name === 'error') {
    $('#loading').innerHTML = `<p class="error-text">${esc(message)}</p><button class="btn" data-action="retry">Попробовать снова</button>`;
  }
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
      <h1 class="logo">Древо жизни</h1>
      <p class="auth-lead">Каждое полезное дело в жизни растит ветвь твоего дерева. Вредные привычки заставляют листья желтеть. Прогресс, который видно.</p>
      <div class="segmented" role="tablist">
        <button role="tab" aria-selected="${reg}" data-action="auth-mode" data-mode="register">Новый игрок</button>
        <button role="tab" aria-selected="${!reg}" data-action="auth-mode" data-mode="login">Уже играю</button>
      </div>
      <form id="auth-form" novalidate>
        ${reg ? `<label class="field"><span>Как тебя зовут</span><input name="name" autocomplete="nickname" maxlength="40" placeholder="Иван"></label>` : ''}
        <label class="field"><span>Почта</span><input name="email" type="email" autocomplete="email" required placeholder="you@mail.ru"></label>
        <label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6" placeholder="Не короче 6 символов"></label>
        <p class="form-error" role="alert">${esc(error)}</p>
        <button class="btn btn-primary btn-wide" type="submit">${reg ? 'Посадить своё дерево' : 'Войти'}</button>
      </form>
    </div>`;
}

async function submitAuth(form) {
  const fd = new FormData(form);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const name = String(fd.get('name') || '').trim();
  if (!email || !password) return renderAuth('Заполните почту и пароль');
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Секунду…';
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
        if ($('#sheet').hidden) render();
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
  el.title = { saved: 'Прогресс сохранён', pending: 'Сохраняем…', offline: 'Не удалось сохранить: ' + msg }[status];
  el.querySelector('span').textContent = { saved: 'Сохранено', pending: 'Сохраняем', offline: 'Нет связи' }[status];
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
  haptic(k === 'bad' ? 'warning' : after.player.level > before.player.level || after.effects[e.id]?.streak ? 'success' : 'light');
  commit();
  if (!reduceMotion) {
    const sphere = Object.keys(after.effects[e.id]?.gains || {})[0];
    if (sphere) requestAnimationFrame(() => pulse(sphere));
  }
}

function removeEvent(id) {
  const before = ui.state;
  ui.save.events = ui.save.events.filter(e => e.id !== id);
  ui.save.deleted = [...ui.save.deleted, id];
  const after = compute(ui.save);
  commit();
  if (after.player.level < before.player.level) toast(`Общий уровень откатился до ${after.player.level}`, 'info');
  else toast('Отметка отменена — дерево пересчитано', 'info');
}

function reportChange(before, after, e) {
  const eff = after.effects[e.id];
  if (!eff || !eff.valid) { toast('Это не засчиталось', 'info'); return; }
  for (const [sid, xp] of Object.entries(eff.gains)) {
    const sp = SPHERE_BY_ID[sid];
    const sub = eff.sub ? findSub(ui.save, eff.sub) : null;
    const note = eff.repeat ? ' (повтор за день — опыта меньше)'
      : eff.over ? ` (больше ${SUB_RULES.dailyFullMinutes / 60} ч за день — опыт медленнее)` : '';
    const where = sub ? `${sp.icon} ${sub.name}${eff.minutes ? ', ' + formatMinutes(eff.minutes) : ''}` : `${sp.icon} ${sp.name}`;
    toast(`+${xp} опыта: ${where}${note}`, 'good');
    const lb = before.spheres[sid].level; const la = after.spheres[sid].level;
    if (la > lb) toast(`Ветвь «${sp.name}» выросла до уровня ${la}`, 'level');
  }
  const losses = Object.entries(eff.losses);
  if (losses.length) {
    toast('Листья желтеют: ' + losses.map(([sid, v]) => `${SPHERE_BY_ID[sid].name} −${v}`).join(', '), 'bad');
  }
  if (eff.streak) {
    const a = findAction(ui.save, e.ref);
    toast(`🔥 ${eff.streak.days} ${daysWord(eff.streak.days)} подряд: «${a?.name}». Бонус +${eff.streak.bonus}`, 'level');
  } else if (e.k === 'act') {
    const k = after.streaks[e.ref];
    if (k && k.days >= 2 && after.effects[e.id]?.repeat === 0) toast(`🔥 Огонёк: ${k.days} ${daysWord(k.days)} подряд`, 'info');
  }
  if (after.player.level > before.player.level) toast(`Общий уровень ${after.player.level}!`, 'level');
  if (after.stage.name !== before.stage.name && after.player.level > before.player.level) {
    toast(`Новая стадия: ${after.stage.name}`, 'level');
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
  const title = k.status === 'lit' ? 'дней подряд' : 'дней подряд — продли сегодня';
  return `<span class="flame-chip is-${k.status}" title="${k.days} ${title}">${FLAME}${k.days}</span>`;
}

function daysWord(n) {
  const a = n % 10; const b = n % 100;
  if (a === 1 && b !== 11) return 'день';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дня';
  return 'дней';
}

function streaksBlock(st) {
  const ids = new Set(ui.save.tracked);
  for (const [id, k] of Object.entries(st.streaks)) if (k.days >= 2) ids.add(id);
  const items = [...ids].map(id => ({ a: findAction(ui.save, id), k: st.streaks[id] || { days: 0, best: 0, status: 'out' } }))
    .filter(x => x.a && !x.a.archived)
    .sort((x, y) => (y.k.days - x.k.days) || x.a.name.localeCompare(y.a.name));

  const cards = items.map(({ a, k }) => {
    const sp = SPHERE_BY_ID[a.sphere];
    const pinned = ui.save.tracked.includes(a.id);
    const next = nextMilestone(k.days);
    let status;
    if (k.status === 'lit') status = 'Горит: сегодня уже сделано';
    else if (k.status === 'risk') status = 'Сделай сегодня, иначе огонёк погаснет';
    else status = k.best ? `Погас. Рекорд: ${k.best} ${daysWord(k.best)}` : 'Ещё не зажжён — начни сегодня';
    const goal = next ? `<small class="muted">До бонуса +${STREAK_MILESTONES[next]}: ещё ${next - k.days} ${daysWord(next - k.days)}</small>` : '';
    const btn = k.status === 'lit'
      ? `<span class="tr-done">✓ Сегодня</span>`
      : `<button class="btn btn-small btn-primary" data-action="log-act" data-id="${a.id}" data-today="1">Сделал сегодня</button>`;
    return `
      <div class="tracker is-${k.status}" style="--c:${sp.color}">
        <div class="tr-flame">${FLAME}<b>${k.days}</b></div>
        <div class="tr-body">
          <strong>${sp.icon} ${esc(a.name)}</strong>
          <small>${status}</small>
          ${goal}
        </div>
        <div class="tr-side">
          ${btn}
          ${pinned ? `<button class="tr-unpin" data-action="untrack" data-id="${a.id}" aria-label="Не следить за огоньком">Убрать</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="panel-head">
      <h2>Огоньки</h2>
      <p class="muted">Делай одно и то же дело несколько дней подряд — загорится огонёк. На 3, 7, 14, 30, 60 и 100 день — бонус опыта. Пропустил день — огонёк гаснет.</p>
    </div>
    ${cards ? `<div class="tracker-list">${cards}</div>` : ''}
    <button class="btn btn-ghost btn-wide" data-action="add-tracker">Следить за огоньком</button>`;
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
      <div class="tb-level" style="--p:${Math.round(p.progress * 100)}" aria-label="Уровень ${p.level}">${p.level}</div>
      <div class="tb-text">
        <strong>${esc(st.stage.name)}</strong>
        <span>${p.into} / ${p.need} опыта до уровня ${p.level + 1}</span>
      </div>
    </div>
    <div class="tb-right">
      <button class="streak${st.streak ? '' : ' is-zero'}" data-action="tab" data-tab="log" title="Дней подряд с полезными делами. Нажми, чтобы открыть огоньки">
        ${FLAME}
        <span>${st.streak}</span>
      </button>
      <div id="sync" class="sync" data-status="${ui.sync}"><i></i><span></span></div>
      <button class="icon-btn" data-action="settings" aria-label="Настройки и стиль">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
      </button>
    </div>`;
  setSync(ui.sync);
}

function sceneCaption(st) {
  if (ui.zoom) {
    const sp = SPHERE_BY_ID[ui.zoom];
    return `<div class="zoom-bar">
      <button class="caption-chip" data-action="zoom-out">← Всё дерево</button>
      <span class="caption-text">${sp.icon} ${sp.name} крупным планом. Нажми на подветвь, чтобы отметить время.</span>
    </div>`;
  }
  if (ui.selected) {
    const sp = SPHERE_BY_ID[ui.selected];
    const s = st.spheres[ui.selected];
    return `<button class="caption-chip" data-action="open-sphere" data-sphere="${sp.id}">${sp.icon} ${sp.name}: ${s.started ? `уровень ${s.level}, сила ${s.health}%` : 'ещё почка'}</button>`;
  }
  const next = st.stage.next;
  return `<p class="caption-text">${next ? `До стадии «${next.name}» — общий уровень ${next.level}` : 'Высшая стадия достигнута'}. Нажми на ветку, чтобы рассмотреть её.</p>`;
}

function healthWord(h) {
  if (h >= 85) return 'цветёт';
  if (h >= 60) return 'в порядке';
  if (h >= 35) return 'желтеет';
  return 'сохнет';
}

// --- Вкладка «Дерево» ---
function panelTree(st) {
  const started = SPHERES.filter(s => st.spheres[s.id].started).length;
  const intro = st.totalXp === 0 ? `
    <div class="callout">
      <h3>С чего начать</h3>
      <p>Твоё дерево пока росток с восемью почками — по одной на каждую сферу жизни. Открой «Отметить» и отметь что-то полезное, что ты сделал сегодня: почка превратится в ветку.</p>
      <button class="btn btn-primary" data-action="tab" data-tab="log">Отметить первое дело</button>
    </div>` : '';
  const rows = SPHERES.map(sp => {
    const s = st.spheres[sp.id];
    const idle = s.started && s.idleDays > RULES.idleGraceDays ? `<span class="warn">не поливали ${s.idleDays} дн.</span>` : '';
    return `
      <button class="sphere-row${ui.selected === sp.id ? ' is-selected' : ''}" data-action="open-sphere" data-sphere="${sp.id}" style="--c:${sp.color}">
        <span class="sr-icon">${sp.icon}</span>
        <span class="sr-main">
          <span class="sr-top"><strong>${sp.name}</strong><span class="sr-lvl">${s.started ? `ур. ${s.level}` : 'почка'}</span></span>
          <span class="bar"><i style="width:${Math.round(s.progress * 100)}%"></i></span>
          <span class="sr-sub">${s.started ? `${s.into}/${s.need} опыта · сила ${s.health}%, ${healthWord(s.health)}` : 'ещё не начато'}${s.subList.length ? ` · ${s.subList.length} ${subWord(s.subList.length)}` : ''} ${idle}</span>
        </span>
      </button>`;
  }).join('');
  return `
    ${intro}
    <div class="panel-head">
      <h2>Ветви</h2>
      <p class="muted">${started} из ${SPHERES.length} сфер растут · ${st.totalXp} опыта всего</p>
    </div>
    <div class="sphere-list">${rows}</div>
    <details class="rules">
      <summary>Как растёт дерево</summary>
      <ul>
        <li>Каждое полезное дело даёт опыт своей ветви. Ветвь становится длиннее, на ней больше листьев.</li>
        <li>Повтор одного и того же дела за день даёт меньше опыта: 100%, потом 50%, потом 20%. Так нельзя «нафармить» уровень.</li>
        <li>Освоенный навык — это новая веточка с плодом и большой бонус опыта.</li>
        <li>Вредные привычки отнимают жизненную силу: листья желтеют и опадают, а ветвь растёт медленнее (до половины скорости).</li>
        <li>Если ветвь не поливать больше ${RULES.idleGraceDays} дней, она понемногу сохнет. Любое полезное дело лечит её.</li>
        <li>Отметил то, чего не было? Любую отметку можно отменить в «Истории» — дерево честно пересчитается.</li>
      </ul>
    </details>`;
}

// --- Вкладка «Отметить» ---
function panelLog(st) {
  const t = eventTime();
  const chips = [{ id: 'all', name: 'Все', icon: '' }, ...SPHERES].map(s =>
    `<button class="chip${ui.filter === s.id ? ' is-on' : ''}" data-action="filter" data-sphere="${s.id}">${s.icon ? s.icon + ' ' : ''}${s.name}</button>`
  ).join('');
  const acts = allActions(ui.save).filter(a => ui.filter === 'all' || a.sphere === ui.filter);
  const actHtml = acts.map(a => {
    const n = countOnDay(st, a.id, t);
    const f = RULES.repeatFactors[Math.min(n, RULES.repeatFactors.length - 1)];
    const sp = SPHERE_BY_ID[a.sphere];
    return `
      <button class="act${n ? ' is-done' : ''}" data-action="log-act" data-id="${a.id}" style="--c:${sp.color}">
        <span class="act-icon">${sp.icon}</span>
        <span class="act-name">${esc(a.name)}</span>
        ${flameChip(st, a.id)}
        <span class="act-xp">+${Math.round(a.xp * f)}${n ? `<small>×${n}</small>` : ''}</span>
      </button>`;
  }).join('');

  const bads = allBadHabits(ui.save).map(b => {
    const dmg = Object.entries(b.damage).map(([sid, v]) => `${SPHERE_BY_ID[sid]?.icon || ''}−${v}`).join(' ');
    const clean = st.cleanDays[b.id];
    const cleanText = clean === undefined ? 'ни разу' : clean === 0 ? 'сегодня' : `${clean} дн. без срыва`;
    return `
      <button class="act act-bad" data-action="log-bad" data-id="${b.id}">
        <span class="act-name">${esc(b.name)}</span>
        <span class="act-meta">${cleanText}</span>
        <span class="act-xp">${dmg}</span>
      </button>`;
  }).join('');

  return `
    ${streaksBlock(st)}
    <div class="panel-head spaced">
      <h2>Что ты сделал?</h2>
      <div class="segmented small">
        <button aria-selected="${ui.logDay === 0}" data-action="log-day" data-day="0">Сегодня</button>
        <button aria-selected="${ui.logDay === 1}" data-action="log-day" data-day="1">Вчера</button>
      </div>
    </div>
    <div class="chips">${chips}</div>
    <div class="act-list">${actHtml || '<p class="muted">Здесь пока пусто.</p>'}</div>
    <button class="btn btn-ghost btn-wide" data-action="custom-act">Добавить своё дело</button>

    <div class="panel-head spaced">
      <h2>Вредные привычки</h2>
      <p class="muted">Отмечай честно: так ты увидишь, что на самом деле мешает расти.</p>
    </div>
    <div class="act-list">${bads}</div>
    <button class="btn btn-ghost btn-wide" data-action="custom-bad">Добавить свою привычку</button>`;
}

// --- Вкладка «Навыки» ---
function panelSkills(st) {
  const chips = SPHERES.map(s =>
    `<button class="chip${ui.skillSphere === s.id ? ' is-on' : ''}" data-action="skill-sphere" data-sphere="${s.id}">${s.icon} ${s.name}</button>`
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
      action = `<button class="btn btn-small btn-ghost" data-action="undo-skill" data-id="${sk.id}">Откатить</button>`;
      note = 'Освоено';
    } else if (status === 'ready') {
      action = `<button class="btn btn-small btn-primary" data-action="unlock-skill" data-id="${sk.id}">Я освоил</button>`;
      note = `+${bonus} опыта`;
    } else if (status === 'needLevel') {
      note = `Откроется на уровне ${sk.minLevel} (сейчас ${s.level})`;
    } else {
      note = `Сначала: ${SKILL_BY_ID[sk.parent].name}`;
    }
    return `
      <li class="skill is-${status}" style="--d:${depth(sk)};--c:${sp.color}">
        <span class="skill-dot" aria-hidden="true"></span>
        <span class="skill-body">
          <strong>${esc(sk.name)}</strong>
          <small>${note}</small>
        </span>
        ${action}
      </li>`;
  }).join('');

  return `
    <div class="panel-head">
      <h2>Навыки</h2>
      <p class="muted">Каждый освоенный навык — новая веточка с плодом. Отмечай, только когда действительно получилось.</p>
    </div>
    <div class="chips">${chips}</div>
    <div class="skill-summary" style="--c:${sp.color}">
      <span>${sp.icon}</span>
      <div><strong>${sp.name}</strong><span class="muted">Уровень ${s.level} · освоено ${s.unlocked.length} из ${list.length}</span></div>
    </div>
    <ul class="skill-tree">${nodes}</ul>`;
}

// --- Вкладка «Материалы» ---
function panelMaterials(st) {
  const chips = [{ id: 'all', name: 'Все', icon: '' }, ...SPHERES].map(s =>
    `<button class="chip${ui.matSphere === s.id ? ' is-on' : ''}" data-action="mat-sphere" data-sphere="${s.id}">${s.icon ? s.icon + ' ' : ''}${s.name}</button>`
  ).join('');
  const items = MATERIALS.filter(m => ui.matSphere === 'all' || m.sphere === ui.matSphere).map(m => {
    const sp = SPHERE_BY_ID[m.sphere];
    const done = st.learned.has(m.id);
    return `
      <article class="mat${done ? ' is-done' : ''}" style="--c:${sp.color}">
        <div class="mat-kind">${sp.icon} ${m.kind}</div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.note)}</p>
        <div class="mat-actions">
          ${m.url ? `<a class="btn btn-small btn-ghost" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Открыть</a>` : '<span class="muted small">Ищи в библиотеке или книжном</span>'}
          ${done
            ? `<button class="btn btn-small btn-ghost" data-action="undo-mat" data-id="${m.id}">Изучено ✓</button>`
            : `<button class="btn btn-small btn-primary" data-action="learn" data-id="${m.id}">Изучил · +${RULES.materialXp}</button>`}
        </div>
      </article>`;
  }).join('');
  return `
    <div class="panel-head">
      <h2>Материалы</h2>
      <p class="muted">Книги, курсы и сайты, которые помогут прокачать каждую ветвь.</p>
    </div>
    <div class="chips">${chips}</div>
    <div class="mat-list">${items}</div>`;
}

// --- Вкладка «История» ---
function panelHistory(st) {
  const events = [...ui.save.events].sort((a, b) => b.t - a.t).slice(0, 200);
  if (!events.length) {
    return `<div class="panel-head"><h2>История</h2></div>
      <div class="callout"><p>Здесь будут все твои отметки. Любую можно отменить, если понял, что поторопился.</p>
      <button class="btn btn-primary" data-action="tab" data-tab="log">Отметить первое дело</button></div>`;
  }
  const fmtDay = (t) => {
    const k = dayKey(t);
    if (k === dayKey(Date.now())) return 'Сегодня';
    if (k === dayKey(Date.now() - DAY)) return 'Вчера';
    return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
  };
  let html = '';
  let lastDay = '';
  for (const e of events) {
    const d = fmtDay(e.t);
    if (d !== lastDay) { html += `<h3 class="hist-day">${d}</h3>`; lastDay = d; }
    const eff = st.effects[e.id] || { gains: {}, losses: {} };
    let title = '';
    let icon = '';
    if (e.k === 'act') { const a = findAction(ui.save, e.ref); title = a?.name || 'Удалённое дело'; icon = SPHERE_BY_ID[a?.sphere]?.icon || '•'; }
    if (e.k === 'time') { const sb = findSub(ui.save, e.ref); title = `${sb?.name || 'Удалённая подветвь'} · ${formatMinutes(Number(e.m) || 0)}`; icon = SPHERE_BY_ID[sb?.sphere]?.icon || '⏱'; }
    if (e.k === 'bad') { const b = findBad(ui.save, e.ref); title = b?.name || 'Удалённая привычка'; icon = '🥀'; }
    if (e.k === 'skill') { const k = SKILL_BY_ID[e.ref]; title = 'Навык: ' + (k?.name || '?'); icon = '🌱'; }
    if (e.k === 'mat') { const m = findMaterial(e.ref); title = 'Изучил: ' + (m?.title || '?'); icon = '📖'; }
    const fx = [
      ...Object.entries(eff.gains).map(([sid, v]) => `<span class="fx-good">+${v} ${SPHERE_BY_ID[sid].name}</span>`),
      ...Object.entries(eff.losses).map(([sid, v]) => `<span class="fx-bad">−${v} сила: ${SPHERE_BY_ID[sid].name}</span>`),
    ].join(' ') || '<span class="muted">не засчитано</span>';
    const time = new Date(e.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    html += `
      <div class="hist${eff.valid === false ? ' is-void' : ''}">
        <span class="hist-icon">${icon}</span>
        <span class="hist-body"><strong>${esc(title)}</strong><small>${time} · ${fx}</small></span>
        <button class="btn btn-small btn-ghost" data-action="undo" data-id="${e.id}">Отменить</button>
      </div>`;
  }
  return `
    <div class="panel-head">
      <h2>История</h2>
      <p class="muted">Понял, что был не так хорош, как отметил? Отмени — дерево пересчитается честно.</p>
    </div>
    <div class="hist-list">${html}</div>`;
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
      <button class="btn btn-ghost" data-action="close-sheet">Отмена</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="sheet-ok">${okLabel}</button>
    </div>`, () => { onOk(); });
}

// ---------------------------------------------------------------------------
// Приближение к ветви и подветви
// ---------------------------------------------------------------------------

function subWord(n) {
  const a = n % 10; const b = n % 100;
  if (a === 1 && b !== 11) return 'подветвь';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'подветви';
  return 'подветвей';
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
  const periodName = { week: 'за неделю', month: 'за месяц', all: 'за всё время' }[ui.subPeriod];

  let insight = '';
  if (subs.length >= 2 && sum > 0) {
    const top = rows[0];
    const neglected = subs.filter(x => x.idleDays == null || x.idleDays >= SUB_RULES.neglectDays)
      .sort((a, b) => (b.idleDays ?? 1e9) - (a.idleDays ?? 1e9))[0];
    insight = `<p class="insight">Больше всего ${byMinutes ? 'времени' : 'опыта'} ${periodName}: <b>${esc(top.name)}</b> — ${Math.round(periodValue(top, kind) / sum * 100)}%.` +
      (neglected ? ` Давно не поливал: <b>${esc(neglected.name)}</b>${neglected.idleDays == null ? ' (ещё ни разу)' : ` — ${neglected.idleDays} ${daysWord(neglected.idleDays)}`}.` : '') + '</p>';
  }

  const subRows = rows.map((sb) => {
    const i = subs.indexOf(sb);
    const v = periodValue(sb, kind);
    const minutesP = periodValue(sb, 'minutes');
    const idle = sb.idleDays == null ? 'ещё не начато' : sb.idleDays === 0 ? 'сегодня' : sb.idleDays === 1 ? 'вчера' : `${sb.idleDays} ${daysWord(sb.idleDays)} назад`;
    const warn = sb.idleDays == null || sb.idleDays >= SUB_RULES.neglectDays;
    return `
      <div class="sub-row" style="--c:${subColor(sp.color, i)}">
        <button class="sub-main" data-action="sub-menu" data-id="${sb.id}">
          <span class="sub-top"><strong>${esc(sb.name)}</strong>${flameChip(st, sb.id)}<span class="sub-lvl">ур. ${sb.level}</span></span>
          <span class="bar"><i style="width:${Math.round(v / max * 100)}%"></i></span>
          <span class="sub-meta">${minutesP ? formatMinutes(minutesP) : '0 мин'} ${periodName} · ${sb.xp} опыта всего · <span class="${warn ? 'warn' : ''}">${idle}</span></span>
        </button>
        <button class="btn btn-small btn-primary" data-action="log-time" data-id="${sb.id}" aria-label="Отметить время: ${esc(sb.name)}">+ время</button>
      </div>`;
  }).join('');

  const acts = allActions(ui.save).filter(a => a.sphere === ui.zoom);
  return `
    <div class="sphere-head" style="--c:${sp.color}">
      <span class="sh-icon">${sp.icon}</span>
      <div><h2>${sp.name}</h2><p class="muted">${s.started ? `Уровень ${s.level} · ${s.into}/${s.need} опыта` : 'Ветвь ещё не проросла'}</p></div>
    </div>
    <div class="meters">
      <div><span>Опыт до уровня ${s.level + 1}</span><div class="bar"><i style="width:${Math.round(s.progress * 100)}%;background:${sp.color}"></i></div></div>
      <div><span>Жизненная сила: ${s.health}% — ${healthWord(s.health)}</span><div class="bar"><i style="width:${s.health}%;background:${s.health >= 60 ? 'var(--good)' : s.health >= 35 ? '#E0A526' : 'var(--bad)'}"></i></div></div>
    </div>

    <div class="panel-head spaced">
      <h2>Подветви</h2>
      ${subs.length ? `<div class="segmented small">
        <button aria-selected="${ui.subPeriod === 'week'}" data-action="sub-period" data-period="week">Неделя</button>
        <button aria-selected="${ui.subPeriod === 'month'}" data-action="sub-period" data-period="month">Месяц</button>
        <button aria-selected="${ui.subPeriod === 'all'}" data-action="sub-period" data-period="all">Всё</button>
      </div>` : ''}
      <p class="muted">${subs.length
        ? 'Раздели ветвь на части — предметы, виды спорта, проекты — и отмечай время на каждую. Сразу видно, чему уделяешь больше, а что забросил.'
        : 'Ветвь можно разделить на подветви: например, «Разум» — на предметы в вузе. Отмечай время на каждую, и станет видно, чему ты уделяешь больше, а что забросил.'}</p>
    </div>
    ${insight}
    ${subRows ? `<div class="sub-list">${subRows}</div>` : ''}
    ${subs.length < SUB_RULES.maxPerSphere ? `<button class="btn ${subs.length ? 'btn-ghost' : 'btn-primary'} btn-wide" data-action="add-sub">Добавить подветвь</button>` : ''}

    <div class="panel-head spaced">
      <h2>Дела ветви</h2>
      <div class="segmented small">
        <button aria-selected="${ui.logDay === 0}" data-action="log-day" data-day="0">Сегодня</button>
        <button aria-selected="${ui.logDay === 1}" data-action="log-day" data-day="1">Вчера</button>
      </div>
    </div>
    <div class="act-list">
      ${acts.map(a => {
        const sb = a.sub ? findSub(ui.save, a.sub) : null;
        return `<button class="act" data-action="log-act" data-id="${a.id}" style="--c:${sp.color}">
        <span class="act-name">${esc(a.name)}${sb ? `<small class="act-sub">${esc(sb.name)}</small>` : ''}</span>${flameChip(st, a.id)}<span class="act-xp">+${Math.round(a.xp * RULES.repeatFactors[Math.min(countOnDay(st, a.id, t), 2)])}</span></button>`;
      }).join('')}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="custom-act" data-sphere="${sp.id}">Своё дело</button>
      <button class="btn btn-ghost" data-action="goto-skills" data-sphere="${sp.id}">Навыки ветви</button>
    </div>`;
}

const SUB_SUGGESTIONS = {
  health: ['Бег', 'Зал', 'Плавание', 'Йога', 'Велосипед', 'Футбол'],
  mind: ['Математика', 'Английский', 'Физика', 'Программирование', 'История', 'Чтение'],
  career: ['Учёба по профессии', 'Свой проект', 'Портфолио', 'Подработка', 'Стажировка'],
  finance: ['Бюджет', 'Накопления', 'Инвестиции', 'Подработка'],
  social: ['Семья', 'Друзья', 'Отношения', 'Новые знакомства'],
  creative: ['Рисование', 'Музыка', 'Фото', 'Писательство', 'Видео'],
  soul: ['Медитация', 'Дневник', 'Прогулки', 'Чтение для души'],
  home: ['Готовка', 'Уборка', 'Ремонт', 'Растения'],
};

function openAddSub(sphereId) {
  const sp = SPHERE_BY_ID[sphereId];
  const taken = new Set(subsOf(ui.save, sphereId).map(x => x.name.toLowerCase()));
  const ideas = (SUB_SUGGESTIONS[sphereId] || []).filter(x => !taken.has(x.toLowerCase()));
  openSheet(`
    <h2>Новая подветвь: ${sp.icon} ${sp.name}</h2>
    <form id="sheet-form" novalidate>
      <label class="field"><span>Название</span><input name="name" maxlength="30" required placeholder="Например: ${esc(ideas[0] || 'Матанализ')}"></label>
      ${ideas.length ? `<div class="chips wrap">${ideas.map(x => `<button type="button" class="chip" data-action="fill-sub" data-name="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Отмена</button>
        <button class="btn btn-primary" type="submit">Добавить</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim().slice(0, 30);
    const err = $('#sheet .form-error');
    if (!name) { err.textContent = 'Напиши название'; return false; }
    if (taken.has(name.toLowerCase())) { err.textContent = 'Такая подветвь уже есть'; return false; }
    const order = Math.max(-1, ...ui.save.custom.subs.filter(x => x.sphere === sphereId).map(x => x.order ?? 0)) + 1;
    const id = 'sb_' + uid();
    ui.save.custom.subs.push({ id, sphere: sphereId, name, order, createdAt: Date.now() });
    commit();
    toast(`Подветвь «${name}» проросла`, 'good');
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
    <p>${fresh ? 'Сколько времени ты уже уделил этому? Можно пропустить и отметить потом.' : 'Сколько времени ты на это потратил?'}</p>
    <form id="sheet-form" novalidate>
      <div class="segmented small">
        <button type="button" aria-selected="${ui.logDay === 0}" data-action="time-day" data-day="0">Сегодня</button>
        <button type="button" aria-selected="${ui.logDay === 1}" data-action="time-day" data-day="1">Вчера</button>
      </div>
      <div class="time-grid">
        ${presets.map(m => `<button type="button" class="time-chip" data-action="pick-time" data-m="${m}">${formatMinutes(m)}</button>`).join('')}
      </div>
      <label class="field"><span>Или своё число минут</span><input name="m" type="number" inputmode="numeric" min="1" max="900" placeholder="Например, 50"></label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">${fresh ? 'Пропустить' : 'Отмена'}</button>
        <button class="btn btn-primary" type="submit">Отметить</button>
      </div>
    </form>`, (fd) => {
    const m = Math.round(Number(fd.get('m')));
    if (!m || m < 1 || m > 900) { $('#sheet .form-error').textContent = 'Выбери время или впиши число минут от 1 до 900'; return false; }
    addEvent('time', subId, eventTime(), { m });
  });
}

function openSubMenu(subId) {
  const sb = findSub(ui.save, subId);
  if (!sb) return;
  const sp = SPHERE_BY_ID[sb.sphere];
  const stat = ui.state.subStats[subId];
  openSheet(`
    <h2>${sp.icon} ${esc(sb.name)}</h2>
    <p>${stat.minutes ? `Всего ${formatMinutes(stat.minutes)}, ${stat.xp} опыта. ` : stat.xp ? `${stat.xp} опыта. ` : 'Пока ни одной отметки. '}За неделю — ${formatMinutes(stat.minutes7)}, за месяц — ${formatMinutes(stat.minutes30)}.</p>
    <form id="sheet-form" novalidate>
      <label class="field"><span>Название</span><input name="name" maxlength="30" value="${esc(sb.name)}"></label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions stack">
        <button type="button" class="btn btn-primary" data-action="log-time" data-id="${sb.id}">Отметить время</button>
        <button class="btn btn-ghost" type="submit">Сохранить название</button>
        <button type="button" class="btn btn-ghost" data-action="delete-sub" data-id="${sb.id}">Удалить подветвь</button>
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Закрыть</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim().slice(0, 30);
    if (!name) { $('#sheet .form-error').textContent = 'Название не может быть пустым'; return false; }
    if (subsOf(ui.save, sb.sphere).some(x => x.id !== sb.id && x.name.toLowerCase() === name.toLowerCase())) {
      $('#sheet .form-error').textContent = 'Такая подветвь уже есть'; return false;
    }
    sb.name = name;
    commit();
    toast('Название сохранено', 'info');
  });
}

function openSettings() {
  const themes = THEMES.map(th => {
    const leaves = th.tree.leaves || ['#5CF2C4', '#FF6B8B', '#5B8DEF'];
    return `
      <button class="theme-card${ui.save.theme === th.id ? ' is-on' : ''}" data-action="theme" data-id="${th.id}"
        style="--s1:${th.tree.sky[0]};--s2:${th.tree.sky[1]};--g:${th.tree.ground};--t:${th.tree.trunk};--l1:${leaves[0]};--l2:${leaves[1]};--l3:${leaves[2]}">
        <span class="theme-preview ${th.tree.pixel ? 'is-pixel' : ''}"><i class="tp-trunk"></i><i class="tp-l1"></i><i class="tp-l2"></i><i class="tp-l3"></i></span>
        <span>${th.name}</span>
      </button>`;
  }).join('');
  openSheet(`
    <h2>Настройки</h2>
    <h3>Стиль игры</h3>
    <div class="theme-grid">${themes}</div>
    <h3>Профиль</h3>
    <label class="field"><span>Имя</span><input id="set-name" maxlength="40" value="${esc(ui.save.name || ui.user.name)}"></label>
    ${accountBlock()}
    <div class="sheet-actions stack">
      <button class="btn btn-ghost" data-action="save-name">Сохранить имя</button>
      <button class="btn btn-ghost" data-action="reset">Начать заново</button>
      <button class="btn btn-ghost" data-action="logout">Выйти из аккаунта</button>
      <button class="btn btn-primary" data-action="close-sheet">Готово</button>
    </div>`);
}

// --- Связь аккаунтов сайта и Telegram ---
function accountBlock() {
  const u = ui.user;
  const mail = u.email
    ? `<span class="tr-done">✓</span>`
    : `<button class="btn btn-small btn-primary" data-action="attach-email">Добавить</button>`;
  const tgBtn = u.telegram
    ? (u.email ? `<button class="btn btn-small btn-ghost" data-action="unlink-tg">Отвязать</button>` : `<span class="tr-done">✓</span>`)
    : `<button class="btn btn-small btn-primary" data-action="link-tg">Привязать</button>`;
  return `
    <h3>Аккаунт</h3>
    <div class="link-list">
      <div class="link-row">
        <span class="link-ic">✉️</span>
        <span class="link-body"><strong>Вход по почте</strong><small>${u.email ? esc(u.email) : 'Не добавлен: без него не войти на сайте'}</small></span>
        ${mail}
      </div>
      <div class="link-row">
        <span class="link-ic">✈️</span>
        <span class="link-body"><strong>Telegram</strong><small>${u.telegram ? 'Привязан: на сайте и в Telegram одно дерево' : 'Не привязан'}</small></span>
        ${tgBtn}
      </div>
    </div>
    ${TG.wa && !u.email ? `<button class="btn btn-ghost btn-wide" data-action="merge-login">Уже играю на сайте — объединить</button>` : ''}
    <p class="small muted">Связанные вход по почте и Telegram — это один аккаунт: отметил дело на телефоне — увидишь его на компьютере. При объединении прогресс складывается, ничего не теряется.</p>`;
}

function credentialsForm(title, text, submitLabel, extra = '') {
  return `
    <h2>${title}</h2>
    <p>${text}</p>
    <form id="sheet-form" novalidate>
      <label class="field"><span>Почта</span><input name="email" type="email" autocomplete="email" required placeholder="you@mail.ru"></label>
      <label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="Не короче 6 символов"></label>
      <p class="form-error" role="alert"></p>
      ${extra}
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Отмена</button>
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
  toast('Аккаунты объединены: теперь здесь и на сайте одно дерево', 'good');
}

function openMergeLogin() {
  openSheet(credentialsForm('Объединить с аккаунтом сайта',
    'Введи почту и пароль, с которыми играешь на сайте. Прогресс из Telegram сложится с прогрессом на сайте.',
    'Объединить'), async (fd) => {
    const err = $('#sheet .form-error');
    try {
      await mergeLogin(String(fd.get('email') || '').trim(), String(fd.get('password') || ''));
    } catch (e) { err.textContent = e.message; }
    return false;
  });
}

function openAttachEmail() {
  openSheet(credentialsForm('Вход по почте',
    'Добавь почту и пароль, чтобы заходить в этот же аккаунт с сайта на компьютере.',
    'Добавить'), async (fd) => {
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const err = $('#sheet .form-error');
    try {
      const res = await api.attachEmail(email, password);
      ui.user = res.user;
      closeSheet();
      toast('Готово: теперь можно входить на сайте по почте', 'good');
    } catch (e) {
      err.textContent = e.message;
      if (e.code === 'email_taken' && TG.wa) {
        err.insertAdjacentHTML('afterend', `<button type="button" class="btn btn-primary btn-wide" data-action="merge-now">Объединить с этим аккаунтом</button>`);
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
    <h2>Привязать Telegram</h2>
    <p>Открой бота @${esc(res.bot)} и нажми «Start». Бот привяжет твой Telegram к этому аккаунту. Ссылка действует 30 минут.</p>
    <p>Если ты уже играл в Telegram, прогресс оттуда сложится с этим.</p>
    <div class="sheet-actions stack">
      <a class="btn btn-primary" href="${esc(res.url)}" target="_blank" rel="noopener">Открыть бота</a>
      <button class="btn btn-ghost" data-action="check-link">Я нажал Start</button>
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
    return `<h3>${sp.icon} ${sp.name}</h3><div class="act-list compact">${acts.map(a =>
      `<button class="act" data-action="track" data-id="${a.id}" style="--c:${sp.color}"><span class="act-name">${esc(a.name)}</span>${flameChip(ui.state, a.id)}</button>`).join('')}</div>`;
  }).join('');
  openSheet(`
    <h2>За каким делом следить?</h2>
    <p>Огонёк будет всегда на виду, даже когда погаснет. Своё дело можно сначала добавить во вкладке «Отметить».</p>
    ${groups}
    <div class="sheet-actions"><button class="btn btn-ghost" data-action="close-sheet">Отмена</button></div>`);
}

function openCustomAct(presetSphere) {
  const pre = presetSphere || (ui.filter !== 'all' ? ui.filter : null);
  const subGroups = SPHERES.map(sp => {
    const list = subsOf(ui.save, sp.id);
    return list.length ? `<optgroup label="${sp.icon} ${sp.name}">${list.map(sb => `<option value="${sb.id}">${esc(sb.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  openSheet(`
    <h2>Своё полезное дело</h2>
    <form id="sheet-form">
      <label class="field"><span>Что ты делаешь</span><input name="name" required maxlength="60" placeholder="Например: решал задачи по матану"></label>
      <label class="field"><span>Какую ветвь растит</span>
        <select name="sphere">${SPHERES.map(s => `<option value="${s.id}"${pre === s.id ? ' selected' : ''}>${s.icon} ${s.name}</option>`).join('')}</select>
      </label>
      ${subGroups ? `<label class="field"><span>Подветвь (необязательно)</span>
        <select name="sub"><option value="">Без подветви</option>${subGroups}</select>
      </label>` : ''}
      <label class="field"><span>Насколько это трудно</span>
        <select name="xp">
          <option value="6">Легко, пара минут — 6 опыта</option>
          <option value="12" selected>Обычно, полчаса — 12 опыта</option>
          <option value="20">Серьёзно, час и больше — 20 опыта</option>
          <option value="30">Подвиг — 30 опыта</option>
        </select>
      </label>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Отмена</button>
        <button class="btn btn-primary" type="submit">Добавить</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim();
    if (!name) return false;
    const sub = fd.get('sub') ? findSub(ui.save, fd.get('sub')) : null;
    ui.save.custom.acts.push({
      id: 'ca_' + uid(), name, sphere: sub ? sub.sphere : fd.get('sphere'), xp: Number(fd.get('xp')) || 12,
      ...(sub ? { sub: sub.id } : {}),
    });
    toast('Дело добавлено в список', 'info');
    commit();
  });
}

function openCustomBad() {
  openSheet(`
    <h2>Своя вредная привычка</h2>
    <form id="sheet-form">
      <label class="field"><span>Что мешает</span><input name="name" required maxlength="60" placeholder="Например: ночные сериалы"></label>
      <fieldset class="field"><legend>Какие ветви страдают</legend>
        <div class="check-grid">${SPHERES.map(s => `<label class="check"><input type="checkbox" name="sp" value="${s.id}"> ${s.icon} ${s.name}</label>`).join('')}</div>
      </fieldset>
      <label class="field"><span>Насколько вредит</span>
        <select name="dmg">
          <option value="5">Немного — −5 силы</option>
          <option value="10" selected>Заметно — −10 силы</option>
          <option value="15">Сильно — −15 силы</option>
        </select>
      </label>
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Отмена</button>
        <button class="btn btn-primary" type="submit">Добавить</button>
      </div>
    </form>`, (fd) => {
    const name = String(fd.get('name') || '').trim();
    const spheres = fd.getAll('sp');
    if (!name || !spheres.length) {
      $('#sheet .form-error').textContent = 'Напиши название и выбери хотя бы одну ветвь';
      return false;
    }
    const dmg = Number(fd.get('dmg')) || 10;
    ui.save.custom.bads.push({ id: 'cb_' + uid(), name, damage: Object.fromEntries(spheres.map(s => [s, dmg])) });
    toast('Привычка добавлена', 'info');
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
      if ($('#sheet').hidden) render();
    }
    if (!sameSave(merged, normalizeSave(res.data, ui.user.name))) queueSync();
  } catch { /* нет связи — попробуем позже */ }
}

function bindEvents() {
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
    case 'tab':
      ui.tab = el.dataset.tab;
      render();
      return window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    case 'open-sphere': return zoomTo(el.dataset.sphere);
    case 'zoom-out': return zoomOut();
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
      return confirmSheet('Удалить подветвь?', `«${esc(sb.name)}» исчезнет с дерева. Опыт останется в ветви «${SPHERE_BY_ID[sb.sphere].name}», отметки — в истории.`,
        'Удалить', () => { sb.archived = true; commit(); toast('Подветвь удалена', 'info'); }, true);
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
      return confirmSheet('Отметить срыв?', `«${esc(b.name)}». Листья на затронутых ветвях пожелтеют. Это нормально — главное видеть, что происходит, и не сдаваться.`,
        'Отметить честно', () => addEvent('bad', id));
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
    case 'check-link':
      refreshUser().then((u) => {
        closeSheet();
        render();
        toast(u.telegram ? 'Telegram привязан: теперь одно дерево на сайте и в Telegram' : 'Пока не привязан. Открой бота и нажми Start', u.telegram ? 'good' : 'info');
        if (u.telegram) openSettings();
      }).catch(err => toast(err.message, 'bad'));
      return;
    case 'unlink-tg':
      return confirmSheet('Отвязать Telegram?', 'Прогресс останется в этом аккаунте. Открыв бота снова, ты начнёшь новое дерево, пока не привяжешь Telegram обратно.',
        'Отвязать', async () => {
          try { ui.user = (await api.unlinkTelegram()).user; toast('Telegram отвязан', 'info'); } catch (e) { toast(e.message, 'bad'); }
        }, true);
    case 'track':
      if (!ui.save.tracked.includes(id)) ui.save.tracked.push(id);
      closeSheet(); commit(); toast('Огонёк добавлен', 'info');
      return;
    case 'untrack':
      ui.save.tracked = ui.save.tracked.filter(x => x !== id);
      commit();
      return;
    case 'custom-bad': return openCustomBad();
    case 'unlock-skill': {
      const sk = SKILL_BY_ID[id];
      return confirmSheet('Навык освоен?', `«${esc(sk.name)}». Отмечай, только если это правда получилось. Если поторопился — навык можно откатить.`,
        'Да, освоил', () => addEvent('skill', id, Date.now()));
    }
    case 'undo-skill': {
      const deps = dependentSkills(ui.state, id);
      const ev = [...ui.save.events].reverse().find(e2 => e2.k === 'skill' && e2.ref === id && ui.state.effects[e2.id]?.valid);
      const depText = deps.length ? `<br><br>Вместе с ним закроются зависимые навыки: ${deps.map(d => '«' + esc(SKILL_BY_ID[d].name) + '»').join(', ')}.` : '';
      return confirmSheet('Откатить навык?', `«${esc(SKILL_BY_ID[id].name)}» снова станет неосвоенным, а бонус опыта уйдёт.${depText}`,
        'Откатить', () => { if (ev) removeEvent(ev.id); }, true);
    }
    case 'learn': return addEvent('mat', id, Date.now());
    case 'undo-mat': {
      const ev = ui.save.events.find(e2 => e2.k === 'mat' && e2.ref === id);
      return confirmSheet('Отменить отметку?', 'Материал снова станет неизученным, опыт за него уйдёт.', 'Отменить отметку', () => { if (ev) removeEvent(ev.id); }, true);
    }
    case 'undo': {
      return confirmSheet('Отменить отметку?', 'Дерево пересчитается так, будто этого не было. Навыки, которые держались на этом опыте, могут закрыться.',
        'Отменить', () => removeEvent(id), true);
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
      ui.save.name = v; commit(); toast('Имя сохранено', 'info');
      return;
    }
    case 'reset':
      return confirmSheet('Начать заново?', 'Весь прогресс, история и свои привычки будут удалены. Стиль оформления останется. Это нельзя отменить.',
        'Удалить прогресс', () => { const theme = ui.save.theme; ui.save = newSave(ui.save.name); ui.save.theme = theme; ui.save.resetAt = Date.now(); ui.selected = null; commit(); }, true);
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
