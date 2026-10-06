const CACHE = 'mandaba-v3';
const TILES = 'mandaba-tiles';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon.svg', 'icon-192.png',
  'vendor/leaflet/leaflet.css', 'vendor/leaflet/leaflet.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// مربعات الخريطة: من الجوال أولاً، وإذا مو موجودة ننزلها ونحفظها
async function tile(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') {
    c.put(req, r.clone());
    if (Math.random() < 0.02) c.keys().then(ks => { if (ks.length > 4000) ks.slice(0, 1000).forEach(k => c.delete(k)); });
  }
  return r;
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.includes('project-osrm.org')) return;
  if (url.hostname.includes('basemaps.cartocdn.com')) return e.respondWith(tile(e.request));
  if (url.origin !== location.origin) return;
  // ملفات التطبيق: الشبكة أولاً حتى توصل التحديثات، وإذا ماكو نت من الكاش
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
