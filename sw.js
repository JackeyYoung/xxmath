/* sw.js */
const CACHE_NAME = 'math-classroom-v1';
// 核心的静态资源，首次安装时缓存
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/localforage.min.js',
  './js/cloudbase.full.js',
  './app/main.js',
  './app/shell.js',
  './core/storage.js',
  './core/ui/global.js'
];

// 安装时缓存核心文件
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 拦截请求：优先走网络，网络失败则走缓存 (网络优先策略)
self.addEventListener('fetch', (e) => {
  // 不拦截 API 请求（比如大模型接口）
  if (e.request.url.includes('/api/') || e.request.url.includes('cloudbase')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 如果请求成功，动态更新缓存
        if (res && res.status === 200 && e.request.method === 'GET') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return res;
      })
      .catch(() => {
        // 如果断网了，从缓存里找
        return caches.match(e.request).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          // 如果没缓存且断网，针对页面导航返回离线页面
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});