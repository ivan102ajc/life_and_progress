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
    custom: { acts: [], bads: [], subs: [], goals: [] },
    tracked: [],             // id дел, за огоньком которых игрок следит
    seenTips: [],            // какие функции игрок уже видел в обучении
    deleted: [],             // id отменённых событий (для синхронизации устройств)
    resetAt: 0,              // когда игрок нажал «Начать заново»
    changedAt: Date.now(),
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
    tracked: Array.isArray(save.tracked) ? save.tracked : [],
    seenTips: Array.isArray(save.seenTips) ? save.seenTips : [],
    deleted: Array.isArray(save.deleted) ? save.deleted : [],
    custom: {
      acts: Array.isArray(save.custom?.acts) ? save.custom.acts : [],
      bads: Array.isArray(save.custom?.bads) ? save.custom.bads : [],
      subs: Array.isArray(save.custom?.subs) ? save.custom.subs : [],
      goals: Array.isArray(save.custom?.goals) ? save.custom.goals : [],
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
export function findSub(save, id) {
  return save.custom.subs.find(x => x.id === id);
}
export function findGoal(save, id) {
  return (save.custom.goals || []).find(x => x.id === id);
}

// --- Цели игрока --------------------------------------------------------------
// Виды: count — сделать дело N раз; time — N минут на подветвь;
// level — довести сферу до уровня N; custom — своя цель, отмечается вручную.
// Период: week / month — цель повторяется, награду можно забрать раз за период;
// once — разовая (у level и custom всегда разовая).
export const GOAL_RULES = { reward: { week: 40, month: 120, once: 80 }, maxActive: 20 };

export function goalPeriod(goal) {
  return goal.kind === 'level' || goal.kind === 'custom' ? 'once' : (goal.period || 'week');
}
export function goalReward(goal) {
  return GOAL_RULES.reward[goalPeriod(goal)];
}
function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // неделя начинается с понедельника
  return d.getTime();
}
export function periodKey(period, t) {
  if (period === 'week') return 'w' + dayKey(weekStart(t));
  if (period === 'month') { const d = new Date(t); return 'm' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  return 'once';
}
function periodStart(period, t, goal) {
  if (period === 'week') return weekStart(t);
  if (period === 'month') { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
  return goal.created || 0;
}

// Прогресс цели за текущий период по вычисленному состоянию.
export function goalProgress(save, st, goal, now = Date.now()) {
  const period = goalPeriod(goal);
  const key = periodKey(period, now);
  const from = periodStart(period, now, goal);
  let value = 0;
  let target = Math.max(1, Math.round(Number(goal.target) || 1));
  if (goal.kind === 'count') {
    for (const e of save.events) {
      if (e.t < from || e.t > now) continue;
      const eff = st.effects[e.id];
      if (!eff?.valid) continue;
      // Время на подветвь, связанную с делом, тоже засчитывает дело.
      if ((e.k === 'act' && e.ref === goal.ref) || (e.k === 'time' && eff.act === goal.ref)) value++;
    }
  } else if (goal.kind === 'time') {
    for (const e of save.events) {
      if (e.k !== 'time' || e.ref !== goal.ref || e.t < from || e.t > now) continue;
      if (st.effects[e.id]?.valid) value += Math.round(Number(e.m) || 0);
    }
  } else if (goal.kind === 'level') {
    value = st.spheres[goal.ref]?.level || 0;
  } else {
    target = 1;
  }
  const claimed = Boolean(st.goalClaims?.has(goal.id + '|' + key));
  if (goal.kind === 'custom') value = claimed ? 1 : 0;
  return {
    value, target, period, key, claimed,
    done: value >= target,
    times: st.goalCounts?.[goal.id] || 0,
    reward: goalReward(goal),
  };
}
export function subsOf(save, sphereId) {
  return save.custom.subs.filter(x => x.sphere === sphereId && !x.archived);
}

// Подветви: время в минутах превращается в опыт.
// Час занятий ≈ 24 опыта (как «Учился час»). После 3 часов в день по одной
// подветви опыт идёт в четыре раза медленнее — чтобы не «накручивали» минуты.
export const SUB_RULES = {
  xpPerMinute: 0.4,
  dailyFullMinutes: 180,
  overFactor: 0.25,
  xpBase: 20,           // уровень подветви: 20·n·(n+1)/2 опыта
  maxPerSphere: 12,
  neglectDays: 7,       // через сколько дней подветвь начинает желтеть
};

// С каким делом связана подветвь: время на «Английский» засчитывается как
// «Занимался иностранным языком». Игрок может выбрать связь сам (sb.act —
// id дела или null, «не связывать»); если не выбирал — угадываем по названию.
const LINK_RULES = [
  [/англ|немец|франц|испан|итал|китай|япон|корей|язык|english|german|french|spanish|italian|chinese|japanese|korean|language/i, 'm_lang'],
  [/чтен|книг|читал|reading|book/i, 'm_read'],
  [/лекци|lecture|podcast|подкаст/i, 'm_lecture'],
  [/задач|олимпиад|практик|leetcode|problem/i, 'm_tasks'],
  [/матем|матан|алгебр|геометр|физик|хими|биолог|истор|географ|литерат|философ|эконом|право|информат|программ|предмет|учёб|учеб|курс|maths?|algebra|geometry|physics|chemistry|biology|history|geography|literature|philosophy|economics|law|programming|coding|course|study/i, 'm_study'],
  [/бег|зал|тренир|плаван|йог|велос|футбол|баскет|волейбол|теннис|бокс|единоборств|фитнес|лыж|танц|running|gym|workout|swim|yoga|cycl|football|soccer|basketball|volleyball|tennis|boxing|fitness|ski|danc/i, 'h_train'],
  [/прогул|ходьб|шаг|walk|steps/i, 'h_walk'],
  [/растяж|заряд|stretch/i, 'h_stretch'],
  [/сон|sleep/i, 'h_sleep'],
  [/портфолио|резюме|portfolio|cv|resume/i, 'c_cv'],
  [/проект|работ|профес|стажир|подработ|project|job|work|intern/i, 'c_deep'],
  [/бюджет|расход|budget|expens/i, 'f_track'],
  [/накоплен|копил|сбереж|saving/i, 'f_save'],
  [/инвест|финанс|invest|financ/i, 'f_learn'],
  [/семь|родн|мама|папа|family|parents/i, 's_family'],
  [/друз|friend/i, 's_friends'],
  [/знаком|meeting people|dating/i, 's_new'],
  [/рисов|живоп|музык|гитар|пиани|фото|видео|творч|drawing|paint|music|guitar|piano|photo|video|art/i, 'a_practice'],
  [/писат|текст|блог|writing|blog/i, 'a_write'],
  [/медит|meditat/i, 'p_meditate'],
  [/дневник|journal/i, 'p_journal'],
  [/природ|nature|hik|поход/i, 'p_nature'],
  [/готов|кулин|cook/i, 'd_cook'],
  [/уборк|чистот|clean|tidy/i, 'd_clean'],
  [/ремонт|repair|diy/i, 'd_todo'],
];

export function guessAction(name, sphereId) {
  const text = String(name || '');
  for (const [re, actId] of LINK_RULES) {
    const a = ACTIONS.find(x => x.id === actId);
    if (a && a.sphere === sphereId && re.test(text)) return actId;
  }
  return null;
}

export function linkedAction(save, sb) {
  if (!sb) return null;
  if (Object.prototype.hasOwnProperty.call(sb, 'act')) {
    return sb.act && findAction(save, sb.act) ? sb.act : null;
  }
  return guessAction(sb.name, sb.sphere);
}

export function minutesToXp(minutes, alreadyToday) {
  const full = Math.max(0, Math.min(minutes, SUB_RULES.dailyFullMinutes - alreadyToday));
  const over = minutes - full;
  return (full + over * SUB_RULES.overFactor) * SUB_RULES.xpPerMinute;
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

// Номер дня по местному времени — чтобы проверять, идут ли дни подряд.
export function dayNum(t) {
  return Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY);
}

// Огоньки: на какой день подряд даётся бонус и сколько опыта.
export const STREAK_MILESTONES = { 3: 10, 7: 25, 14: 50, 30: 100, 60: 150, 100: 250, 365: 500 };

export function nextMilestone(n) {
  return Number(Object.keys(STREAK_MILESTONES).find(m => Number(m) > n)) || null;
}

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- «Путь дерева» — карта достижений --------------------------------------
// Прогресс по общему уровню дерева (level из суммарного опыта всех сфер).
// На каждой вехе — награда: grow (пышность дерева), decor (украшение),
// style (новый стиль оформления), boost (ускорение роста опыта).
export const PATH = [
  { level: 0,  name: ['Семечко', 'Seed'], grants: [] },
  { level: 1,  name: ['Проросток', 'Seedling'], grants: [{ grow: 1 }] },
  { level: 2,  name: ['Росток', 'Sprout'], grants: [{ grow: 1 }, { decor: 'blossom' }] },
  { level: 3,  name: ['Первые листья', 'First leaves'], grants: [{ decor: 'fireflies' }] },
  { level: 5,  name: ['Саженец', 'Sapling'], grants: [{ grow: 1 }, { boost: 0.03 }] },
  { level: 7,  name: ['Крепкий стебель', 'Strong stem'], grants: [{ decor: 'fruits' }] },
  { level: 9,  name: ['Молодое деревце', 'Young tree'], grants: [{ grow: 1 }, { style: 'starlit' }] },
  { level: 12, name: ['Пышная крона', 'Lush crown'], grants: [{ grow: 1 }, { boost: 0.03 }] },
  { level: 14, name: ['Крепкое дерево', 'Sturdy tree'], grants: [{ decor: 'birds' }] },
  { level: 17, name: ['Цветущий сад', 'Blooming garden'], grants: [{ grow: 1 }, { boost: 0.03 }] },
  { level: 20, name: ['Раскидистое древо', 'Spreading tree'], grants: [{ grow: 1 }, { style: 'aurora' }] },
  { level: 24, name: ['Сияющая крона', 'Radiant crown'], grants: [{ decor: 'aura' }, { boost: 0.03 }] },
  { level: 28, name: ['Вековое древо', 'Ancient tree'], grants: [{ grow: 2 }, { decor: 'aura' }] },
  { level: 38, name: ['Древо мудрости', 'Tree of wisdom'], grants: [{ grow: 2 }, { boost: 0.03 }] },
];

// Текущая веха, её номер и следующая — для экрана пути.
export function pathTier(level) {
  let tier = PATH[0]; let index = 0;
  PATH.forEach((t, i) => { if (level >= t.level) { tier = t; index = i; } });
  return { tier, index, next: PATH.find(t => t.level > level) || null };
}

// Всё, что открыто к этому уровню: пышность, украшения, стили, ускорение опыта.
export function pathPerks(level) {
  let growth = 0; let boost = 0;
  const decor = new Set(); const styles = new Set();
  for (const t of PATH) {
    if (t.level > level) continue;
    for (const g of t.grants) {
      if (g.grow) growth += g.grow;
      if (g.boost) boost += g.boost;
      if (g.decor) decor.add(g.decor);
      if (g.style) styles.add(g.style);
    }
  }
  return { growth, boost, decor, styles };
}

// Ускорение опыта, положенное при данном суммарном опыте (для расчёта роста).
function boostForXp(xp) {
  return pathPerks(levelInfo(xp, RULES.playerXpBase).level).boost;
}

// --- Бейджи-достижения ------------------------------------------------------
// Значки за конкретные свершения. Каждое проверяется по вычисленному состоянию.
export const BADGES = [
  { id: 'first', icon: '🌱', name: ['Первый росток', 'First sprout'],
    desc: ['Отметить первое полезное дело', 'Log your first activity'],
    has: (st) => st.totalXp > 0 },
  { id: 'week', icon: '🔥', name: ['Неделя огня', 'Week on fire'],
    desc: ['Серия в 7 дней подряд', 'A 7-day streak'],
    has: (st) => bestStreak(st) >= 7 },
  { id: 'month', icon: '⚡', name: ['Месяц огня', 'Month on fire'],
    desc: ['Серия в 30 дней подряд', 'A 30-day streak'],
    has: (st) => bestStreak(st) >= 30 },
  { id: 'allspheres', icon: '🌈', name: ['Разносторонний', 'Well-rounded'],
    desc: ['Начать развивать все 8 сфер', 'Start all 8 life areas'],
    has: (st) => SPHERES.every(s => st.spheres[s.id].started) },
  { id: 'gardener', icon: '🪴', name: ['Садовник', 'Gardener'],
    desc: ['Довести все сферы до 5 уровня', 'Bring every area to level 5'],
    has: (st) => SPHERES.every(s => st.spheres[s.id].level >= 5) },
  { id: 'hundred', icon: '💯', name: ['Сотня дел', 'A hundred deeds'],
    desc: ['Отметить 100 полезных дел', 'Log 100 good deeds'],
    has: (st) => totalActions(st) >= 100 },
  { id: 'clean', icon: '🛡️', name: ['Чистая неделя', 'Clean week'],
    desc: ['7 дней без вредных привычек', '7 days with no bad habits'],
    has: (st) => (st.cleanDays || 0) >= 7 },
  { id: 'goal', icon: '🎯', name: ['Целеустремлённый', 'Goal-getter'],
    desc: ['Выполнить первую свою цель', 'Complete your first goal'],
    has: (st) => (st.goalsDone || 0) >= 1 },
  { id: 'goals10', icon: '🏆', name: ['Десять целей', 'Ten goals'],
    desc: ['Выполнить 10 целей', 'Complete 10 goals'],
    has: (st) => (st.goalsDone || 0) >= 10 },
  { id: 'mighty', icon: '🌳', name: ['Могучее древо', 'Mighty tree'],
    desc: ['Достичь 20 уровня дерева', 'Reach tree level 20'],
    has: (st) => st.player.level >= 20 },
];

function bestStreak(st) {
  return Math.max(0, ...Object.values(st.streaks || {}).map(r => r.best || 0));
}
function totalActions(st) {
  return Object.values(st.spheres).reduce((a, s) => a + (s.actions || 0), 0);
}
export function earnedBadges(st) {
  return BADGES.map(b => ({ ...b, earned: b.has(st) }));
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
  const goalClaims = new Set();  // "цель|период" — за что награда уже получена
  const goalCounts = {};         // id цели -> сколько раз выполнена
  const lastBad = {};       // id привычки -> время последнего срыва
  const runs = {};          // id действия -> { last: номер дня, len: дней подряд, best }
  const subStats = {};      // id подветви -> статистика
  const subDay = {};        // "день|подветвь" -> минут за день
  for (const sb of save.custom.subs) {
    if (!sp[sb.sphere]) continue;
    subStats[sb.id] = {
      id: sb.id, sphere: sb.sphere, name: sb.name, archived: Boolean(sb.archived), order: sb.order ?? 0,
      xp: 0, xp7: 0, xp30: 0, minutes: 0, minutes7: 0, minutes30: 0, sessions: 0, last: null,
    };
  }
  const addToSub = (sid, xp, minutes, t) => {
    const st = subStats[sid];
    if (!st) return;
    const age = now - t;
    st.xp += xp; st.minutes += minutes; st.sessions++;
    if (age < 7 * DAY) { st.xp7 += xp; st.minutes7 += minutes; }
    if (age < 30 * DAY) { st.xp30 += xp; st.minutes30 += minutes; }
    st.last = Math.max(st.last || 0, t);
  };

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

  // Суммарный опыт по ходу начисления — чтобы применять бонус «Пути дерева».
  let runningXp = 0;

  const gainXp = (s, amount, t) => {
    const mult = 1 + boostForXp(runningXp);
    const gained = Math.round(amount * growthFactor(s) * mult);
    s.xp += gained;
    runningXp += gained;
    s.started = true;
    s.lastActive = t;
    s.decayApplied = 0;
    s.health = Math.min(100, s.health + RULES.healOnAction);
    return gained;
  };

  // Огонёк: первое выполнение за день продлевает серию (для дел и подветвей).
  const bumpRun = (key, t, s, sphereId, eff, withBonus = true) => {
    const d = dayNum(t);
    const r = runs[key] || (runs[key] = { last: null, len: 0, best: 0 });
    if (r.last === d) return;
    r.len = r.last === d - 1 ? r.len + 1 : 1;
    r.last = d;
    r.best = Math.max(r.best, r.len);
    const bonus = withBonus && STREAK_MILESTONES[r.len];
    if (bonus) {
      const extra = Math.round(bonus * growthFactor(s));
      s.xp += extra;
      runningXp += extra;
      eff.gains[sphereId] = (eff.gains[sphereId] || 0) + extra;
      eff.streak = { days: r.len, bonus: extra };
    }
  };

  // Связи подветвей с делами: id дела -> подветви, которые его засчитывают.
  const subLink = {};
  const actSubs = {};
  for (const sb of save.custom.subs) {
    if (sb.archived) continue;
    const actId = linkedAction(save, sb);
    subLink[sb.id] = actId;
    if (actId) (actSubs[actId] = actSubs[actId] || []).push(sb.id);
  }

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
      bumpRun(a.id, e.t, s, a.sphere, eff);
      // Дело относится к подветви: своё дело с выбранной подветвью или
      // стандартное дело, с которым связана ровно одна подветвь.
      const subId = a.sub || (actSubs[a.id]?.length === 1 ? actSubs[a.id][0] : null);
      if (subId && subStats[subId]) {
        addToSub(subId, eff.gains[a.sphere], 0, e.t);
        eff.sub = subId;
      }
      s.actions++;
      goodDays.add(dayKey(e.t));
      eff.valid = true;
    } else if (e.k === 'time') {
      // Время, потраченное на подветвь (например, на предмет в вузе).
      const sb = findSub(save, e.ref);
      const minutes = Math.round(Number(e.m) || 0);
      if (!sb || !sp[sb.sphere] || minutes <= 0) continue;
      const s = sp[sb.sphere];
      const key = dayKey(e.t) + '|' + sb.id;
      const today = subDay[key] || 0;
      subDay[key] = today + minutes;
      eff.gains[sb.sphere] = gainXp(s, minutesToXp(minutes, today), e.t);
      eff.over = today + minutes > SUB_RULES.dailyFullMinutes;
      // Время на подветвь засчитывается и как связанное дело: оно отмечено
      // за этот день и продлевает огонёк дела. Опыт второй раз не начисляется,
      // а если потом отметить это же дело вручную — оно будет повтором за день.
      const linked = subLink[sb.id] ?? linkedAction(save, sb);
      if (linked) {
        const akey = dayKey(e.t) + '|' + linked;
        dayCounts[akey] = (dayCounts[akey] || 0) + 1;
        bumpRun(linked, e.t, s, sb.sphere, eff);
        eff.act = linked;
      }
      bumpRun(sb.id, e.t, s, sb.sphere, eff, !linked);
      addToSub(sb.id, eff.gains[sb.sphere], minutes, e.t);
      eff.sub = sb.id;
      eff.minutes = minutes;
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
    } else if (e.k === 'goal') {
      // Награда за выполненную цель — один раз за период.
      const g = findGoal(save, e.ref);
      if (!g || !sp[g.sphere]) continue;
      const ck = g.id + '|' + (e.p || 'once');
      if (goalClaims.has(ck)) continue;
      goalClaims.add(ck);
      goalCounts[g.id] = (goalCounts[g.id] || 0) + 1;
      eff.gains[g.sphere] = gainXp(sp[g.sphere], goalReward(g), e.t);
      eff.goal = g.id;
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
    // Подветви этой ветви (без удалённых), в порядке добавления.
    s.subList = Object.values(subStats)
      .filter(x => x.sphere === s.id && !x.archived)
      .sort((a, b) => a.order - b.order)
      .map(x => ({
        ...x,
        ...levelInfo(x.xp, SUB_RULES.xpBase),
        idleDays: x.last ? Math.floor((now - x.last) / DAY) : null,
      }));
    const subXp = s.subList.reduce((a, x) => a + x.xp, 0);
    s.generalXp = Math.max(0, s.xp - subXp);
  }
  const player = levelInfo(totalXp, RULES.playerXpBase);

  // Серия: сколько дней подряд (до сегодня или вчера) было хоть одно хорошее дело.
  let streak = 0;
  let cursor = now;
  if (!goodDays.has(dayKey(cursor))) cursor -= DAY;
  while (goodDays.has(dayKey(cursor))) { streak++; cursor -= DAY; }

  // Огоньки на текущий момент: горит (сделано сегодня), тлеет (сделано вчера —
  // сегодня ещё можно продлить), погас (пропущен день).
  const today = dayNum(now);
  const streaks = {};
  for (const [id, r] of Object.entries(runs)) {
    const status = r.last === today ? 'lit' : r.last === today - 1 ? 'risk' : 'out';
    streaks[id] = { days: status === 'out' ? 0 : r.len, best: r.best, status };
  }

  const cleanDays = {};
  for (const [id, t] of Object.entries(lastBad)) cleanDays[id] = Math.floor((now - t) / DAY);

  const todayKey = dayKey(now);
  const todayCounts = {};
  for (const [key, n] of Object.entries(dayCounts)) {
    const [d, id] = key.split('|');
    if (d === todayKey) todayCounts[id] = n;
  }

  const avgHealth = Math.round(
    Object.values(sp).filter(s => s.started).reduce((a, s) => a + s.health, 0) /
    Math.max(1, Object.values(sp).filter(s => s.started).length)
  );

  return {
    spheres: sp, totalXp, player, stage: stageFor(player.level), streak,
    effects, cleanDays, learned, dayCounts, todayCounts, avgHealth, streaks, subStats,
    perks: pathPerks(player.level), path: pathTier(player.level),
    goalClaims, goalCounts, goalsDone: goalClaims.size,
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
