// Сервис-воркер: запоминает страницу и скрипты игры, чтобы она открывалась
// быстро и работала без интернета. Всегда сначала пробует сеть (обновления
// приходят сразу), а если сети нет или она «висит» — отдаёт сохранённую копию.
// Запросы к серверу (/api/) не кешируются никогда.

const CACHE = 'tol-shell-v1';
const TIMEOUT = 3500;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Главная страница открывается с разными параметрами (?pwreset=…, ?legacy=1) —
    // храним её под одним адресом. Остальные страницы — под своими.
    const isHome = req.mode === 'navigate' && url.pathname === '/';
    const key = isHome ? '/' : req;
    const cached = await cache.match(key);
    const fromNet = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    });
    if (!cached) return fromNet;
    // Есть копия: ждём сеть недолго, потом показываем сохранённое.
    const timer = new Promise(resolve => setTimeout(() => resolve(cached), TIMEOUT));
    return Promise.race([fromNet.catch(() => cached), timer]);
  })());
});
