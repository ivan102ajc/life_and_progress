// Отчёты об ошибках: если в игре что-то сломалось, разработчику уходит
// короткое сообщение — текст ошибки, место в коде и тип браузера.
// Никаких личных данных, прогресса или заметок здесь нет.

const MAX_PER_SESSION = 3;
let sent = 0;
const seen = new Set();

export function reportError(message, source = '', stack = '', where = '') {
  try {
    const msg = String(message || '').slice(0, 300);
    if (!msg || sent >= MAX_PER_SESSION || seen.has(msg + source)) return;
    // Ошибки сторонних скриптов и расширений браузера нам ничего не скажут.
    if (/^Script error\.?$/i.test(msg) || /extension:\/\//.test(source + stack)) return;
    seen.add(msg + source);
    sent++;
    const body = JSON.stringify({
      message: msg,
      source: String(source || '').replace(location.origin, '').slice(0, 200),
      stack: String(stack || '').split('\n').slice(0, 5).join('\n').replace(new RegExp(location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').slice(0, 600),
      where: where || (window.Telegram?.WebApp?.initData ? 'telegram' : 'web'),
    });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/report', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* отчёт об ошибке не должен сам ломать игру */ }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    reportError(e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '', e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    // Нет интернета — не ошибка игры.
    if (r && (r.offline || r.status)) return;
    reportError(r?.message || String(r), '', r?.stack);
  });
}
