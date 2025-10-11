// service-worker.js
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("mentor-tracker-cache-v1").then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/styles.css",
        "/script.js",
        "/manifest.json",
        "/logo.jpg",
        "/logo/jpg"
      ]);
    })
  );
  console.log("Service Worker installed!");
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Serve from cache if available, otherwise fetch from network
      return response || fetch(event.request);
    })
  );
});
