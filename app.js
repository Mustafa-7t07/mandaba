'use strict';
// ===== التخزين =====
const KEY = 'mandaba-data-v1';
let db = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.pharmacies) return d;
  } catch (e) {}
  return { areas: ['المنطقة الأولى'], pharmacies: [], visits: [], center: [33.3152, 44.3661], zoom: 12 };
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pharm = id => db.pharmacies.find(p => p.id === id);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

// التاريخ المحلي بصيغة YYYY-MM-DD
function ymd(d = new Date()) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
function fmtDate(s) { return new Date(s + 'T00:00').toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' }); }

// ===== ويز =====
function wazeUrl(p) {
  if (p.lat && p.lng) return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
  return p.link || '';
}
// يستخرج الإحداثيات من رابط خرائط كوكل أو ويز إذا موجودة
function coordsFromLink(link) {
  const m = link && (link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || link.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i) || link.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/));
  return m ? [m[1], m[2]] : null;
}

// ===== التبويبات =====
const titles = { today: 'اليوم', map: 'الخريطة', list: 'الصيدليات', more: 'المزيد' };
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#pageTitle').textContent = titles[name];
  if (name === 'map') { initMap(); setTimeout(() => map.invalidateSize(), 50); }
  render();
}
document.querySelectorAll('nav.bottom button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ===== صفحة اليوم =====
function visitCard(v, cls = '') {
  const p = pharm(v.pharmacyId) || { name: '(صيدلية محذوفة)' };
  const w = wazeUrl(p);
  return `<div class="card ${cls} ${v.done ? 'done' : ''}">
    <div class="t">${esc(p.name)}</div>
    <div class="s">${esc(p.area || '')} · ${fmtDate(v.date)}</div>
    ${v.text ? `<div class="s">📝 ${esc(v.text)}</div>` : ''}
    <div class="acts">
      <button class="btn small" data-done="${v.id}">${v.done ? '↩️ تراجع' : '✅ تمت'}</button>
      ${w ? `<a class="btn small waze" href="${esc(w)}" target="_blank" rel="noopener">🚗 ويز</a>` : ''}
      ${p.phone ? `<a class="btn small outline" href="tel:${esc(p.phone)}">📞 اتصال</a>` : ''}
      ${p.id ? `<button class="btn small outline" data-open="${p.id}">التفاصيل</button>` : ''}
    </div></div>`;
}
function renderToday() {
  const today = ymd(), week = addDays(7);
  $('#todayDate').textContent = fmtDate(today);
  const vs = [...db.visits].sort((a, b) => a.date.localeCompare(b.date));
  const t = vs.filter(v => v.date === today);
  const late = vs.filter(v => v.date < today && !v.done);
  const up = vs.filter(v => v.date > today && v.date <= week && !v.done);
  $('#todayList').innerHTML = t.length ? t.map(v => visitCard(v)).join('') : '<div class="empty">ماكو زيارات اليوم 👌</div>';
  $('#lateTitle').style.display = late.length ? '' : 'none';
  $('#lateList').innerHTML = late.map(v => visitCard(v, 'late')).join('');
  $('#upcomingList').innerHTML = up.length ? up.map(v => visitCard(v)).join('') : '<div class="empty">ماكو زيارات قادمة</div>';
}

// ===== قائمة الصيدليات حسب المنطقة =====
function renderList() {
  const q = $('#search').value.trim();
  const groups = {};
  db.pharmacies
    .filter(p => !q || p.name.includes(q) || (p.area || '').includes(q) || (p.notes || '').includes(q))
    .forEach(p => (groups[p.area || 'بدون منطقة'] ??= []).push(p));
  const areas = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ar'));
  $('#pharmList').innerHTML = areas.length ? areas.map(a => `
    <div class="area-h"><span>📍 ${esc(a)}</span><span>${groups[a].length}</span></div>
    ${groups[a].sort((x, y) => x.name.localeCompare(y.name, 'ar')).map(p => {
      const next = nextVisit(p.id);
      return `<div class="card" data-open="${p.id}">
        <div class="t">${esc(p.name)}</div>
        ${next ? `<div class="s">🗓️ الزيارة الجاية: ${fmtDate(next.date)}</div>` : ''}
        ${p.notes ? `<div class="s">${esc(p.notes.slice(0, 80))}</div>` : ''}
      </div>`;
    }).join('')}`).join('') : '<div class="empty">ماكو صيدليات بعد. ضيف وحدة من الزر الجوة أو من الخريطة.</div>';
}
function nextVisit(pid) {
  return db.visits.filter(v => v.pharmacyId === pid && !v.done).sort((a, b) => a.date.localeCompare(b.date))[0];
}

// ===== المناطق =====
function renderAreas() {
  $('#areaList').innerHTML = db.areas.map((a, i) => `<div class="card row"><span>${esc(a)} <span class="muted">(${db.pharmacies.filter(p => p.area === a).length})</span></span>
    <button class="btn small outline" data-rename-area="${i}">تعديل</button>
    <button class="btn small danger" data-del-area="${i}">حذف</button></div>`).join('');
}
$('#btnAddArea').onclick = () => {
  const v = $('#newArea').value.trim();
  if (!v || db.areas.includes(v)) return;
  db.areas.push(v); save(); $('#newArea').value = ''; render();
};

// ===== الخريطة =====
let map, markers, meMarker;
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView(db.center, db.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  markers = L.layerGroup().addTo(map);
  map.on('moveend', () => { const c = map.getCenter(); db.center = [c.lat, c.lng]; db.zoom = map.getZoom(); save(); });
  map.on('contextmenu', e => openPharmForm(null, { lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) }));
  setTimeout(() => $('#mapHint').style.display = 'none', 6000);
  renderMap();
  if (db.pharmacies.some(p => p.lat)) fitAll();
}
function fitAll() {
  const pts = db.pharmacies.filter(p => p.lat && p.lng).map(p => [+p.lat, +p.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
}
function renderMap() {
  if (!map) return;
  markers.clearLayers();
  db.pharmacies.filter(p => p.lat && p.lng).forEach(p => {
    const next = nextVisit(p.id);
    L.marker([+p.lat, +p.lng]).addTo(markers).bindPopup(`
      <b>${esc(p.name)}</b><br><span class="muted">${esc(p.area || '')}</span>
      ${next ? `<br>🗓️ ${fmtDate(next.date)}` : ''}<br>
      <a class="btn waze" href="${esc(wazeUrl(p))}" target="_blank" rel="noopener">🚗 افتح بويز</a>
      <button class="btn outline" data-open="${p.id}">التفاصيل</button>`);
  });
}
function getGps() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('الجهاز ما يدعم GPS'));
    navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej(e), { enableHighAccuracy: true, timeout: 15000 });
  });
}
$('#btnLocate').onclick = async () => {
  try {
    const c = await getGps();
    const ll = [c.latitude, c.longitude];
    if (meMarker) meMarker.setLatLng(ll);
    else meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="pin-me"></div>', iconSize: [16, 16] }) }).addTo(map);
    map.setView(ll, 16);
  } catch (e) { toast('ما كدرت أجيب موقعك. تأكد إن الموقع مفعّل.'); }
};
$('#btnAddHere').onclick = async () => {
  try {
    const c = await getGps();
    openPharmForm(null, { lat: c.latitude.toFixed(6), lng: c.longitude.toFixed(6) });
  } catch (e) { toast('ما كدرت أجيب موقعك'); }
};

// ===== نافذة الصيدلية =====
let editingId = null;
function fillAreaSelect(sel) {
  $('#areaSelect').innerHTML = db.areas.map(a => `<option ${a === sel ? 'selected' : ''}>${esc(a)}</option>`).join('') + '<option value="__new">＋ منطقة جديدة...</option>';
}
$('#areaSelect').onchange = e => {
  if (e.target.value !== '__new') return;
  const n = (prompt('اسم المنطقة الجديدة') || '').trim();
  if (n && !db.areas.includes(n)) { db.areas.push(n); save(); }
  fillAreaSelect(n || db.areas[0]);
};
function openPharmForm(id, preset = {}) {
  editingId = id;
  const p = id ? pharm(id) : { area: db.areas[0], ...preset };
  const f = $('#formPharm');
  $('#dlgPharmTitle').textContent = id ? 'تعديل صيدلية' : 'صيدلية جديدة';
  fillAreaSelect(p.area);
  ['name', 'phone', 'lat', 'lng', 'link', 'notes'].forEach(k => f.elements[k].value = p[k] || '');
  $('#btnDelPharm').style.display = id ? '' : 'none';
  $('#dlgDetail').close();
  $('#dlgPharm').showModal();
}
$('#formPharm').elements.link.addEventListener('change', e => {
  const f = $('#formPharm'), c = coordsFromLink(e.target.value);
  if (c && !f.elements.lat.value) { f.elements.lat.value = c[0]; f.elements.lng.value = c[1]; toast('تم أخذ الإحداثيات من الرابط'); }
});
$('#btnUseGps').onclick = async () => {
  try { const c = await getGps(); const f = $('#formPharm'); f.elements.lat.value = c.latitude.toFixed(6); f.elements.lng.value = c.longitude.toFixed(6); toast('تم تحديد موقعك'); }
  catch (e) { toast('ما كدرت أجيب موقعك'); }
};
$('#dlgPharm').addEventListener('close', () => {
  if ($('#dlgPharm').returnValue !== 'save') return;
  const f = $('#formPharm');
  const data = Object.fromEntries(['name', 'area', 'phone', 'lat', 'lng', 'link', 'notes'].map(k => [k, f.elements[k].value.trim()]));
  if (data.area === '__new') data.area = db.areas[0];
  if (editingId) Object.assign(pharm(editingId), data);
  else db.pharmacies.push({ id: uid(), ...data });
  save(); render(); toast('تم الحفظ');
});
$('#btnDelPharm').onclick = () => {
  if (!confirm('متأكد تريد تحذف الصيدلية وكل زياراتها؟')) return;
  db.pharmacies = db.pharmacies.filter(p => p.id !== editingId);
  db.visits = db.visits.filter(v => v.pharmacyId !== editingId);
  save(); $('#dlgPharm').close(); render();
};
$('#btnNewPharm').onclick = () => openPharmForm(null);

// ===== تفاصيل الصيدلية =====
function openDetail(id) {
  const p = pharm(id); if (!p) return;
  const w = wazeUrl(p);
  const vs = db.visits.filter(v => v.pharmacyId === id).sort((a, b) => b.date.localeCompare(a.date));
  $('#detailBody').innerHTML = `
    <h2>${esc(p.name)}</h2>
    <p class="muted">📍 ${esc(p.area || '')}${p.phone ? ' · 📞 ' + esc(p.phone) : ''}</p>
    <div class="acts row">
      ${w ? `<a class="btn waze" href="${esc(w)}" target="_blank" rel="noopener">🚗 ويز</a>` : ''}
      ${p.phone ? `<a class="btn outline" href="tel:${esc(p.phone)}">📞 اتصال</a>` : ''}
      ${p.link && p.lat ? `<a class="btn outline" href="${esc(p.link)}" target="_blank" rel="noopener">🔗 الرابط</a>` : ''}
    </div>
    <h2>ملاحظات</h2>
    <div class="notes">${p.notes ? esc(p.notes) : '<span class="muted">ماكو ملاحظات</span>'}</div>
    <h2>الزيارات والمهام</h2>
    ${vs.length ? vs.map(v => `<div class="visit-row">
        <label style="margin:0;display:flex;gap:6px;align-items:center;color:inherit"><input type="checkbox" data-done="${v.id}" ${v.done ? 'checked' : ''}>
        <span>${fmtDate(v.date)}${v.text ? ' — ' + esc(v.text) : ''}</span></label>
        <button class="btn small danger" data-del-visit="${v.id}">✕</button></div>`).join('') : '<p class="muted">ماكو زيارات</p>'}
    <button class="btn wide" data-add-visit="${p.id}">＋ إضافة زيارة / مهمة</button>
    <div class="dlg-actions">
      <button class="btn outline" data-edit="${p.id}">✏️ تعديل</button>
      <button class="btn outline" data-close>إغلاق</button>
    </div>`;
  if (!$('#dlgDetail').open) $('#dlgDetail').showModal();
}

// ===== نافذة الزيارة =====
let visitPharmId = null;
function openVisitForm(pid) {
  visitPharmId = pid;
  const f = $('#formVisit');
  f.reset(); f.elements.date.value = ymd();
  $('#visitPharmName').textContent = pharm(pid).name;
  $('#dlgVisit').showModal();
}
$('#dlgVisit').addEventListener('close', () => {
  if ($('#dlgVisit').returnValue !== 'save') return;
  const f = $('#formVisit');
  db.visits.push({ id: uid(), pharmacyId: visitPharmId, date: f.elements.date.value, text: f.elements.text.value.trim(), done: false });
  save(); render(); if ($('#dlgDetail').open) openDetail(visitPharmId); toast('تمت إضافة الزيارة');
});

// ===== أزرار عامة (تفويض الأحداث) =====
document.addEventListener('click', e => {
  const el = e.target.closest('[data-open],[data-done],[data-edit],[data-add-visit],[data-del-visit],[data-close],[data-del-area],[data-rename-area]');
  if (!el) return;
  const d = el.dataset;
  if (d.done) {
    const v = db.visits.find(x => x.id === d.done); v.done = !v.done; save(); render();
    if ($('#dlgDetail').open) openDetail(v.pharmacyId);
  } else if (d.open) openDetail(d.open);
  else if (d.edit) openPharmForm(d.edit);
  else if (d.addVisit) openVisitForm(d.addVisit);
  else if (d.delVisit) {
    const v = db.visits.find(x => x.id === d.delVisit);
    if (confirm('تحذف هاي الزيارة؟')) { db.visits = db.visits.filter(x => x !== v); save(); render(); openDetail(v.pharmacyId); }
  } else if (d.close !== undefined) $('#dlgDetail').close();
  else if (d.delArea) {
    const a = db.areas[+d.delArea];
    if (db.pharmacies.some(p => p.area === a)) return toast('المنطقة بيها صيدليات، انقلهم أول');
    db.areas.splice(+d.delArea, 1); save(); render();
  } else if (d.renameArea) {
    const old = db.areas[+d.renameArea], n = (prompt('الاسم الجديد', old) || '').trim();
    if (!n || n === old) return;
    db.areas[+d.renameArea] = n; db.pharmacies.forEach(p => { if (p.area === old) p.area = n; }); save(); render();
  }
});
$('#search').oninput = renderList;

// ===== نسخ احتياطي =====
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
    if (!Array.isArray(d.pharmacies) || !Array.isArray(d.visits)) throw 0;
    if (!confirm(`راح تنمسح البيانات الحالية وتنحط مكانها النسخة (${d.pharmacies.length} صيدلية). متأكد؟`)) return;
    db = { areas: [], center: db.center, zoom: db.zoom, ...d }; save(); render(); toast('تم الاستيراد');
  } catch (err) { toast('الملف مو صالح'); }
  e.target.value = '';
};

function render() { renderToday(); renderList(); renderAreas(); renderMap(); }
render();
// يحدّث صفحة اليوم إذا تغيّر اليوم والتطبيق مفتوح
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderToday(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
