'use strict';

// CSV column indices:
// 0: County | 1: City | 2: (blank) | 3: Name | 4: Address | 5: Post Code | 6: Tel | 7: Email | 8: URL

// ============================================================
// Config
// ============================================================

const TABS = {
  'United Kingdom': {
    countries:  ['England', 'N Ireland', 'Scotland', 'Wales'],
    center:     [54.5, -3.0],
    zoom:       6,
    pageId:     'page-uk',
    mapId:      'map-uk',
    metaId:     'meta-uk',
    cardsId:    'cards-uk',
  },
  'Éire': {
    countries:  ['Eire'],
    center:     [53.2, -8.2],
    zoom:       7,
    pageId:     'page-eire',
    mapId:      'map-eire',
    metaId:     'meta-eire',
    cardsId:    'cards-eire',
  },
};

// Note: the URLs in the original spec were mislabelled — verified by inspecting
// the actual sheet data. Correct assignments are:
const CSV_URLS = {
  'England':   'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZfpOzIGbg36vju4h7--bbJ53m2pfJJ7Cn2PjpwSpyfv7THDszsoTZp2B9uJ5uFbB5uUyH_FQZT4dL/pub?output=csv',
  'Scotland':  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYQtYCkn2S6vurTDz3ng4skf_w17L7Sz3yvb2J0dd049ARR8-ua5xrpCZ64FrkWrebZKr5FGYD0hzL/pub?output=csv',
  'Wales':     'https://docs.google.com/spreadsheets/d/e/2PACX-1vQShOy13HBRBLEoA4sAug-_wyzlnSBllx4YOpGHIHKqIZo8HrU8dJMgf08ixOBWJazPMffIl6oOhRXd/pub?output=csv',
  'N Ireland': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeUtxu_aXeW_Ngyy69vZQEU0MFjTLCiKiynm-jQjhNmzGUfZ0GYYyOzQpbUKOfo8xaW0QOBMAdDwXO/pub?output=csv',
  'Eire':      'https://docs.google.com/spreadsheets/d/e/2PACX-1vRye2Q6sEoXjHnT1UoABZzXNYzOQNy5YBTSW7p2peB9OIpnM4ZUGqVEAxLKnJAy-PhDAO8O6R0_7BVJ/pub?output=csv',
};

// ============================================================
// Geocode cache (localStorage, 30-day TTL)
// ============================================================

const GEO_CACHE_KEY = 'ghdir_geo_v2';
const GEO_TTL = 30 * 24 * 60 * 60 * 1000;

let geoCache = (() => {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}'); }
  catch { return {}; }
})();

function cacheGet(key) {
  const e = geoCache[key];
  if (!e || Date.now() - e.t > GEO_TTL) return null;
  return { lat: e.lat, lng: e.lng };
}

function cacheSet(key, lat, lng) {
  geoCache[key] = { lat, lng, t: Date.now() };
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache)); } catch {}
}

// ============================================================
// State
// ============================================================

const tabState = {};
for (const name of Object.keys(TABS)) {
  tabState[name] = {
    assemblies: null,
    map:        null,
    cluster:    null,
    loading:    false,
    loaded:     false,
  };
}

let activeTab   = 'United Kingdom';
let searchQuery = '';

const tabsEl   = document.querySelector('.tabs');
const searchEl = document.getElementById('search');

// ============================================================
// Init
// ============================================================

function init() {
  buildTabs();
  searchEl.addEventListener('input', onSearch);
  activateTab('United Kingdom');
}

// ============================================================
// Tabs
// ============================================================

function buildTabs() {
  for (const name of Object.keys(TABS)) {
    const btn = document.createElement('button');
    btn.className = 'tab' + (name === activeTab ? ' tab--active' : '');
    btn.textContent = name;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(name === activeTab));
    btn.addEventListener('click', () => activateTab(name));
    tabsEl.appendChild(btn);
  }

  // About tab — static, no data loading
  const aboutBtn = document.createElement('button');
  aboutBtn.className = 'tab';
  aboutBtn.textContent = 'About';
  aboutBtn.setAttribute('role', 'tab');
  aboutBtn.setAttribute('aria-selected', 'false');
  aboutBtn.addEventListener('click', () => activateAbout());
  tabsEl.appendChild(aboutBtn);
}

function activateTab(name) {
  activeTab = name;
  searchQuery = '';
  searchEl.value = '';
  searchEl.closest('.search-wrap').hidden = false;

  // Show/hide pages
  for (const [tabName, cfg] of Object.entries(TABS)) {
    document.getElementById(cfg.pageId).hidden = (tabName !== name);
  }
  document.getElementById('page-about').hidden = true;

  // Sync tab button states
  syncTabButtons(name);

  // If map was already built, fix its size after being hidden
  const s = tabState[name];
  if (s.map) {
    setTimeout(() => s.map.invalidateSize(), 50);
  }

  if (!s.loaded && !s.loading) {
    loadTab(name);
  } else if (s.loaded) {
    applyFilter(name);
  }
}

function activateAbout() {
  searchEl.closest('.search-wrap').hidden = true;
  for (const cfg of Object.values(TABS)) {
    document.getElementById(cfg.pageId).hidden = true;
  }
  document.getElementById('page-about').hidden = false;
  syncTabButtons('About');
}

function syncTabButtons(activeName) {
  tabsEl.querySelectorAll('.tab').forEach(btn => {
    const active = btn.textContent === activeName;
    btn.classList.toggle('tab--active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

// ============================================================
// Search
// ============================================================

function onSearch(e) {
  searchQuery = e.target.value.toLowerCase().trim();
  if (tabState[activeTab]?.loaded) {
    applyFilter(activeTab);
  }
}

// ============================================================
// Data loading
// ============================================================

async function loadTab(name) {
  const cfg = TABS[name];
  const s = tabState[name];
  s.loading = true;

  // Step 1 — fetch all CSVs for this tab's countries
  showCardsSpinner(cfg.cardsId, 'Loading…');
  document.getElementById(cfg.metaId).textContent = '';

  let assemblies;
  try {
    const results = await Promise.all(cfg.countries.map(fetchCSV));
    assemblies = results.flat();
  } catch (err) {
    showCardsError(cfg.cardsId, err.message);
    s.loading = false;
    return;
  }

  s.assemblies = assemblies;
  s.loaded = true;
  s.loading = false;

  // Step 2 — show cards immediately (no geocodes yet)
  applyFilter(name);

  // Step 3 — init map with a loading overlay
  initMap(name);
  showMapOverlay(cfg.mapId, 'Locating assemblies on map…');

  // Step 4 — geocode (may be slow on first Éire visit)
  try {
    if (name === 'United Kingdom') {
      await geocodeUK(assemblies, cfg.mapId);
    } else {
      await geocodeEire(assemblies, cfg.mapId);
    }
  } catch (err) {
    console.warn('Geocoding error:', err);
  }

  // Step 5 — populate map and update meta
  hideMapOverlay(cfg.mapId);
  applyFilter(name);
}

// ============================================================
// CSV fetch + parse
// ============================================================

async function fetchCSV(country) {
  const res = await fetch(CSV_URLS[country]);
  if (!res.ok) throw new Error(`Could not load ${country} data (HTTP ${res.status})`);
  return parseCSV(await res.text(), country);
}

function parseCSV(text, country) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Detect column positions from the header row so both 8-col and 9-col
  // sheet layouts (England has a blank third column; others don't) work correctly.
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const ci = {
    county:   findCol(headers, ['county']),
    city:     findCol(headers, ['city']),
    name:     findCol(headers, ['name']),
    address:  findCol(headers, ['address']),
    postcode: findCol(headers, ['post code', 'postcode', 'post_code']),
    tel:      findCol(headers, ['tel', 'telephone', 'phone']),
    email:    findCol(headers, ['email']),
    url:      findCol(headers, ['url', 'website', 'web']),
  };

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const name = getCol(row, ci.name);
    if (!name) continue;
    results.push({
      id:       `${country}-${i}`,
      country,
      county:   getCol(row, ci.county),
      city:     getCol(row, ci.city),
      name,
      address:  getCol(row, ci.address),
      postcode: getCol(row, ci.postcode),
      tel:      getCol(row, ci.tel),
      email:    getCol(row, ci.email),
      url:      getCol(row, ci.url),
      lat:      null,
      lng:      null,
    });
  }
  return results;
}

function findCol(headers, names) {
  for (const name of names) {
    const i = headers.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function getCol(row, idx) {
  return idx >= 0 ? (row[idx] || '').trim() : '';
}

function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field); field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

// ============================================================
// Geocoding — UK via postcodes.io (batch, free, no key)
// ============================================================

async function geocodeUK(assemblies, mapId) {
  // Apply any already-cached geocodes
  const toFetch = new Set();
  for (const a of assemblies) {
    const key = a.postcode.toUpperCase().replace(/\s+/g, '');
    if (!key) continue;
    const hit = cacheGet(key);
    if (hit) { a.lat = hit.lat; a.lng = hit.lng; }
    else toFetch.add(key);
  }

  // Batch remaining postcodes (100 per request)
  const codes = Array.from(toFetch);
  for (let i = 0; i < codes.length; i += 100) {
    const batch = codes.slice(i, i + 100);
    try {
      const res = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: batch }),
      });
      const data = await res.json();
      for (const item of (data.result || [])) {
        if (!item.result) continue;
        const { latitude: lat, longitude: lng } = item.result;
        const key = item.query.toUpperCase().replace(/\s+/g, '');
        cacheSet(key, lat, lng);
      }
    } catch (e) {
      console.warn('postcodes.io batch failed', e);
    }
  }

  // Second pass — apply newly cached geocodes
  for (const a of assemblies) {
    if (a.lat !== null) continue;
    const key = a.postcode.toUpperCase().replace(/\s+/g, '');
    if (!key) continue;
    const hit = cacheGet(key);
    if (hit) { a.lat = hit.lat; a.lng = hit.lng; }
  }
}

// ============================================================
// Geocoding — Éire via Nominatim (1 req/s, cached)
// ============================================================

async function geocodeEire(assemblies, mapId) {
  // Deduplicate by "city|county" so we make one request per unique location
  const locationKeys = new Map(); // key -> {lat, lng} | null

  for (const a of assemblies) {
    const key = buildEireKey(a);
    if (key && !locationKeys.has(key)) locationKeys.set(key, null);
  }

  // Check cache
  const toFetch = [];
  for (const key of locationKeys.keys()) {
    const hit = cacheGet(key);
    if (hit) locationKeys.set(key, hit);
    else toFetch.push(key);
  }

  // Fetch uncached locations one at a time (Nominatim rate limit: 1/s)
  for (let i = 0; i < toFetch.length; i++) {
    const key = toFetch[i];
    updateMapOverlayMsg(
      mapId,
      `Locating assemblies on map… ${i + 1} of ${toFetch.length}`,
      i === 0 ? 'First visit only — results are cached for next time' : ''
    );

    const [city, county] = key.split('|');
    const q = encodeURIComponent(
      [city, county, 'Ireland'].filter(Boolean).join(', ')
    );
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=0`
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        cacheSet(key, lat, lng);
        locationKeys.set(key, { lat, lng });
      }
    } catch (e) {
      console.warn('Nominatim failed for', key, e);
    }

    if (i < toFetch.length - 1) await sleep(1100); // respect 1 req/s limit
  }

  // Apply geocodes to assemblies
  for (const a of assemblies) {
    const key = buildEireKey(a);
    if (!key) continue;
    const geo = locationKeys.get(key);
    if (geo) { a.lat = geo.lat; a.lng = geo.lng; }
  }
}

function buildEireKey(a) {
  const city   = a.city.trim().toLowerCase();
  const county = a.county.trim().toLowerCase();
  if (!city && !county) return null;
  return `${city}|${county}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// Map
// ============================================================

function initMap(name) {
  const cfg = TABS[name];
  const s   = tabState[name];
  if (s.map) return;

  const map = L.map(cfg.mapId, { preferCanvas: true })
    .setView(cfg.center, cfg.zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  s.cluster = L.markerClusterGroup({ maxClusterRadius: 60, chunkedLoading: true });
  map.addLayer(s.cluster);
  s.map = map;
}

function updateMapMarkers(name, filtered) {
  const s = tabState[name];
  if (!s.map) return;

  s.cluster.clearLayers();

  const mapped = filtered.filter(a => a.lat !== null);
  for (const a of mapped) {
    const marker = L.marker([a.lat, a.lng]);
    marker.bindPopup(popupHTML(a), { maxWidth: 260 });
    s.cluster.addLayer(marker);
  }

  // Zoom map to filtered results when a search is active
  if (searchQuery && mapped.length > 0) {
    try {
      s.map.fitBounds(s.cluster.getBounds(), { padding: [40, 40], maxZoom: 14 });
    } catch {}
  }

  return { total: filtered.length, mapped: mapped.length };
}

function popupHTML(a) {
  const addrParts = [a.address, a.city, a.county, a.postcode].filter(Boolean);
  let html = `<div class="popup-name">${esc(a.name)}</div>`;
  if (addrParts.length) {
    html += `<div class="popup-address">${addrParts.map(esc).join('<br>')}</div>`;
  }
  if (a.tel)   html += `<div class="popup-contact"><a href="tel:${esc(a.tel)}">${esc(a.tel)}</a></div>`;
  if (a.email) html += `<div class="popup-contact"><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></div>`;
  if (a.url) {
    const href = normaliseUrl(a.url);
    html += `<div class="popup-contact"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a></div>`;
  }
  return html;
}

// ============================================================
// Map overlay (shown while geocoding)
// ============================================================

function showMapOverlay(mapId, msg, note) {
  const container = document.getElementById(mapId);
  let overlay = container.querySelector('.map-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'map-overlay';
    overlay.innerHTML = '<div class="spinner"></div><p class="map-overlay-msg"></p><small class="map-overlay-note"></small>';
    container.appendChild(overlay);
  }
  overlay.querySelector('.map-overlay-msg').textContent  = msg  || '';
  overlay.querySelector('.map-overlay-note').textContent = note || '';
}

function updateMapOverlayMsg(mapId, msg, note) {
  const container = document.getElementById(mapId);
  const msgEl  = container.querySelector('.map-overlay-msg');
  const noteEl = container.querySelector('.map-overlay-note');
  if (msgEl)  msgEl.textContent  = msg  || '';
  if (noteEl) noteEl.textContent = note || '';
}

function hideMapOverlay(mapId) {
  const overlay = document.getElementById(mapId).querySelector('.map-overlay');
  if (overlay) overlay.remove();
}

// ============================================================
// Filter + render
// ============================================================

function applyFilter(name) {
  const cfg = TABS[name];
  const s   = tabState[name];
  if (!s.assemblies) return;

  const q = searchQuery;
  const filtered = q ? s.assemblies.filter(a => matchesQuery(a, q)) : s.assemblies;

  // Map
  const counts = updateMapMarkers(name, filtered);

  // Meta text
  const metaEl = document.getElementById(cfg.metaId);
  if (counts) {
    const label = filtered.length === 1 ? 'assembly' : 'assemblies';
    metaEl.textContent = q
      ? `${filtered.length} ${label} found (${counts.mapped} on map)`
      : `${s.assemblies.length} ${label} — ${counts.mapped} on map`;
  }

  // Cards
  const cardsEl = document.getElementById(cfg.cardsId);
  if (filtered.length === 0) {
    cardsEl.innerHTML = '<div class="state-message">No results — try a different search term.</div>';
    return;
  }
  cardsEl.innerHTML = filtered.map(cardHTML).join('');
}

function matchesQuery(a, q) {
  return [a.county, a.city, a.name, a.postcode].some(s => s.toLowerCase().includes(q));
}

// ============================================================
// Card + popup HTML helpers
// ============================================================

function cardHTML(a) {
  const addrParts = [a.address, a.city, a.county, a.postcode].filter(Boolean);
  let contactRows = '';
  if (a.tel)   contactRows += contactRow('Tel',   `<a href="tel:${esc(a.tel)}">${esc(a.tel)}</a>`);
  if (a.email) contactRows += contactRow('Email', `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>`);
  if (a.url) {
    const href = normaliseUrl(a.url);
    contactRows += contactRow('Web', `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a>`);
  }
  return [
    '<article class="card">',
    `  <h2 class="card-name">${esc(a.name)}</h2>`,
    addrParts.length ? `  <address class="card-address">${addrParts.map(esc).join('<br>')}</address>` : '',
    contactRows ? `  <div class="card-contact">${contactRows}</div>` : '',
    '</article>',
  ].join('\n');
}

function contactRow(label, valueHTML) {
  return `<div class="contact-row"><span class="contact-label">${label}</span>${valueHTML}</div>`;
}

function normaliseUrl(url) {
  url = url.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return 'https://' + url;
  return url;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Spinner / error in cards area
// ============================================================

function showCardsSpinner(cardsId, msg) {
  document.getElementById(cardsId).innerHTML = `
    <div class="spinner-wrap">
      <div class="spinner" aria-hidden="true"></div>
      <p>${esc(msg)}</p>
    </div>`;
}

function showCardsError(cardsId, msg) {
  document.getElementById(cardsId).innerHTML =
    `<div class="state-message error">Failed to load data — please check your connection and try again.<small>${esc(msg)}</small></div>`;
}

// ============================================================
// Privacy modal
// ============================================================

function initModal() {
  const backdrop = document.getElementById('privacy-modal');
  const openBtn  = document.getElementById('privacy-open');
  const closeBtn = document.getElementById('privacy-close');

  const open  = () => { backdrop.hidden = false; closeBtn.focus(); };
  const close = () => { backdrop.hidden = true;  openBtn.focus();  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !backdrop.hidden) close(); });
}

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  init();
  initModal();
});
