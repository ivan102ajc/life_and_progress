// Языки интерфейса: русский и английский.
//
// Тексты переводятся прямо на месте: T('Русский текст', 'English text').
// Так перевод всегда лежит рядом с оригиналом, и его легко поправить.
// Для содержимого игры (сферы, дела, навыки…) у объектов есть поле en:
// name(item) вернёт название на текущем языке.

export const LANGS = [
  { id: 'ru', name: 'Русский' },
  { id: 'en', name: 'English' },
];

let lang = 'ru';

export function getLang() { return lang; }

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'ru';
  try { localStorage.setItem('tol_lang', lang); } catch { /* приватный режим */ }
  document.documentElement.lang = lang;
  return lang;
}

// Язык по умолчанию: сохранённый на этом устройстве, иначе язык Telegram
// или браузера (русский для ru/uk/be/kk, иначе английский).
export function detectLang(telegramCode) {
  try {
    const saved = localStorage.getItem('tol_lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch { /* приватный режим */ }
  const code = String(telegramCode || navigator.language || 'ru').toLowerCase();
  return /^(ru|uk|be|kk)/.test(code) ? 'ru' : 'en';
}

export function T(ru, en) {
  return lang === 'en' && en != null ? en : ru;
}

// Название объекта игры на текущем языке: name(sphere), name(material, 'title').
export function name(item, field = 'name') {
  if (!item) return '';
  if (lang === 'en') {
    const en = field === 'name' ? item.en : item[field + '_en'];
    if (en) return en;
  }
  return item[field] ?? '';
}

// Множественное число: plural(5, ['день', 'дня', 'дней'], ['day', 'days']).
export function plural(n, ruForms, enForms) {
  if (lang === 'en') return Math.abs(n) === 1 ? enForms[0] : enForms[1];
  const a = Math.abs(n) % 10; const b = Math.abs(n) % 100;
  if (a === 1 && b !== 11) return ruForms[0];
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return ruForms[1];
  return ruForms[2];
}

export const locale = () => (lang === 'en' ? 'en-GB' : 'ru-RU');

export function formatMinutes(m) {
  if (!m) return T('0 мин', '0 min');
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (!h) return T(`${mm} мин`, `${mm} min`);
  return mm ? T(`${h} ч ${mm} мин`, `${h} h ${mm} min`) : T(`${h} ч`, `${h} h`);
}
