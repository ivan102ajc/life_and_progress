// Слияние двух версий прогресса — например, с телефона в Telegram и с сайта
// на компьютере. Работает и в браузере, и на сервере.
//
// Прогресс — это журнал событий, поэтому две версии можно сложить:
//  • события объединяются по id;
//  • отменённые события помнятся в списке deleted и не воскресают;
//  • «Начать заново» (resetAt) отбрасывает всё, что было создано раньше сброса;
//  • свои дела и привычки объединяются по id;
//  • настройки (тема, имя, огоньки) берутся из более свежей версии.

const MAX_DELETED = 3000;

const created = (e) => e.c ?? e.t;

export function mergeSaves(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = (b.changedAt || 0) >= (a.changedAt || 0) ? b : a;
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);

  const deleted = [...new Set([...(a.deleted || []), ...(b.deleted || [])])].slice(-MAX_DELETED);
  const gone = new Set(deleted);

  const events = new Map();
  for (const e of [...(a.events || []), ...(b.events || [])]) {
    if (!e || !e.id || gone.has(e.id)) continue;
    if (resetAt && created(e) < resetAt) continue;
    // Заметку могли изменить на другом устройстве: берём более свежую правку.
    const prev = events.get(e.id);
    if (prev && (prev.ne || 0) > (e.ne || 0)) continue;
    events.set(e.id, e);
  }

  const byId = (x = [], y = []) => {
    const m = new Map();
    for (const it of [...x, ...y]) if (it?.id) m.set(it.id, { ...m.get(it.id), ...it });
    return [...m.values()];
  };

  return {
    ...a,
    ...newer,
    changedAt: Math.max(a.changedAt || 0, b.changedAt || 0),
    createdAt: Math.min(a.createdAt || Infinity, b.createdAt || Infinity),
    resetAt,
    deleted,
    events: [...events.values()].sort((x, y) => x.t - y.t),
    custom: {
      acts: byId(a.custom?.acts, b.custom?.acts),
      bads: byId(a.custom?.bads, b.custom?.bads),
      subs: byId(a.custom?.subs, b.custom?.subs),
    },
    tracked: newer.tracked || [],
    // Пройденное обучение не должно «забываться» из-за старого устройства.
    seenTips: [...new Set([...(a.seenTips || []), ...(b.seenTips || [])])],
  };
}

// Совпадают ли две версии по содержанию (чтобы не перерисовывать зря).
export function sameSave(a, b) {
  if (!a || !b) return false;
  if ((a.events?.length || 0) !== (b.events?.length || 0)) return false;
  const ids = new Map(a.events.map(e => [e.id, e.ne || 0]));
  return b.events.every(e => ids.has(e.id) && ids.get(e.id) === (e.ne || 0)) &&
    a.theme === b.theme && a.name === b.name &&
    JSON.stringify(a.custom) === JSON.stringify(b.custom) &&
    JSON.stringify(a.tracked) === JSON.stringify(b.tracked) &&
    JSON.stringify([...(a.seenTips || [])].sort()) === JSON.stringify([...(b.seenTips || [])].sort());
}
