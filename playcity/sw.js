/* ═══════════════════════════════════════════════════════════════
   놀이도시 오프라인 캐시 (Service Worker)

   왜 있나: 교실 와이파이가 약하거나 끊길 수 있다.
   한 번만 열어 두면 그 뒤로는 네트워크를 아예 쓰지 않는다.
   수업 전날이나 쉬는 시간에 한 번 열게 해 두면 당일에 인터넷이 죽어도 돌아간다.

   전략
     · 설치할 때 게임 파일을 전부 미리 받아 둔다 (precache)
     · 그 뒤로는 캐시에서 바로 준다 (cache-first) — 네트워크를 기다리지 않는다
     · 게임 파일은 판마다 바뀌지 않으니 캐시 우선이 안전하다

   파일을 고친 뒤에는 반드시 아래 VERSION 을 올린다.
   안 올리면 학생 기기가 옛 버전을 계속 쓴다.
   ═══════════════════════════════════════════════════════════════ */
const VERSION = 'playcity-v5';          // ★ 파일을 고치면 이 숫자를 올린다
const ASSETS = [
  './',
  './index.html',
  './phone.html',
  './tablet.html',
  './css/style.css',
  './vendor/three.min.js',
  './js/core.js',
  './js/world.js',
  './js/people.js',
  './js/places.js',
  './js/explore.js',
  './js/hub.js', './js/smartcity.js',
  './js/games/fishing.js',
  './js/games/crossing.js',
  './js/games/dance.js',
  './js/games/obby.js',
  './js/games/boat.js',
      './js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // 하나가 실패해도 나머지는 받아 둔다 (전부 아니면 전무가 되지 않게)
    await Promise.allSettled(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 옛 버전 캐시를 지운다
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k.startsWith('playcity-'))
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 남의 집 요청은 건드리지 않는다

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;                        // 캐시에 있으면 네트워크를 안 쓴다
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const c = await caches.open(VERSION);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // 오프라인인데 캐시에도 없다 → 첫 화면이라도 준다
      const home = await caches.match('./index.html');
      if (home) return home;
      throw err;
    }
  })());
});

/** 페이지가 「다 받았니?」 물어볼 수 있게 */
self.addEventListener('message', async e => {
  if (e.data === 'ready?') {
    const c = await caches.open(VERSION);
    const keys = await c.keys();
    e.source?.postMessage({ offlineReady: keys.length >= ASSETS.length - 2, cached: keys.length });
  }
});
