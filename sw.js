// Service worker «Мастер микст»: приложение работает без интернета,
// а при наличии сети всегда берёт свежие версии файлов.
const PREFIX = 'master-mix-v';           // свои кэши; чужие (другие приложения на этом же домене) не трогаем
const CACHE = PREFIX + '11';
const CORE = ['./', './index.html', './help.html', './styles.css', './app.js', './qrcode.min.js', './jsqr.min.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-maskable-192.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // свои файлы (страница, стили, скрипт, иконки): сначала сеть — так страница, стили и скрипт
  // всегда одной версии; без сети — из кэша
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => {
      // страницы кладём по своему адресу (без ?… и #…), чтобы help.html не подменил index.html
      if (r.ok) { const c = r.clone(); const key = url.origin + url.pathname; caches.open(CACHE).then(x => x.put(key, c)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))));
    return;
  }
  // шрифты Google: из кэша, в фоне обновляем
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
