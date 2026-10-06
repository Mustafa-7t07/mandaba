'use strict';
// ================= البيانات =================
const KEY = 'mandaba-data-v1';
const COLORS = ['#2f6ea5', '#b8872e', '#7a4fa3', '#2e8b57', '#c0563b', '#3a7d8c', '#8a6d3b', '#a33f6e', '#4a6fa5', '#6b8e23'];
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']; // حسب getDay()

let db = load();
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  return migrate(d || {});
}
// يحوّل أي نسخة قديمة للشكل الحالي بدون ما يضيع شي
function migrate(d) {
  d.areas = (d.areas && d.areas.length ? d.areas : ['المنطقة الأولى'])
    .map((a, i) => typeof a === 'string' ? { name: a, color: COLORS[i % COLORS.length], days: [] } : { days: [], ...a });
  d.pharmacies = (d.pharmacies || []).map(p => ({ days: [], ...p }));
  d.visits = d.visits || [];      // المهام (لها تاريخ)
  d.log = d.log || [];            // سجل الزيارات اللي صارت
  d.problems = d.problems || [];  // المشاكل العالقة
  d.center = d.center || [33.3152, 44.3661];
  d.zoom = d.zoom || 12;
  d.version = 2;
  return d;
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

// ================= أدوات =================
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pharm = id => db.pharmacies.find(p => p.id === id);
const areaOf = name => db.areas.find(a => a.name === name);
const hasLoc = p => p && p.lat !== '' && p.lng !== '' && p.lat != null && p.lng != null && !isNaN(+p.lat) && !isNaN(+p.lng);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }

function ymd(d = new Date()) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
const parse = s => new Date(s + 'T00:00');
const short = s => { const d = parse(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
const longDate = s => parse(s).toLocaleDateString('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });

function badge(areaName) {
  const a = areaOf(areaName);
  return areaName ? `<span class="badge" style="background:${a ? a.color : '#888'}">${esc(areaName)}</span>` : '';
}
const wazeUrl = p => hasLoc(p) ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes` : '';
const gmapsUrl = p => hasLoc(p) ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : (p.link || '');
const telUrl = n => 'tel:' + String(n).replace(/[^\d+]/g, '');
function waUrl(n) {
  let d = String(n).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '964' + d.slice(1); // رقم عراقي محلي
  return 'https://wa.me/' + d;
}
// يستخرج الإحداثيات من رابط كوكل ماب أو ويز إذا موجودة
function coordsFromLink(link) {
  const m = link && (link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    link.match(/[?&](?:q|ll|query|destination|daddr)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) ||
    link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
    link.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/));
  return m ? [m[1], m[2]] : null;
}
const lastVisit = pid => db.log.filter(l => l.pharmacyId === pid).map(l => l.date).sort().pop();
const visitedOn = (pid, date) => db.log.some(l => l.pharmacyId === pid && l.date === date);
// الصيدليات اللي زيارتها معتادة بهذا اليوم (حسب يوم الصيدلية أو يوم منطقتها)
function regularOn(dateStr) {
  const dow = parse(dateStr).getDay();
  return db.pharmacies.filter(p => p.days.includes(dow) || (areaOf(p.area)?.days || []).includes(dow));
}
const openTasks = () => db.visits.filter(v => !v.done);

// ================= التنقل =================
const VIEWS = {
  home: () => ['جولاتي', longDate(ymd())],
  map: () => ['الخريطة', `${db.pharmacies.filter(hasLoc).length} صيدلية على الخريطة`],
  customers: () => ['الزبائن', 'كل الصيدليات حسب المنطقة'],
  customer: () => { const p = pharm(currentId); return [p?.name || '', p?.area || '']; },
  problems: () => ['المشاكل العالقة', 'تبقى ظاهرة حتى تُحل'],
  settings: () => ['الإعدادات', 'المناطق والنسخ الاحتياطي'],
};
let currentView = 'home', currentId = null;
function show(view, id) {
  if (id !== undefined) currentId = id;
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  const navName = view === 'customer' ? 'customers' : view;
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('active', b.dataset.view === navName));
  if (view === 'map') { initMap(); setTimeout(() => map.invalidateSize(), 60); }
  render();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav.bottom button').forEach(b => b.onclick = () => show(b.dataset.view));
$('#btnBack').onclick = () => show('customers');

// ================= الرئيسية =================
function problemCard(pr) {
  const p = pharm(pr.pharmacyId);
  return `<div class="card problem">
    <div class="t">${esc(p ? p.name : pr.text)}</div>
    ${p ? `<div class="s">${esc(pr.text)}</div>` : ''}
    <div class="s">· ${short(pr.date)}</div>
    <div class="acts"><button class="btn small" data-solve="${pr.id}">✓ تم الحل</button></div></div>`;
}
function taskCard(v, showPharm = true) {
  const p = pharm(v.pharmacyId), today = ymd();
  const when = v.date < today && !v.done ? `<span class="late">متأخر · ${short(v.date)}</span>` : short(v.date);
  return `<div class="card task ${v.done ? 'done' : ''}">
    <button class="chk ${v.done ? 'on' : ''}" data-done="${v.id}">${v.done ? '✓' : ''}</button>
    <div><div class="t">${esc(v.text || 'زيارة')}</div>
    <div class="s">${showPharm && p ? `${badge(p.area)} <a href="#" data-open="${p.id}">${esc(p.name)}</a>` : ''} ${when}</div></div></div>`;
}
function regularCard(p) {
  const today = ymd(), done = visitedOn(p.id, today), w = wazeUrl(p);
  return `<div class="card ${done ? 'done' : ''}">
    <div class="t">${done ? '✅ ' : ''}${esc(p.name)}</div>
    <div class="s">${badge(p.area)} ${lastVisit(p.id) ? 'آخر زيارة ' + short(lastVisit(p.id)) : 'ما مزارة بعد'}</div>
    <div class="acts">
      ${done ? '' : `<button class="btn small" data-log="${p.id}">📝 سجّل زيارة</button>`}
      ${w ? `<a class="btn small waze" href="${w}" target="_blank" rel="noopener">🚗 ويز</a>` : ''}
      ${p.phone ? `<a class="btn small outline" href="${telUrl(p.phone)}">📞</a>` : ''}
      <button class="btn small outline" data-open="${p.id}">التفاصيل</button>
    </div></div>`;
}
function renderHome() {
  const today = ymd(), week = addDays(7);
  const probs = db.problems.filter(x => !x.resolved);
  $('#homeProblems').innerHTML = probs.length
    ? `<h2 class="red">⚠️ مشاكل عالقة <span class="count red">${probs.length}</span></h2>` + probs.map(problemCard).join('') : '';
  const tasks = db.visits.filter(v => (v.date <= today && !v.done) || (v.date === today && v.done)).sort((a, b) => a.date.localeCompare(b.date));
  $('#cntTasks').textContent = tasks.filter(v => !v.done).length;
  $('#homeTasks').innerHTML = tasks.length ? tasks.map(v => taskCard(v)).join('') : '<div class="empty">ماكو مهام اليوم 👌</div>';
  const reg = regularOn(today).sort((a, b) => visitedOn(a.id, today) - visitedOn(b.id, today));
  $('#cntRegular').textContent = reg.filter(p => !visitedOn(p.id, today)).length;
  $('#homeRegular').innerHTML = reg.length ? reg.map(regularCard).join('') : '<div class="empty">لا توجد زيارات معتادة مجدولة اليوم</div>';
  const up = db.visits.filter(v => v.date > today && v.date <= week && !v.done).sort((a, b) => a.date.localeCompare(b.date));
  $('#homeUpcoming').innerHTML = up.length ? up.map(v => taskCard(v)).join('') : '<div class="empty">ماكو مهام قادمة</div>';
}

// ================= الزبائن =================
let areaFilter = '';
function renderCustomers() {
  $('#areaChips').innerHTML = `<button class="chip ${areaFilter ? '' : 'on'}" data-chip="">الكل</button>` +
    db.areas.map(a => `<button class="chip ${areaFilter === a.name ? 'on' : ''}" data-chip="${esc(a.name)}">${esc(a.name)}</button>`).join('');
  const q = $('#search').value.trim().toLowerCase();
  const list = db.pharmacies
    .filter(p => !areaFilter || p.area === areaFilter)
    .filter(p => !q || [p.name, p.phone, p.phone2, p.owner, p.area, p.address].some(f => (f || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.area || '').localeCompare(b.area || '', 'ar') || a.name.localeCompare(b.name, 'ar'));
  $('#custList').innerHTML = list.length ? list.map(p => {
    const lv = lastVisit(p.id);
    return `<div class="card click" data-open="${p.id}"><div>
      <div class="t">${esc(p.name)}</div>
      ${p.phone ? `<div class="s" dir="ltr" style="justify-content:flex-end">${esc(p.phone)}</div>` : ''}
      <div class="s">${badge(p.area)} ${lv ? 'آخر زيارة ' + short(lv) : ''} ${hasLoc(p) ? '' : '<span title="بدون موقع">📍✗</span>'}</div>
    </div></div>`;
  }).join('') : '<div class="empty">ماكو زبائن هنا بعد</div>';
}
$('#search').oninput = renderCustomers;

// ================= صفحة الزبون =================
function renderCustomer() {
  const p = pharm(currentId);
  if (!p) { $('#custBody').innerHTML = ''; return; }
  const w = wazeUrl(p), g = gmapsUrl(p);
  const days = [...new Set([...p.days, ...(areaOf(p.area)?.days || [])])].sort().map(d => DAYS[d]).join('، ');
  const hist = [
    ...db.log.filter(l => l.pharmacyId === p.id).map(l => ({ date: l.date, html: `<b>📝 زيارة</b><div class="notes">${esc(l.note || '')}</div>`, id: l.id, kind: 'log' })),
    ...db.visits.filter(v => v.pharmacyId === p.id).map(v => ({ date: v.date, html: `<div class="task"><button class="chk ${v.done ? 'on' : ''}" data-done="${v.id}">${v.done ? '✓' : ''}</button><div><b>${esc(v.text || 'زيارة')}</b><div class="muted">مهمة</div></div></div>`, id: v.id, kind: 'task' })),
    ...db.problems.filter(x => x.pharmacyId === p.id).map(x => ({ date: x.date, html: `<b style="color:var(--dg)">⚠️ ${esc(x.text)}</b> <span class="muted">${x.resolved ? '(محلولة)' : '(مفتوحة)'}</span>`, id: x.id, kind: 'problem' })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  $('#custBody').innerHTML = `
    <div class="card info">
      <div class="r"><span class="k">المنطقة</span><span class="v">${badge(p.area)}</span></div>
      ${p.owner ? `<div class="r"><span class="k">المسؤول</span><span class="v">${esc(p.owner)}</span></div>` : ''}
      ${p.phone ? `<div class="r"><span class="k">الهاتف</span><span class="v"><a href="${telUrl(p.phone)}" dir="ltr">${esc(p.phone)}</a></span></div>` : ''}
      ${p.phone2 ? `<div class="r"><span class="k">هاتف ثاني</span><span class="v"><a href="${telUrl(p.phone2)}" dir="ltr">${esc(p.phone2)}</a></span></div>` : ''}
      ${p.address ? `<div class="r"><span class="k">العنوان</span><span class="v">${esc(p.address)}</span></div>` : ''}
      <div class="r"><span class="k">الموقع</span><span class="v">${g ? `<a href="${esc(g)}" target="_blank" rel="noopener">فتح في الخرائط</a>` : '<span class="muted">ما محدد</span>'}</span></div>
      <div class="r"><span class="k">زيارة معتادة</span><span class="v">${days || '<span class="muted">—</span>'}</span></div>
      ${p.notes ? `<div class="r"><span class="k">ملاحظات</span><span class="v notes">${esc(p.notes)}</span></div>` : ''}
    </div>
    <div class="grid2">
      ${w ? `<a class="btn waze" href="${w}" target="_blank" rel="noopener">🚗 ويز</a>` : ''}
      ${p.phone ? `<a class="btn outline" href="${telUrl(p.phone)}">📞 اتصال</a>` : ''}
      ${p.phone ? `<a class="btn wa" href="${waUrl(p.phone)}" target="_blank" rel="noopener">واتساب</a>` : ''}
      <button class="btn" data-log="${p.id}">📝 تسجيل زيارة</button>
      <button class="btn outline" data-addtask="${p.id}">✓ إضافة مهمة</button>
      <button class="btn link" data-report="${p.id}">⚠️ إبلاغ عن مشكلة</button>
      <button class="btn link" data-edit="${p.id}">✎ تعديل البيانات</button>
    </div>
    <h2>📖 سجل الزيارات والمهام</h2>
    <div class="card hist">${hist.length ? hist.map(h => `<div class="h"><div class="muted">${longDate(h.date)}</div>${h.html}
      <button class="btn link small" style="color:var(--mu)" data-delitem="${h.kind}:${h.id}">حذف</button></div>`).join('') : '<p class="muted">ماكو سجل بعد</p>'}</div>
    <button class="btn wide danger" data-delpharm="${p.id}">حذف هذا الزبون نهائياً</button>`;
}

// ================= المشاكل =================
function renderProblems() {
  const open = db.problems.filter(x => !x.resolved).sort((a, b) => b.date.localeCompare(a.date));
  const solved = db.problems.filter(x => x.resolved).sort((a, b) => (b.resolvedAt || '').localeCompare(a.resolvedAt || '')).slice(0, 30);
  $('#cntProblems').textContent = open.length;
  $('#openProblems').innerHTML = open.length ? open.map(problemCard).join('') : '<div class="empty">ماكو مشاكل مفتوحة 👌</div>';
  $('#solvedProblems').innerHTML = solved.length ? `<div class="card hist">${solved.map(x => {
    const p = pharm(x.pharmacyId);
    return `<div class="h"><s>${p ? esc(p.name) + ' — ' : ''}${esc(x.text)}</s><div class="muted">${short(x.resolvedAt || x.date)}
      <button class="btn link small" data-unsolve="${x.id}">↩️ إرجاع</button></div></div>`;
  }).join('')}</div>` : '<div class="empty">ماكو</div>';
  const b = $('#navBadge'); b.hidden = !open.length; b.textContent = open.length;
}

// ================= الإعدادات / المناطق =================
function daysPicker(name, selected) {
  return DAYS.map((d, i) => `<label><input type="checkbox" name="${name}" value="${i}" ${selected.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('');
}
function renderSettings() {
  $('#areaList').innerHTML = db.areas.map((a, i) => `<div class="card">
    <div class="row" style="align-items:center">
      <span class="badge" style="background:${a.color}">${esc(a.name)}</span>
      <span class="muted">${db.pharmacies.filter(p => p.area === a.name).length} صيدلية</span>
      <button class="btn small outline" data-rename-area="${i}">تعديل</button>
      <button class="btn small danger" data-del-area="${i}">حذف</button>
    </div>
    <div class="days" style="margin:10px 0 0" data-area-days="${i}">${daysPicker('ad' + i, a.days)}</div>
  </div>`).join('');
}
$('#areaList').addEventListener('change', e => {
  const box = e.target.closest('[data-area-days]'); if (!box) return;
  db.areas[+box.dataset.areaDays].days = [...box.querySelectorAll('input:checked')].map(x => +x.value);
  save(); toast('تم حفظ أيام المنطقة');
});
$('#btnAddArea').onclick = () => {
  const v = $('#newArea').value.trim();
  if (!v || areaOf(v)) return;
  db.areas.push({ name: v, color: COLORS[db.areas.length % COLORS.length], days: [] });
  save(); $('#newArea').value = ''; render();
};

// ================= الخريطة =================
let map, markers, meMarker, routeLayer;
function initMap() {
  if (map) return;
  map = L.map('map').setView(db.center, db.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  markers = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  map.on('moveend', () => { const c = map.getCenter(); db.center = [c.lat, c.lng]; db.zoom = map.getZoom(); save(); });
  map.on('contextmenu', e => openPharmForm(null, { lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) }));
  setTimeout(() => $('#mapHint').style.display = 'none', 6000);
  renderMap();
  const pts = db.pharmacies.filter(hasLoc).map(p => [+p.lat, +p.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
}
function pinIcon(color) {
  return L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 34], popupAnchor: [0, -30],
    html: `<svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 0C5.8 0 0 5.6 0 12.6 0 22 13 34 13 34s13-12 13-21.4C26 5.6 20.2 0 13 0z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="13" cy="12.5" r="4.5" fill="#fff"/></svg>` });
}
function renderMap() {
  if (!map) return;
  markers.clearLayers();
  db.pharmacies.filter(hasLoc).forEach(p => {
    const lv = lastVisit(p.id);
    L.marker([+p.lat, +p.lng], { icon: pinIcon(areaOf(p.area)?.color || '#134e40') }).addTo(markers).bindPopup(`
      <b>${esc(p.name)}</b><br>${badge(p.area)} ${lv ? '· آخر زيارة ' + short(lv) : ''}<br>
      <a class="btn waze" href="${wazeUrl(p)}" target="_blank" rel="noopener">🚗 افتح بويز</a>
      <button class="btn outline" data-open="${p.id}">التفاصيل</button>`);
  });
}
function getGps() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('no-gps'));
    navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}
function showMe(c) {
  const ll = [c.latitude, c.longitude];
  if (meMarker) meMarker.setLatLng(ll);
  else meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="pin-me"></div>', iconSize: [16, 16] }), zIndexOffset: 1000 }).addTo(map);
  return ll;
}
$('#btnLocate').onclick = async () => {
  try { map.setView(showMe(await getGps()), 16); } catch (e) { toast('ما كدرت أجيب موقعك. تأكد إن الموقع مفعّل.'); }
};
$('#btnAddHere').onclick = async () => {
  try { const c = await getGps(); openPharmForm(null, { lat: c.latitude.toFixed(6), lng: c.longitude.toFixed(6) }); }
  catch (e) { toast('ما كدرت أجيب موقعك'); }
};

// ================= تخطيط الجولة =================
// المسافة المستقيمة بالمتر (تُستخدم إذا ماكو نت للطرق)
function haversine(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const OSRM = 'https://router.project-osrm.org';
const coordStr = pts => pts.map(p => `${(+p[1]).toFixed(6)},${(+p[0]).toFixed(6)}`).join(';');
async function fetchJson(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
// مصفوفة أوقات السياقة بين كل النقاط، وإذا فشلت نستخدم المسافة المستقيمة
async function costMatrix(pts) {
  try {
    const j = await fetchJson(`${OSRM}/table/v1/driving/${coordStr(pts)}?annotations=duration`);
    if (j.code === 'Ok' && j.durations.every(r => r.every(x => x != null))) return { m: j.durations, roads: true };
  } catch (e) {}
  return { m: pts.map(a => pts.map(b => haversine(a, b))), roads: false };
}
// يرتب المحطات: البداية ثابتة (0)، والنهاية ثابتة إذا fixedEnd. الأقرب أولاً ثم تحسين 2-opt
function solveOrder(m, fixedEnd) {
  const n = m.length;
  const last = fixedEnd ? n - 1 : -1;
  const left = new Set([...Array(n).keys()].filter(i => i !== 0 && i !== last));
  const order = [0];
  while (left.size) {
    const cur = order[order.length - 1];
    let best = null;
    left.forEach(i => { if (best === null || m[cur][i] < m[cur][best]) best = i; });
    order.push(best); left.delete(best);
  }
  if (fixedEnd) order.push(last);
  const cost = o => o.reduce((s, x, i) => i ? s + m[o[i - 1]][x] : 0, 0);
  const hi = fixedEnd ? order.length - 2 : order.length - 1;
  let improved = true, bestCost = cost(order), guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < hi; i++) for (let k = i + 1; k <= hi; k++) {
      const cand = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
      const c = cost(cand);
      if (c < bestCost - 1e-6) { order.splice(0, order.length, ...cand); bestCost = c; improved = true; }
    }
  }
  return order;
}
function routeStops(source) {
  const today = ymd();
  if (source === 'today') {
    const ids = new Set(regularOn(today).filter(p => !visitedOn(p.id, today)).map(p => p.id));
    openTasks().filter(v => v.date <= today && v.pharmacyId).forEach(v => ids.add(v.pharmacyId));
    return [...ids].map(pharm).filter(Boolean);
  }
  if (source === 'all') return db.pharmacies;
  return db.pharmacies.filter(p => p.area === source.slice(5));
}
function openRouteDialog(source = 'today') {
  const opts = `<option value="today">زيارات اليوم (المعتادة + المهام)</option>` +
    db.areas.map(a => `<option value="area:${esc(a.name)}">منطقة ${esc(a.name)}</option>`).join('') +
    `<option value="all">كل الصيدليات</option>`;
  $('#routeSource').innerHTML = opts; $('#routeSource').value = source;
  fillRouteEnds();
  $('#dlgRoute').showModal();
}
function fillRouteEnds() {
  const stops = routeStops($('#routeSource').value).filter(hasLoc);
  const po = stops.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#routeStart').innerHTML = `<option value="gps">📍 موقعي الحالي</option>` + po;
  $('#routeEnd').innerHTML = `<option value="">أي وحدة (الأبعد تكون الأخيرة)</option>` + po;
}
$('#routeSource').onchange = fillRouteEnds;
$('#btnRoutePlan').onclick = () => openRouteDialog();
$('#btnRouteToday').onclick = () => { show('map'); openRouteDialog('today'); };

let route = null; // {stops:[pharm], start:[lat,lng], startName, legs:[m], total:{m,s}, roads}
$('#dlgRoute').addEventListener('close', async () => {
  if ($('#dlgRoute').returnValue !== 'save') return;
  const f = $('#formRoute').elements;
  const all = routeStops(f.source.value);
  let stops = all.filter(hasLoc);
  const missing = all.length - stops.length;
  if (!stops.length) return toast('ماكو صيدليات بيها موقع بهاي القائمة');
  let start, startName;
  if (f.start.value === 'gps') {
    toast('دا أجيب موقعك...');
    try { const c = await getGps(); showMe(c); start = [c.latitude, c.longitude]; startName = 'موقعي'; }
    catch (e) { return toast('ما كدرت أجيب موقعك. اختار صيدلية كبداية.'); }
  } else {
    const sp = pharm(f.start.value); start = [+sp.lat, +sp.lng]; startName = sp.name;
    stops = [sp, ...stops.filter(p => p.id !== sp.id)];
  }
  const endP = f.end.value && f.end.value !== f.start.value ? pharm(f.end.value) : null;
  if (endP) stops = [...stops.filter(p => p.id !== endP.id), endP];
  if (stops.length > 60) { toast('أكثر من 60 صيدلية، راح آخذ أقرب 60'); stops = stops.sort((a, b) => haversine(start, [+a.lat, +a.lng]) - haversine(start, [+b.lat, +b.lng])).slice(0, 60); if (endP && !stops.includes(endP)) stops[59] = endP; }
  toast('دا أرتب الجولة...');
  // إذا البداية صيدلية فهي أول محطة؛ وإلا موقعي هو النقطة 0
  const startIsStop = f.start.value !== 'gps';
  const pts = startIsStop ? stops.map(p => [+p.lat, +p.lng]) : [start, ...stops.map(p => [+p.lat, +p.lng])];
  const { m, roads } = await costMatrix(pts);
  const order = solveOrder(m, !!endP);
  const orderedStops = order.filter(i => startIsStop || i > 0).map(i => stops[startIsStop ? i : i - 1]);
  route = { stops: orderedStops, start, startName, startIsStop, roads, missing };
  await drawRoute();
  openRouteList();
});
async function drawRoute() {
  routeLayer.clearLayers();
  if (!route) { $('#routeBar').hidden = true; return; }
  const pts = route.startIsStop ? route.stops.map(p => [+p.lat, +p.lng]) : [route.start, ...route.stops.map(p => [+p.lat, +p.lng])];
  let line = pts, legs = null, total = null;
  if (pts.length > 1) {
    try {
      const j = await fetchJson(`${OSRM}/route/v1/driving/${coordStr(pts)}?overview=full&geometries=geojson`);
      if (j.code === 'Ok') {
        line = j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        legs = j.routes[0].legs.map(l => ({ m: l.distance, s: l.duration }));
        total = { m: j.routes[0].distance, s: j.routes[0].duration };
      }
    } catch (e) {}
  }
  if (!legs) {
    legs = pts.slice(1).map((p, i) => ({ m: haversine(pts[i], p) * 1.3, s: null }));
    total = { m: legs.reduce((s, l) => s + l.m, 0), s: null };
    route.approx = true;
  } else route.approx = false;
  route.legs = route.startIsStop ? [null, ...legs] : legs;
  route.total = total;
  L.polyline(line, { color: '#134e40', weight: 5, opacity: .8 }).addTo(routeLayer);
  route.stops.forEach((p, i) => L.marker([+p.lat, +p.lng], {
    icon: L.divIcon({ className: '', html: `<div class="num-pin">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }), zIndexOffset: 500,
  }).addTo(routeLayer).bindPopup(`<b>${i + 1}. ${esc(p.name)}</b><br><a class="btn waze" href="${wazeUrl(p)}" target="_blank" rel="noopener">🚗 ويز</a> <button class="btn outline" data-log="${p.id}">📝 سجّل زيارة</button>`));
  map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  $('#routeBar').hidden = false;
  $('#routeBarText').textContent = `🧭 ${route.stops.length} محطة · ${fmtKm(total.m)}${total.s ? ' · ' + fmtMin(total.s) : ''}`;
}
const fmtKm = m => m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
const fmtMin = s => s < 3600 ? `${Math.round(s / 60)} دقيقة` : `${Math.floor(s / 3600)} س ${Math.round(s % 3600 / 60)} د`;
function gmapsRouteLinks() {
  // كوكل ماب يقبل لحد 9 نقاط وسطية، فنقسم الجولة لأجزاء
  const pts = (route.startIsStop ? [] : [route.start]).concat(route.stops.map(p => [p.lat, p.lng]));
  const links = [];
  for (let i = 0; i < pts.length - 1; i += 10) {
    const part = pts.slice(i, i + 11);
    const o = part[0], d = part[part.length - 1], w = part.slice(1, -1);
    links.push(`https://www.google.com/maps/dir/?api=1&origin=${o.join(',')}&destination=${d.join(',')}${w.length ? '&waypoints=' + w.map(x => x.join(',')).join('%7C') : ''}&travelmode=driving`);
  }
  return links;
}
function openRouteList() {
  if (!route) return;
  const today = ymd(), links = gmapsRouteLinks();
  $('#routeListBody').innerHTML = `
    <p class="muted">${route.stops.length} محطة · ${fmtKm(route.total.m)}${route.total.s ? ' · تقريباً ' + fmtMin(route.total.s) + ' سياقة' : ''}
    ${route.approx ? '<br>⚠️ ماكو اتصال بخدمة الطرق، الترتيب حسب المسافة المباشرة.' : ''}
    ${route.missing ? `<br>⚠️ ${route.missing} صيدلية ما بيها موقع وما دخلت بالجولة.` : ''}</p>
    ${route.startIsStop ? '' : `<div class="stop"><span class="n">⌂</span><div><b>${esc(route.startName)}</b></div></div>`}
    ${route.stops.map((p, i) => {
      const done = visitedOn(p.id, today), leg = route.legs[i];
      return `<div class="stop"><span class="n ${done ? 'done' : ''}">${i + 1}</span><div>
        <b>${esc(p.name)}</b> ${done ? '✅' : ''}<div class="muted">${badge(p.area)} ${leg ? fmtKm(leg.m) + (leg.s ? ' · ' + fmtMin(leg.s) : '') : 'البداية'}</div></div>
        <a class="btn small waze" href="${wazeUrl(p)}" target="_blank" rel="noopener">ويز</a>
        ${done ? '' : `<button class="btn small outline" data-log="${p.id}">📝</button>`}</div>`;
    }).join('')}
    ${links.map((l, i) => `<a class="btn wide outline" href="${l}" target="_blank" rel="noopener">🗺️ افتح الجولة بكوكل ماب${links.length > 1 ? ' (جزء ' + (i + 1) + ')' : ''}</a>`).join('')}
    <p class="muted">ويز ما يقبل أكثر من وجهة وحدة، فاضغط "ويز" على كل محطة بالترتيب.</p>`;
  if (!$('#dlgRouteList').open) $('#dlgRouteList').showModal();
}
$('#btnRouteShow').onclick = openRouteList;
$('#btnRouteClear').onclick = () => { route = null; drawRoute(); };

// ================= نموذج الزبون =================
let editingId = null;
function fillAreaSelect(sel) {
  $('#areaSelect').innerHTML = db.areas.map(a => `<option ${a.name === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('') + '<option value="__new">＋ منطقة جديدة...</option>';
}
$('#areaSelect').onchange = e => {
  if (e.target.value !== '__new') return;
  const n = (prompt('اسم المنطقة الجديدة') || '').trim();
  if (n && !areaOf(n)) { db.areas.push({ name: n, color: COLORS[db.areas.length % COLORS.length], days: [] }); save(); }
  fillAreaSelect(n || db.areas[0].name);
};
const PFIELDS = ['name', 'owner', 'phone', 'phone2', 'address', 'lat', 'lng', 'link', 'notes'];
function openPharmForm(id, preset = {}) {
  editingId = id;
  const p = id ? pharm(id) : { area: areaFilter || db.areas[0].name, days: [], ...preset };
  const f = $('#formPharm');
  $('#dlgPharmTitle').textContent = id ? 'تعديل البيانات' : 'زبون جديد';
  fillAreaSelect(p.area);
  PFIELDS.forEach(k => f.elements[k].value = p[k] || '');
  $('#pharmDays').innerHTML = daysPicker('pdays', p.days || []);
  $('#dlgPharm').showModal();
}
$('#formPharm').elements.link.addEventListener('input', e => {
  const f = $('#formPharm'), c = coordsFromLink(e.target.value);
  if (c) { f.elements.lat.value = c[0]; f.elements.lng.value = c[1]; toast('تم أخذ الإحداثيات من الرابط'); }
});
$('#btnUseGps').onclick = async () => {
  try { const c = await getGps(); const f = $('#formPharm'); f.elements.lat.value = c.latitude.toFixed(6); f.elements.lng.value = c.longitude.toFixed(6); toast('تم تحديد موقعك'); }
  catch (e) { toast('ما كدرت أجيب موقعك'); }
};
$('#dlgPharm').addEventListener('close', () => {
  if ($('#dlgPharm').returnValue !== 'save') return;
  const f = $('#formPharm');
  const data = Object.fromEntries(PFIELDS.map(k => [k, f.elements[k].value.trim()]));
  data.area = f.elements.area.value === '__new' ? db.areas[0].name : f.elements.area.value;
  data.days = [...f.querySelectorAll('input[name=pdays]:checked')].map(x => +x.value);
  if (editingId) Object.assign(pharm(editingId), data);
  else { const p = { id: uid(), created: ymd(), ...data }; db.pharmacies.push(p); currentId = p.id; }
  save(); render(); toast('تم الحفظ');
});
$('#btnNewPharm').onclick = () => openPharmForm(null);

// ================= مهمة / زيارة / مشكلة =================
function fillPharmSelects(sel) {
  const opts = '<option value="">— بدون —</option>' + [...db.pharmacies].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    .map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.area || '')})</option>`).join('');
  document.querySelectorAll('.pharmSelect').forEach(s => { s.innerHTML = opts; s.value = sel || ''; });
}
function openTaskForm(pid) {
  fillPharmSelects(pid); const f = $('#formTask'); f.elements.text.value = ''; f.elements.date.value = ymd();
  $('#dlgTask').showModal();
}
$('#dlgTask').addEventListener('close', () => {
  if ($('#dlgTask').returnValue !== 'save') return;
  const f = $('#formTask').elements;
  db.visits.push({ id: uid(), pharmacyId: f.pharmacyId.value || null, date: f.date.value, text: f.text.value.trim(), done: false });
  save(); render(); toast('تمت إضافة المهمة');
});
let logPid = null;
function openLogForm(pid) {
  logPid = pid; const f = $('#formLog'); f.reset(); f.elements.date.value = ymd();
  $('#logPharmName').textContent = pharm(pid)?.name || '';
  $('#dlgLog').showModal();
}
$('#dlgLog').addEventListener('close', () => {
  if ($('#dlgLog').returnValue !== 'save') return;
  const f = $('#formLog').elements;
  db.log.push({ id: uid(), pharmacyId: logPid, date: f.date.value, note: f.note.value.trim() });
  // أي مهمة لهاي الصيدلية مستحقة لحد هذا اليوم تنعلّم إنها تمت
  db.visits.forEach(v => { if (v.pharmacyId === logPid && !v.done && v.date <= f.date.value && /زيارة|^$/.test(v.text || '')) v.done = true; });
  if (f.next.value) db.visits.push({ id: uid(), pharmacyId: logPid, date: f.next.value, text: 'زيارة', done: false });
  save(); render(); toast('تم تسجيل الزيارة');
  if (route && $('#dlgRouteList').open) openRouteList();
});
function openProblemForm(pid) {
  fillPharmSelects(pid); $('#formProblem').elements.text.value = '';
  $('#dlgProblem').showModal();
}
$('#dlgProblem').addEventListener('close', () => {
  if ($('#dlgProblem').returnValue !== 'save') return;
  const f = $('#formProblem').elements;
  db.problems.push({ id: uid(), pharmacyId: f.pharmacyId.value || null, text: f.text.value.trim(), date: ymd(), resolved: false });
  save(); render(); toast('تمت إضافة المشكلة');
});
$('#btnNewProblem').onclick = () => openProblemForm(null);

// ================= الأزرار العامة =================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-open],[data-done],[data-edit],[data-log],[data-addtask],[data-report],[data-solve],[data-unsolve],[data-delitem],[data-delpharm],[data-chip],[data-del-area],[data-rename-area],[data-close-dlg]');
  if (!el) return;
  const d = el.dataset;
  if (d.open) { e.preventDefault(); document.querySelectorAll('dialog[open]').forEach(x => x.close()); map && map.closePopup(); show('customer', d.open); }
  else if (d.done) { const v = db.visits.find(x => x.id === d.done); v.done = !v.done; save(); render(); }
  else if (d.edit) openPharmForm(d.edit);
  else if (d.log) openLogForm(d.log);
  else if (d.addtask) openTaskForm(d.addtask);
  else if (d.report) openProblemForm(d.report);
  else if (d.solve) { const x = db.problems.find(y => y.id === d.solve); x.resolved = true; x.resolvedAt = ymd(); save(); render(); toast('تم الحل 👍'); }
  else if (d.unsolve) { const x = db.problems.find(y => y.id === d.unsolve); x.resolved = false; save(); render(); }
  else if (d.delitem) {
    const [kind, id] = d.delitem.split(':');
    if (!confirm('تحذف هذا السجل؟')) return;
    if (kind === 'log') db.log = db.log.filter(x => x.id !== id);
    if (kind === 'task') db.visits = db.visits.filter(x => x.id !== id);
    if (kind === 'problem') db.problems = db.problems.filter(x => x.id !== id);
    save(); render();
  }
  else if (d.delpharm) {
    if (!confirm('متأكد تريد تحذف هذا الزبون وكل سجله؟')) return;
    const id = d.delpharm;
    db.pharmacies = db.pharmacies.filter(p => p.id !== id);
    db.visits = db.visits.filter(v => v.pharmacyId !== id);
    db.log = db.log.filter(v => v.pharmacyId !== id);
    db.problems = db.problems.filter(v => v.pharmacyId !== id);
    save(); show('customers');
  }
  else if (d.chip !== undefined) { areaFilter = d.chip; renderCustomers(); }
  else if (d.delArea) {
    const a = db.areas[+d.delArea];
    if (db.pharmacies.some(p => p.area === a.name)) return toast('المنطقة بيها صيدليات، انقلهم أول');
    if (db.areas.length === 1) return toast('لازم تبقى منطقة وحدة على الأقل');
    db.areas.splice(+d.delArea, 1); save(); render();
  }
  else if (d.renameArea) {
    const a = db.areas[+d.renameArea], n = (prompt('الاسم الجديد', a.name) || '').trim();
    if (!n || n === a.name || areaOf(n)) return;
    db.pharmacies.forEach(p => { if (p.area === a.name) p.area = n; });
    if (areaFilter === a.name) areaFilter = n;
    a.name = n; save(); render();
  }
  else if (d.closeDlg) $('#' + d.closeDlg).close();
});

// ================= نسخ احتياطي =================
$('#btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `mandaba-backup-${ymd()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#fileImport').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.pharmacies)) throw 0;
    if (!confirm(`راح تنمسح البيانات الحالية وتنحط مكانها النسخة (${d.pharmacies.length} صيدلية). متأكد؟`)) return;
    db = migrate(d); save(); render(); toast('تم الاستيراد');
  } catch (err) { toast('الملف مو صالح'); }
  e.target.value = '';
};

// ================= العرض =================
function render() {
  const [t, s] = VIEWS[currentView]();
  $('#pageTitle').textContent = t; $('#pageSub').textContent = s;
  renderHome(); renderCustomers(); renderProblems(); renderSettings(); renderMap();
  if (currentView === 'customer') renderCustomer();
}
save(); // يحفظ الشكل الجديد بعد التحويل
render();
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
