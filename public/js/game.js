// Логика игры. Главная идея: всё состояние дерева ВЫЧИСЛЯЕТСЯ из журнала
// событий (что и когда отметил игрок). Поэтому любое событие можно отменить —
// дерево просто пересчитается так, будто этого не было.

import {
  SPHERES, ACTIONS, BAD_HABITS, SKILL_BY_ID, MATERIALS, STAGES, RULES,
} from './data.js';

const DAY = 24 * 60 * 60 * 1000;

export const SAVE_VERSION = 1;

export function newSave(name = '') {
  return {
    v: SAVE_VERSION,
    name,
    theme: 'spring',
    createdAt: Date.now(),
    events: [],              // { id, t, k: 'act'|'bad'|'skill'|'mat', ref }
    custom: { acts: [], bads: [] },
  };
}

// Приводит сохранение с сервера к актуальному виду (на случай старых версий).
export function normalizeSave(save, name) {
  const base = newSave(name);
  if (!save || typeof save !== 'object') return base;
  return {
    ...base,
    ...save,
    events: Array.isArray(save.events) ? save.events : [],
    custom: {
      acts: Array.isArray(save.custom?.acts) ? save.custom.acts : [],
      bads: Array.isArray(save.custom?.bads) ? save.custom.bads : [],
    },
  };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Поиск по каталогу (встроенное + своё) ---------------------------------

export function allActions(save) {
  return [...ACTIONS, ...save.custom.acts.filter(a => !a.archived)];
}
export function allBadHabits(save) {
  return [...BAD_HABITS, ...save.custom.bads.filter(b => !b.archived)];
}
export function findAction(save, id) {
  return ACTIONS.find(a => a.id === id) || save.custom.acts.find(a => a.id === id);
}
export function findBad(save, id) {
  return BAD_HABITS.find(b => b.id === id) || save.custom.bads.find(b => b.id === id);
}
export function findMaterial(id) {
  return MATERIALS.find(m => m.id === id);
}

// --- Уровни ---------------------------------------------------------------

// Сколько всего опыта нужно, чтобы достичь уровня n.
export function xpForLevel(n, base) {
  return base * n * (n + 1) / 2;
}

export function levelInfo(xp, base) {
  let level = 0;
  while (xp >= xpForLevel(level + 1, base)) level++;
  const from = xpForLevel(level, base);
  const to = xpForLevel(level + 1, base);
  return { level, into: xp - from, need: to - from, progress: (xp - from) / (to - from) };
}

export function stageFor(level) {
  let stage = STAGES[0];
  for (const s of STAGES) if (level >= s.level) stage = s;
  const next = STAGES.find(s => s.level > level) || null;
  return { ...stage, next };
}

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Главный расчёт ---------------------------------------------------------

export function compute(save, now = Date.now()) {
  const sp = {};
  for (const s of SPHERES) {
    sp[s.id] = {
      id: s.id, xp: 0, health: 100, started: false,
      lastActive: null, decayApplied: 0, unlocked: [], actions: 0, bads: 0,
    };
  }

  const effects = {};       // id события -> { gains: {sphere: xp}, losses: {sphere: hp}, valid }
  const dayCounts = {};     // "день|действие" -> сколько раз
  const learned = new Set();
  const goodDays = new Set();
  const lastBad = {};       // id привычки -> время последнего срыва

  const events = [...save.events].sort((a, b) => a.t - b.t);

  const applyDecay = (s, t) => {
    if (!s.started || s.lastActive == null) return;
    const idleDays = Math.floor((t - s.lastActive) / DAY);
    const due = Math.max(0, idleDays - RULES.idleGraceDays);
    const fresh = due - s.decayApplied;
    if (fresh > 0) {
      s.health = Math.max(0, s.health - fresh * RULES.idleDecayPerDay);
      s.decayApplied = due;
    }
  };

  // Чем ниже жизненная сила ветви, тем медленнее она растёт (от 100% до 50%).
  const growthFactor = (s) => 0.5 + s.health / 200;

  const gainXp = (s, amount, t) => {
    const gained = Math.round(amount * growthFactor(s));
    s.xp += gained;
    s.started = true;
    s.lastActive = t;
    s.decayApplied = 0;
    s.health = Math.min(100, s.health + RULES.healOnAction);
    return gained;
  };

  for (const e of events) {
    for (const s of Object.values(sp)) applyDecay(s, e.t);
    const eff = { gains: {}, losses: {}, valid: false };
    effects[e.id] = eff;

    if (e.k === 'act') {
      const a = findAction(save, e.ref);
      if (!a || !sp[a.sphere]) continue;
      const key = dayKey(e.t) + '|' + a.id;
      const n = dayCounts[key] || 0;
      dayCounts[key] = n + 1;
      const f = RULES.repeatFactors[Math.min(n, RULES.repeatFactors.length - 1)];
      const s = sp[a.sphere];
      eff.gains[a.sphere] = gainXp(s, a.xp * f, e.t);
      eff.repeat = n;
      s.actions++;
      goodDays.add(dayKey(e.t));
      eff.valid = true;
    } else if (e.k === 'bad') {
      const b = findBad(save, e.ref);
      if (!b) continue;
      for (const [sid, dmg] of Object.entries(b.damage || {})) {
        const s = sp[sid];
        if (!s) continue;
        const before = s.health;
        s.health = Math.max(0, s.health - dmg);
        eff.losses[sid] = before - s.health;
        s.bads++;
      }
      lastBad[b.id] = e.t;
      eff.valid = true;
    } else if (e.k === 'skill') {
      const sk = SKILL_BY_ID[e.ref];
      if (!sk) continue;
      const s = sp[sk.sphere];
      const lvl = levelInfo(s.xp, RULES.sphereXpBase).level;
      const parentOk = !sk.parent || s.unlocked.includes(sk.parent);
      // Если навык сейчас недоступен (например, после отката), он не засчитывается.
      if (lvl < sk.minLevel || !parentOk || s.unlocked.includes(sk.id)) continue;
      s.unlocked.push(sk.id);
      eff.gains[sk.sphere] = gainXp(s, RULES.skillXp(sk.minLevel), e.t);
      goodDays.add(dayKey(e.t));
      eff.valid = true;
    } else if (e.k === 'mat') {
      const m = findMaterial(e.ref);
      if (!m || learned.has(m.id)) continue;
      learned.add(m.id);
      eff.gains[m.sphere] = gainXp(sp[m.sphere], RULES.materialXp, e.t);
      goodDays.add(dayKey(e.t));
      eff.valid = true;
    }
  }
  for (const s of Object.values(sp)) applyDecay(s, now);

  let totalXp = 0;
  for (const s of Object.values(sp)) {
    Object.assign(s, levelInfo(s.xp, RULES.sphereXpBase));
    s.health = Math.round(s.health);
    s.idleDays = s.lastActive ? Math.floor((now - s.lastActive) / DAY) : null;
    totalXp += s.xp;
  }
  const player = levelInfo(totalXp, RULES.playerXpBase);

  // Серия: сколько дней подряд (до сегодня или вчера) было хоть одно хорошее дело.
  let streak = 0;
  let cursor = now;
  if (!goodDays.has(dayKey(cursor))) cursor -= DAY;
  while (goodDays.has(dayKey(cursor))) { streak++; cursor -= DAY; }

  const cleanDays = {};
  for (const [id, t] of Object.entries(lastBad)) cleanDays[id] = Math.floor((now - t) / DAY);

  const today = dayKey(now);
  const todayCounts = {};
  for (const [key, n] of Object.entries(dayCounts)) {
    const [d, id] = key.split('|');
    if (d === today) todayCounts[id] = n;
  }

  const avgHealth = Math.round(
    Object.values(sp).filter(s => s.started).reduce((a, s) => a + s.health, 0) /
    Math.max(1, Object.values(sp).filter(s => s.started).length)
  );

  return {
    spheres: sp, totalXp, player, stage: stageFor(player.level), streak,
    effects, cleanDays, learned, dayCounts, todayCounts, avgHealth,
  };
}

// Сколько раз действие уже отмечено в конкретный день.
export function countOnDay(state, actionId, t) {
  return state.dayCounts[dayKey(t) + '|' + actionId] || 0;
}

// Статус навыка для экрана навыков.
export function skillStatus(state, skillId) {
  const sk = SKILL_BY_ID[skillId];
  const s = state.spheres[sk.sphere];
  if (s.unlocked.includes(sk.id)) return 'done';
  if (sk.parent && !s.unlocked.includes(sk.parent)) return 'needParent';
  if (s.level < sk.minLevel) return 'needLevel';
  return 'ready';
}

// Какие освоенные навыки потеряются, если откатить этот (зависимые ветки).
export function dependentSkills(state, skillId) {
  const sk = SKILL_BY_ID[skillId];
  const unlocked = state.spheres[sk.sphere].unlocked;
  const out = [];
  const walk = (id) => {
    for (const u of unlocked) {
      if (SKILL_BY_ID[u].parent === id) { out.push(u); walk(u); }
    }
  };
  walk(skillId);
  return out;
}
