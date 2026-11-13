// Service worker «Аудит amoCRM»: сохраняет приложение в телефоне, чтобы оно открывалось без интернета.
//
// ВАЖНО: при КАЖДОЙ выкладке изменений повышайте VERSION (v1 → v2 → v3 …).
// Иначе телефон продолжит показывать старую сохранённую версию.
var VERSION = "v1";
var CACHE = "amo-audit-" + VERSION;
var FONTS_CACHE = "amo-audit-fonts"; // шрифты Google не меняются, их кэш между версиями не чистим

// Файлы приложения, которые сохраняем сразу при установке.
var CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./questions.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Новая версия включилась — удаляем старые сохранённые версии.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE && key !== FONTS_CACHE) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Шрифты Google: берём из кэша, если нет — скачиваем и запоминаем.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONTS_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res.ok || res.type === "opaque") cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Файлы приложения: сначала из сохранённой версии (быстро и без интернета), иначе из сети.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).catch(function () {
        if (req.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
