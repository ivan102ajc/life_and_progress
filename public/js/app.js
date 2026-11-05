// Интерфейс игры: экраны, кнопки, сохранение.

import { SPHERES, SPHERE_BY_ID, SKILLS, SKILL_BY_ID, MATERIALS, RULES } from './data.js';
import {
  newSave, normalizeSave, compute, uid, allActions, allBadHabits, findAction, findBad,
  findMaterial, countOnDay, skillStatus, dependentSkills, dayKey,
} from './game.js';
import { THEMES, THEME_BY_ID, applyTheme } from './themes.js';
import { renderTree } from './tree.js';
import { api, auth } from './api.js';

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
  document.documentElement.classList.add('in-telegram');
  return wa;
}

async function loadGame() {
  showScreen('loading');
  try {
    const res = await api.load();
    ui.user = res.user;
    const cached = readLocal(res.user.id);
    let data = res.data;
    // Если на этом устройстве есть более свежая несохранённая версия — берём её.
    if (cached && (!data || (cached.savedAt || 0) > (res.updatedAt || 0))) data = cached.save;
    ui.save = normalizeSave(data, res.user.name);
    if (!res.data || data === cached?.save) queueSync();
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
    await api.save(ui.save);
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

function addEvent(k, ref, t = eventTime()) {
  const before = ui.state;
  const e = { id: uid(), t, k, ref };
  ui.save.events.push(e);
  const after = compute(ui.save);
  reportChange(before, after, e);
  commit();
  if (!reduceMotion) {
    const sphere = Object.keys(after.effects[e.id]?.gains || {})[0];
    if (sphere) requestAnimationFrame(() => pulse(sphere));
  }
}

function removeEvent(id) {
  const before = ui.state;
  ui.save.events = ui.save.events.filter(e => e.id !== id);
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
    const note = eff.repeat ? ' (повтор за день — опыта меньше)' : '';
    toast(`+${xp} опыта: ${sp.icon} ${sp.name}${note}`, 'good');
    const lb = before.spheres[sid].level; const la = after.spheres[sid].level;
    if (la > lb) toast(`Ветвь «${sp.name}» выросла до уровня ${la}`, 'level');
  }
  const losses = Object.entries(eff.losses);
  if (losses.length) {
    toast('Листья желтеют: ' + losses.map(([sid, v]) => `${SPHERE_BY_ID[sid].name} −${v}`).join(', '), 'bad');
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

function render() {
  const theme = THEME_BY_ID[ui.save.theme] || THEME_BY_ID.spring;
  applyTheme(theme);
  ui.state = compute(ui.save);
  const st = ui.state;

  $('#game').dataset.tab = ui.tab;
  renderTopbar(st);
  $('#tree').innerHTML = renderTree(st, theme, { selected: ui.selected, reduceMotion });
  $('#scene-caption').innerHTML = sceneCaption(st);
  for (const b of document.querySelectorAll('#tabs [data-tab]')) {
    b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
  }
  const panel = $('#panel');
  panel.innerHTML = {
    tree: panelTree, log: panelLog, skills: panelSkills, materials: panelMaterials, history: panelHistory,
  }[ui.tab](st);
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
      <div class="streak${st.streak ? '' : ' is-zero'}" title="Дней подряд с полезными делами">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 1.8 1 3 2.5 3.5C11 9 11 5.5 12 2z"/></svg>
        <span>${st.streak}</span>
      </div>
      <div id="sync" class="sync" data-status="${ui.sync}"><i></i><span></span></div>
      <button class="icon-btn" data-action="settings" aria-label="Настройки и стиль">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
      </button>
    </div>`;
  setSync(ui.sync);
}

function sceneCaption(st) {
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
          <span class="sr-sub">${s.started ? `${s.into}/${s.need} опыта · сила ${s.health}%, ${healthWord(s.health)}` : 'ещё не начато'} ${idle}</span>
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
    <div class="panel-head">
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
  const first = sheet.querySelector('input, select, button.btn-primary');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeSheet() {
  const sheet = $('#sheet');
  sheet.hidden = true;
  sheet.innerHTML = '';
  sheet._onSubmit = null;
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

function openSphere(id) {
  ui.selected = id;
  render();
  const sp = SPHERE_BY_ID[id];
  const s = ui.state.spheres[id];
  const acts = allActions(ui.save).filter(a => a.sphere === id);
  const t = eventTime();
  openSheet(`
    <div class="sphere-head" style="--c:${sp.color}">
      <span class="sh-icon">${sp.icon}</span>
      <div><h2>${sp.name}</h2><p class="muted">${s.started ? `Уровень ${s.level} · ${s.into}/${s.need} опыта` : 'Ветвь ещё не проросла'}</p></div>
    </div>
    <div class="meters">
      <div><span>Опыт до уровня ${s.level + 1}</span><div class="bar"><i style="width:${Math.round(s.progress * 100)}%"></i></div></div>
      <div><span>Жизненная сила: ${s.health}% — ${healthWord(s.health)}</span><div class="bar"><i style="width:${s.health}%;background:${s.health >= 60 ? 'var(--good)' : s.health >= 35 ? '#E0A526' : 'var(--bad)'}"></i></div></div>
    </div>
    <p class="small muted">Сила влияет на скорость роста: сейчас ветвь растёт на ${Math.round(50 + s.health / 2)}%. Восстанавливается от полезных дел.</p>
    <h3>Быстро отметить ${ui.logDay ? 'за вчера' : 'за сегодня'}</h3>
    <div class="act-list compact">
      ${acts.map(a => `<button class="act" data-action="log-act" data-id="${a.id}" data-keep="1" style="--c:${sp.color}">
        <span class="act-name">${esc(a.name)}</span><span class="act-xp">+${Math.round(a.xp * RULES.repeatFactors[Math.min(countOnDay(ui.state, a.id, t), 2)])}</span></button>`).join('')}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="goto-skills" data-sphere="${id}">Навыки ветви</button>
      <button class="btn btn-primary" data-action="close-sheet">Готово</button>
    </div>`);
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
    <p class="small muted">${ui.user.email ? 'Почта: ' + esc(ui.user.email) : ''}${ui.user.telegram ? ' · Telegram привязан' : ''}</p>
    <div class="sheet-actions stack">
      <button class="btn btn-ghost" data-action="save-name">Сохранить имя</button>
      <button class="btn btn-ghost" data-action="reset">Начать заново</button>
      <button class="btn btn-ghost" data-action="logout">Выйти из аккаунта</button>
      <button class="btn btn-primary" data-action="close-sheet">Готово</button>
    </div>`);
}

function openCustomAct() {
  openSheet(`
    <h2>Своё полезное дело</h2>
    <form id="sheet-form">
      <label class="field"><span>Что ты делаешь</span><input name="name" required maxlength="60" placeholder="Например: занимался гитарой"></label>
      <label class="field"><span>Какую ветвь растит</span>
        <select name="sphere">${SPHERES.map(s => `<option value="${s.id}"${ui.filter === s.id ? ' selected' : ''}>${s.icon} ${s.name}</option>`).join('')}</select>
      </label>
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
    ui.save.custom.acts.push({ id: 'ca_' + uid(), name, sphere: fd.get('sphere'), xp: Number(fd.get('xp')) || 12 });
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

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('#tree .branch')) {
      e.preventDefault();
      openSphere(e.target.closest('.branch').dataset.sphere);
    }
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'auth-form') return submitAuth(e.target);
    if (e.target.id === 'sheet-form') {
      const fn = $('#sheet')._onSubmit;
      if (fn && fn(new FormData(e.target)) !== false) closeSheet();
    }
  });
}

function onClick(e) {
  const branch = e.target.closest('#tree .branch');
  if (branch) return openSphere(branch.dataset.sphere);

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
    case 'open-sphere': return openSphere(el.dataset.sphere);
    case 'filter': ui.filter = el.dataset.sphere; return render();
    case 'skill-sphere': ui.skillSphere = el.dataset.sphere; return render();
    case 'mat-sphere': ui.matSphere = el.dataset.sphere; return render();
    case 'log-day': ui.logDay = Number(el.dataset.day); return render();
    case 'log-act':
      addEvent('act', id);
      if (el.dataset.keep && !$('#sheet').hidden) openSphere(ui.selected);
      return;
    case 'log-bad': {
      const b = findBad(ui.save, id);
      return confirmSheet('Отметить срыв?', `«${esc(b.name)}». Листья на затронутых ветвях пожелтеют. Это нормально — главное видеть, что происходит, и не сдаваться.`,
        'Отметить честно', () => addEvent('bad', id));
    }
    case 'custom-act': return openCustomAct();
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
        'Удалить прогресс', () => { const theme = ui.save.theme; ui.save = newSave(ui.save.name); ui.save.theme = theme; ui.selected = null; commit(); }, true);
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
