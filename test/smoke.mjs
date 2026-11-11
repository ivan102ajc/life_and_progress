// Быстрая проверка игры без браузера: `npm test`.
// Проверяет расчёт дерева, цели, слияние версий и то, что дерево рисуется
// во всех стилях на любом уровне (именно такая ошибка однажды уже попала к игрокам).

import assert from 'node:assert/strict';
import { newSave, normalizeSave, compute, uid, goalProgress, earnedBadges, pathPerks, pathTier, PATH, stageFor } from '../public/js/game.js';
import { renderTree, renderBranch } from '../public/js/tree.js';
import { THEMES } from '../public/js/themes.js';
import { ACTIONS, BAD_HABITS, SPHERES } from '../public/js/data.js';
import { mergeSaves, sameSave } from '../public/js/sync.js';
import { planTour, FEATURES, STEPS } from '../public/js/tour.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('✗', name, '\n ', e.message); process.exitCode = 1; } };
const now = Date.now();
const DAY = 864e5;
function saveWith(n, stepHours = 5) {
  const s = newSave('T');
  s.custom.subs.push({ id: 'sb', sphere: 'mind', name: 'Матанализ', order: 0 });
  let t = now - n * stepHours * 36e5 - 1000;
  for (let i = 0; i < n; i++) {
    t += stepHours * 36e5;
    if (i % 9 === 0) s.events.push({ id: uid(), k: 'time', ref: 'sb', m: 30, t, c: t });
    else if (i % 23 === 0) s.events.push({ id: uid(), k: 'bad', ref: BAD_HABITS[i % BAD_HABITS.length].id, t, c: t });
    else s.events.push({ id: uid(), k: 'act', ref: ACTIONS[i % ACTIONS.length].id, t, c: t });
  }
  return s;
}

test('пустое сохранение: уровень 0, нет бонусов', () => {
  const st = compute(newSave('E'), now);
  assert.equal(st.player.level, 0); assert.equal(st.totalXp, 0);
  assert.equal(st.perks.boost, 0); assert.equal(earnedBadges(st).filter(b => b.earned).length, 0);
});

test('опыт растёт, отмена возвращает прежнее состояние', () => {
  const s = saveWith(60); const before = compute(s, now).totalXp;
  const e = { id: 'x1', k: 'act', ref: ACTIONS[0].id, t: now - 1000, c: now };
  s.events.push(e); assert.ok(compute(s, now).totalXp > before);
  s.events = s.events.filter(x => x.id !== 'x1'); assert.equal(compute(s, now).totalXp, before);
});

test('обычное дело не попадает в подветвь само', () => {
  const s = newSave('T'); s.custom.subs.push({ id: 'sb', sphere: 'mind', name: 'Матанализ', order: 0 });
  s.events.push({ id: 'e1', k: 'act', ref: 'm_study', t: now - 1000, c: now });
  const st = compute(s, now);
  assert.equal(st.effects.e1.sub, undefined); assert.equal(st.subStats.sb.xp, 0);
});

test('путь дерева: вехи по возрастанию, награды копятся', () => {
  for (let i = 1; i < PATH.length; i++) assert.ok(PATH[i].level > PATH[i - 1].level);
  assert.ok(pathPerks(100).boost <= 0.2);
  assert.equal(pathTier(0).index, 0); assert.equal(pathTier(1000).next, null);
  assert.equal(stageFor(5).name, PATH.find(p => p.level === 5).name[0]);
  const decor = PATH.flatMap(p => p.grants.map(g => g.decor).filter(Boolean));
  assert.equal(new Set(decor).size, decor.length, 'украшение выдаётся дважды');
});

test('цели: прогресс, награда один раз за период, сброс на новой неделе', () => {
  const A = ACTIONS[0]; const s = newSave('T');
  const g = { id: 'g1', kind: 'count', ref: A.id, target: 2, period: 'week', sphere: A.sphere, created: now - DAY };
  s.custom.goals.push(g);
  s.events.push({ id: 'a1', k: 'act', ref: A.id, t: now - 2000, c: now }, { id: 'a2', k: 'act', ref: A.id, t: now - 1000, c: now });
  let st = compute(s, now); let p = goalProgress(s, st, g, now);
  assert.ok(p.done && !p.claimed);
  s.events.push({ id: 'c1', k: 'goal', ref: 'g1', p: p.key, t: now, c: now }, { id: 'c2', k: 'goal', ref: 'g1', p: p.key, t: now, c: now });
  st = compute(s, now);
  assert.ok(goalProgress(s, st, g, now).claimed); assert.equal(st.effects.c2.valid, false); assert.equal(st.goalsDone, 1);
  const later = now + 8 * DAY; assert.equal(goalProgress(s, compute(s, later), g, later).claimed, false);
});

test('слияние версий: события, цели и обучение не теряются, отменённое не воскресает', () => {
  const a = saveWith(10); const b = normalizeSave(JSON.parse(JSON.stringify(a)));
  a.events.push({ id: 'onlyA', k: 'act', ref: ACTIONS[1].id, t: now - 500, c: now });
  b.custom.goals.push({ id: 'gB', kind: 'custom', title: 'x', sphere: 'mind' }); b.seenTips = ['core'];
  const gone = a.events[0].id; b.events = b.events.filter(e => e.id !== gone); b.deleted = [gone];
  const m = mergeSaves(a, b);
  assert.ok(m.events.some(e => e.id === 'onlyA')); assert.ok(!m.events.some(e => e.id === gone));
  assert.equal(m.custom.goals.length, 1); assert.deepEqual(m.seenTips, ['core']);
  assert.ok(sameSave(m, mergeSaves(b, a)));
});

test('дерево рисуется во всех стилях на любом уровне', () => {
  for (const n of [0, 1, 3, 40, 300, 1500]) {
    const st = compute(saveWith(n), now);
    for (const th of THEMES) for (const reduceMotion of [false, true]) {
      const where = `${th.id}, ${n} событий`;
      assert.ok(renderTree(st, th, { reduceMotion }).startsWith('<svg'), where);
      assert.ok(renderTree(st, th, { selected: 'mind', reduceMotion }).includes('</svg>'), where);
      assert.ok(renderBranch(st, th, 'mind', { reduceMotion, neglectDays: 14, labelScale: 1 }).includes('</svg>'), where);
    }
  }
});

test('обучение: новичку — короткое, функции и шаги согласованы', () => {
  const first = planTour([]); assert.ok(first.steps.length <= 12, 'обучение новичка слишком длинное: ' + first.steps.length);
  assert.equal(first.features.length, FEATURES.length);
  const ids = new Set(FEATURES.map(f => f.id));
  for (const s of STEPS) assert.ok(ids.has(s.feature), 'шаг без функции: ' + s.feature);
  for (const f of FEATURES) assert.ok(STEPS.some(s => s.feature === f.id), 'функция без шага: ' + f.id);
  assert.equal(planTour(FEATURES.map(f => f.id)), null);
});

test('данные игры: у каждого дела есть сфера и перевод', () => {
  const sp = new Set(SPHERES.map(s => s.id));
  for (const a of ACTIONS) { assert.ok(sp.has(a.sphere), a.id); assert.ok(a.en, a.id + ' без перевода'); }
  for (const th of THEMES) assert.ok(th.en && th.ui && th.tree, th.id);
});

test('день отдыха: огонёк от 7 дней переживает один пропуск в неделю', () => {
  const noon = new Date(now).setHours(15, 0, 0, 0);
  const run = (days) => { const s = newSave('R'); days.forEach((d, i) => s.events.push({ id: 'r' + i, k: 'act', ref: 'h_walk', t: noon - d * DAY, c: noon })); return compute(s, noon).streaks.h_walk; };
  const seq = (from, to, skip = []) => { const a = []; for (let d = from; d >= to; d--) if (!skip.includes(d)) a.push(d); return a; };
  assert.deepEqual(run(seq(11, 2)), { days: 10, best: 10, status: 'risk', rest: true });      // вчера пропуск — держится
  assert.equal(run(seq(11, 0, [3])).days, 11);                                                 // пропуск внутри — не сброс
  assert.equal(run(seq(14, 0, [5, 2])).days, 2);                                               // второй пропуск за неделю — сброс
  assert.equal(run(seq(6, 0, [2])).days, 2);                                                   // короткий огонёк не прощает
  assert.equal(run(seq(12, 0, [3, 2])).days, 2);                                               // два дня подряд — сброс
});

test('слияние: у своих записей побеждает более свежая версия', () => {
  const a = newSave('A'); a.changedAt = 100; a.custom.goals = [{ id: 'g', title: 'старое' }];
  const b = newSave('B'); b.changedAt = 200; b.custom.goals = [{ id: 'g', title: 'новое', archived: true }];
  assert.equal(mergeSaves(a, b).custom.goals[0].title, 'новое');
  assert.equal(mergeSaves(b, a).custom.goals[0].title, 'новое');
});

test('заброшенная ветвь оживает быстрее', () => {
  const s = newSave('H'); const t0 = now - 80 * DAY;
  s.events.push({ id: 'h0', k: 'act', ref: 'h_walk', t: t0, c: t0 });
  const dry = compute(s, now).spheres.health.health;
  s.events.push({ id: 'h1', k: 'act', ref: 'h_walk', t: now - 1000, c: now });
  const after = compute(s, now).spheres.health.health;
  assert.ok(dry < 20 && after - dry >= 12, `было ${dry}, стало ${after}`);
});

console.log(process.exitCode ? 'Есть ошибки' : `Все проверки пройдены: ${passed}`);
