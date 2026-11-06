// Обучение: экран затемняется, нужная часть интерфейса подсвечивается,
// рядом — карточка с объяснением. Шаги привязаны к функциям игры (feature),
// поэтому после обновления игроку можно показать только новое.
//
// Как добавить подсказку к новой функции:
//   1. Добавьте функцию в FEATURES (id, название для «Что нового»).
//   2. Добавьте её шаги в STEPS с feature: '<id>'.
// Игроки, которые уже прошли обучение, при следующем входе увидят
// короткий тур только по этой функции.

import { T } from './i18n.js';

export const FEATURES = [
  { id: 'core', title: ['Как растёт дерево', 'How the tree grows'] },
  { id: 'streaks', title: ['Огоньки — серии дней подряд', 'Streaks — days in a row'] },
  { id: 'subs', title: ['Подветви и приближение к ветке', 'Sub-branches and branch close-ups'] },
  { id: 'notes', title: ['Заметки к делам и дневник', 'Notes on activities and a journal'] },
  { id: 'accounts', title: ['Один аккаунт на сайте и в Telegram', 'One account on the website and in Telegram'] },
  { id: 'language', title: ['Английский язык', 'English language'] },
];

// nav — какой экран открыть перед шагом; target — что подсветить
// (CSS-селектор; если элемента нет, карточка показывается по центру).
// title и text — пары [по-русски, по-английски].
export const STEPS = [
  { feature: 'core', nav: { tab: 'tree' }, target: '#tree',
    title: ['Твоё дерево', 'Your tree'],
    text: ['Восемь ветвей — восемь сфер жизни: здоровье, разум, карьера, финансы, отношения, творчество, душевный покой и быт. Пока это почки — они прорастут от первых дел.',
      'Eight branches, eight areas of life: health, mind, career, finance, relationships, creativity, peace of mind and home. For now they’re buds — your first activities will make them sprout.'] },
  { feature: 'core', nav: { tab: 'tree' }, target: '.tb-stage',
    title: ['Уровень и стадия', 'Level and stage'],
    text: ['Весь опыт складывается в общий уровень. Чем он выше, тем больше дерево: от семечка до векового древа.',
      'All your XP adds up to an overall level. The higher it is, the bigger the tree: from a seed to an ancient tree.'] },
  { feature: 'core', nav: { tab: 'log' }, target: '#panel .act-list .act',
    title: ['Отмечай полезные дела', 'Log useful activities'],
    text: ['Сделал что-то полезное — нажми. Ветвь получит опыт и подрастёт. Повтор того же дела за день даёт меньше опыта, так что накрутить не выйдет. Можно отмечать и за вчера.',
      'Did something useful? Tap it. The branch gets XP and grows. Repeating the same thing in one day gives less XP, so no grinding. You can log yesterday too.'] },
  { feature: 'core', nav: { tab: 'log' }, target: '#panel .act-bad',
    title: ['Вредные привычки', 'Bad habits'],
    text: ['Срывы тоже отмечай — честно. Листья на затронутых ветвях пожелтеют, и ветвь будет расти медленнее, пока ты не подлечишь её полезными делами.',
      'Log slips too — honestly. Leaves on the affected branches turn yellow, and the branch grows slower until you heal it with useful activities.'] },
  { feature: 'streaks', nav: { tab: 'log' }, target: '#streaks-block',
    title: ['Огоньки 🔥', 'Streaks 🔥'],
    text: ['Делай одно дело несколько дней подряд — у него загорится огонёк. На 3, 7, 14, 30 и 100 день — бонус опыта. Пропустил день — огонёк гаснет. «Следить за огоньком» — чтобы нужные всегда были на виду.',
      'Do the same thing several days in a row and a streak lights up. Day 3, 7, 14, 30 and 100 give bonus XP. Miss a day and it goes out. “Track a streak” keeps the ones you care about in view.'] },
  { feature: 'core', nav: { tab: 'tree' }, target: '#panel .sphere-list .sphere-row',
    title: ['Жизненная сила ветвей', 'Branch vitality'],
    text: ['Если ветвь не поливать больше 3 дней, она начинает сохнуть. Здесь видно, какая сфера цветёт, а какая просит внимания.',
      'If a branch isn’t watered for more than 3 days, it starts drying out. Here you see which area is blooming and which needs attention.'] },
  { feature: 'subs', nav: { tab: 'tree' }, target: '.tag-wrap[data-sphere="mind"]',
    title: ['Приблизь ветку', 'Zoom into a branch'],
    text: ['Нажми на значок любой ветки — камера приблизится к ней. Сейчас покажу, что там.',
      'Tap any branch icon and the camera zooms in. Let me show you what’s there.'] },
  { feature: 'subs', nav: { tab: 'tree', zoom: 'mind' }, target: '#tree',
    title: ['Подветви', 'Sub-branches'],
    text: ['Ветвь можно разделить на части — например, «Разум» на предметы в вузе. Чем больше времени уделяешь предмету, тем длиннее и гуще его подветвь. Заброшенные желтеют.',
      'A branch can be split into parts — for example, “Mind” into your university subjects. The more time you give a subject, the longer and fuller its sub-branch. Neglected ones turn yellow.'] },
  { feature: 'subs', nav: { tab: 'tree', zoom: 'mind' }, target: '#panel [data-action="add-sub"]',
    title: ['Добавь свои подветви', 'Add your own sub-branches'],
    text: ['Отмечай время на каждую подветвь — здесь появится сравнение за неделю и месяц и подсказка, что ты давно забросил.',
      'Log time for each sub-branch — you’ll see a comparison for the week and month, plus a hint about what you’ve neglected.'] },
  { feature: 'core', nav: { tab: 'skills' }, target: '#panel .skill-tree .skill',
    title: ['Навыки', 'Skills'],
    text: ['Реальные достижения: «пробежать 5 км», «составить бюджет». Открываются с уровнем ветви. Каждый освоенный навык — новая веточка с плодом и бонус опыта.',
      'Real achievements: “run 5 km”, “make a budget”. They unlock with the branch level. Each mastered skill is a new twig with fruit and bonus XP.'] },
  { feature: 'core', nav: { tab: 'materials' }, target: '#panel .mat-list .mat',
    title: ['Материалы', 'Resources'],
    text: ['Книги, курсы и сайты для каждой сферы. Изучил — отметь и получи опыт.',
      'Books, courses and websites for every area. Finished one? Mark it and get XP.'] },
  { feature: 'notes', nav: { tab: 'history', histMode: 'all' }, target: '#panel .panel-head',
    title: ['История и дневник', 'History and journal'],
    text: ['Здесь все отметки. Поторопился? Отмени — дерево честно пересчитается. К любой отметке можно написать заметку и настроение (✎), а во вкладке «Дневник» они соберутся по дням.',
      'All your entries are here. Too quick? Undo — the tree recalculates honestly. Add a note and mood to any entry (✎), and the “Journal” tab collects them by day.'] },
  { feature: 'accounts', nav: { tab: 'tree' }, target: '[data-action="settings"]',
    title: ['Настройки и аккаунт', 'Settings and account'],
    text: ['Здесь стиль игры (их пять — от весеннего сада до пикселей) и аккаунт: привяжи Telegram, и на сайте и в Telegram будет одно дерево. Обучение тоже можно пройти заново отсюда.',
      'Here you’ll find the game style (five of them, from spring garden to pixel) and your account: link Telegram to have one tree on the website and in Telegram. You can replay the tutorial from here too.'] },
  { feature: 'language', nav: { tab: 'tree' }, target: '[data-action="settings"]',
    title: ['Русский или английский', 'Russian or English'],
    text: ['Язык игры можно сменить в настройках. Выбор сохраняется в аккаунте — на всех устройствах.',
      'You can switch the game language in settings. Your choice is saved to your account — on every device.'] },
];

const pick = (v) => (Array.isArray(v) ? T(v[0], v[1]) : v);

// Какие шаги показать игроку. seen — функции, с которыми он уже знаком.
export function planTour(seen, { full = false } = {}) {
  const seenSet = new Set(seen || []);
  const unseen = FEATURES.filter(f => !seenSet.has(f.id));
  if (!full && !unseen.length) return null;
  const isFull = full || !seenSet.size; // ещё ни разу не проходил — полное обучение
  const features = isFull ? FEATURES : unseen;
  const ids = new Set(features.map(f => f.id));
  const steps = STEPS.filter(s => ids.has(s.feature));
  const intro = isFull
    ? { title: ['Добро пожаловать в Древо жизни 🌱', 'Welcome to Tree of Life 🌱'], text: ['Здесь твои реальные дела растят дерево, а вредные привычки заставляют листья желтеть. Покажу за минуту, как всё устроено.', 'Here your real-life activities grow a tree, and bad habits turn its leaves yellow. Let me show you how it all works in a minute.'], center: true }
    : { title: ['Что нового ✨', 'What’s new ✨'], text: ['В игре появилось новое:', 'New in the game:'], list: features.map(f => f.title), center: true };
  const outro = isFull
    ? { title: ['Всё готово!', 'You’re all set!'], text: ['Начни с одного полезного дела, которое ты уже сделал сегодня. Обучение можно пройти заново в настройках.', 'Start with one useful thing you’ve already done today. You can replay the tutorial in settings.'], center: true, finalAction: ['Отметить первое дело', 'Log your first activity'], finalNav: { tab: 'log' } }
    : { title: ['Это всё новое', 'That’s everything new'], text: ['Пробуй! Обучение целиком можно пройти заново в настройках.', 'Give it a try! You can replay the full tutorial in settings.'], center: true, finalAction: ['Понятно', 'Got it'] };
  return { steps: [intro, ...steps, outro], features: features.map(f => f.id), full: isFull };
}

// ---------------------------------------------------------------------------
// Показ обучения
// ---------------------------------------------------------------------------

let active = null;
export const tourActive = () => Boolean(active);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ищем только видимые элементы внутри игры (на скрытом экране входа
// тоже есть дерево — его подсвечивать нельзя).
function find(selector) {
  const scope = document.getElementById('game') || document;
  return [...scope.querySelectorAll(selector)].find(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }) || null;
}

export function runTour(plan, { navigate, onFinish, reduceMotion = false }) {
  if (active) active.close(false);
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text"></div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add('tour-on');
  const hole = root.querySelector('.tour-hole');
  const card = root.querySelector('.tour-card');
  let index = 0;
  let target = null;

  // Прокрутка страницы под затемнением мешает подсветке — блокируем её.
  const stop = (e) => { if (!card.contains(e.target)) e.preventDefault(); };
  root.addEventListener('wheel', stop, { passive: false });
  root.addEventListener('touchmove', stop, { passive: false });

  function place() {
    const step = plan.steps[index];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(380, vw - 24);
    card.style.width = cw + 'px';
    const ch = card.offsetHeight;
    if (!target || step.center) {
      root.classList.add('is-center');
      hole.style.cssText = 'opacity:0';
      card.style.left = (vw - cw) / 2 + 'px';
      card.style.top = Math.max(12, (vh - ch) / 2) + 'px';
      return;
    }
    root.classList.remove('is-center');
    const r0 = target.getBoundingClientRect();
    if (!r0.width && !r0.height) { target = find(step.target); }
    const r1 = target ? target.getBoundingClientRect() : r0;
    // Очень высокий элемент подсвечиваем только сверху, чтобы осталось место для карточки.
    const maxH = vh * 0.5;
    const r = { left: r1.left, right: r1.right, top: r1.top, width: r1.width, height: Math.min(r1.height, maxH), bottom: r1.top + Math.min(r1.height, maxH) };
    const pad = 8;
    const x = Math.max(4, r.left - pad);
    const y = Math.max(4, r.top - pad);
    const w = Math.min(vw - 8, r.right + pad) - x;
    const h = Math.min(vh - 8, r.bottom + pad) - y;
    hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;opacity:1`;
    // Карточка — под подсветкой, над ней или (если места нет) внизу экрана.
    let top;
    if (vh - (y + h) >= ch + 16) top = y + h + 12;
    else if (y >= ch + 16) top = y - ch - 12;
    else top = vh - ch - 12;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(12, Math.min(vw - cw - 12, left));
    card.style.left = left + 'px';
    card.style.top = Math.max(12, top) + 'px';
  }

  function show(i) {
    index = Math.max(0, Math.min(plan.steps.length - 1, i));
    const step = plan.steps[index];
    if (step.nav) navigate(step.nav);
    const last = index === plan.steps.length - 1;
    const total = plan.steps.length;
    card.innerHTML = `
      <div class="tour-top">
        <span class="tour-count">${index + 1} / ${total}</span>
        ${last ? '' : `<button class="tour-skip" data-tour="skip">${T('Пропустить', 'Skip')}</button>`}
      </div>
      <h2 id="tour-title">${esc(pick(step.title))}</h2>
      <p id="tour-text">${esc(pick(step.text))}</p>
      ${step.list ? `<ul class="tour-list">${step.list.map(x => `<li>${esc(pick(x))}</li>`).join('')}</ul>` : ''}
      <div class="tour-dots" aria-hidden="true">${plan.steps.map((_, k) => `<i class="${k === index ? 'is-on' : ''}"></i>`).join('')}</div>
      <div class="tour-actions">
        ${index > 0 ? `<button class="btn btn-ghost" data-tour="prev">${T('Назад', 'Back')}</button>` : '<span></span>'}
        <button class="btn btn-primary" data-tour="next">${last ? esc(pick(step.finalAction) || T('Готово', 'Done')) : index === 0 ? T('Начать', 'Start') : T('Далее', 'Next')}</button>
      </div>`;
    target = step.target ? find(step.target) : null;
    if (target) {
      const r = target.getBoundingClientRect();
      const tall = r.height > window.innerHeight * 0.6;
      target.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
    }
    root.classList.toggle('no-anim', reduceMotion);
    place();
    // После прокрутки и отрисовки положение могло сдвинуться — уточняем.
    requestAnimationFrame(() => requestAnimationFrame(place));
    setTimeout(place, 320);
    card.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  function close(done) {
    if (!active) return;
    window.removeEventListener('resize', place);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    document.documentElement.classList.remove('tour-on');
    active = null;
    const step = plan.steps[index];
    if (done && step.finalNav) navigate(step.finalNav);
    else navigate({ tab: 'tree' });
    onFinish?.({ completed: done, features: plan.features });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'Tab') {
      // Фокус не уходит из карточки.
      const f = [...card.querySelectorAll('button')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  const next = () => (index === plan.steps.length - 1 ? close(true) : show(index + 1));
  const prev = () => show(index - 1);

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    const a = b.dataset.tour;
    if (a === 'next') next();
    else if (a === 'prev') prev();
    else if (a === 'skip') close(false);
  });
  window.addEventListener('resize', place);
  window.addEventListener('keydown', onKey, true);

  active = { close, next, prev, back: () => (index > 0 ? prev() : close(false)) };
  show(0);
  return active;
}

export function tourBack() {
  if (active) active.back();
}
