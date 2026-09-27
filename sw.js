/* 星星模拟器 Service Worker：让手机加到桌面后断网也能打开外壳。
   策略：同源静态资源 cache-first，页面导航 network-first 且失败回落缓存。
   API 请求与版本探测文件永不缓存。

   注意：这里只缓存**代码**。作品与存档在 IndexedDB、设置在 localStorage，
   Service Worker 的更新与缓存清理都不会碰它们，所以「更新」永远是安全的。 */

const CACHE = 'xingxing-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg']))
      .catch(() => undefined),
  )
  // 刻意不在这里 skipWaiting：新版本先在 waiting 里待命，
  // 由页面提示用户、用户点了「立即更新」再接管，避免玩到一半外壳被换掉。
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

/** 页面点「立即更新」时让新 SW 接管 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 跨域接口与版本探测一律走网络，不缓存
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('/llm') || url.pathname.endsWith('/version.json')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put('./index.html', copy))
          return response
        })
        .catch(() => caches.match('./index.html').then((cached) => cached ?? Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached ?? Response.error())
    }),
  )
})
