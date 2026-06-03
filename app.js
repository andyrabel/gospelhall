'use strict';

// CSV column indices
// 0: County | 1: City | 2: (blank) | 3: Name | 4: Address | 5: Post Code | 6: Tel | 7: Email | 8: URL

const COUNTRIES = ['England', 'N Ireland', 'Scotland', 'Wales', 'Eire'];

const CSV_URLS = {
  'England':   'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZfpOzIGbg36vju4h7--bbJ53m2pfJJ7Cn2PjpwSpyfv7THDszsoTZp2B9uJ5uFbB5uUyH_FQZT4dL/pub?output=csv',
  'N Ireland': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRye2Q6sEoXjHnT1UoABZzXNYzOQNy5YBTSW7p2peB9OIpnM4ZUGqVEAxLKnJAy-PhDAO8O6R0_7BVJ/pub?output=csv',
  'Scotland':  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQShOy13HBRBLEoA4sAug-_wyzlnSBllx4YOpGHIHKqIZo8HrU8dJMgf08ixOBWJazPMffIl6oOhRXd/pub?output=csv',
  'Wales':     'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYQtYCkn2S6vurTDz3ng4skf_w17L7Sz3yvb2J0dd049ARR8-ua5xrpCZ64FrkWrebZKr5FGYD0hzL/pub?output=csv',
  'Eire':      'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeUtxu_aXeW_Ngyy69vZQEU0MFjTLCiKiynm-jQjhNmzGUfZ0GYYyOzQpbUKOfo8xaW0QOBMAdDwXO/pub?output=csv',
};

const cache = {};
let activeCountry = COUNTRIES[0];
let searchQuery = '';

const tabsEl  = document.querySelector('.tabs');
const searchEl = document.getElementById('search');
const cardsEl  = document.getElementById('cards');
const metaEl   = document.getElementById('results-meta');

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function init() {
  buildTabs();
  searchEl.addEventListener('input', onSearchInput);
  loadCountry(activeCountry);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function buildTabs() {
  COUNTRIES.forEach(country => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (country === activeCountry ? ' tab--active' : '');
    btn.textContent = country;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', country === activeCountry ? 'true' : 'false');
    btn.addEventListener('click', () => switchTab(country));
    tabsEl.appendChild(btn);
  });
}

function switchTab(country) {
  if (country === activeCountry) return;
  activeCountry = country;

  tabsEl.querySelectorAll('.tab').forEach(btn => {
    const active = btn.textContent === country;
    btn.classList.toggle('tab--active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  loadCountry(country);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function onSearchInput(e) {
  searchQuery = e.target.value.toLowerCase().trim();
  if (cache[activeCountry]) {
    renderAssemblies(cache[activeCountry]);
  }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadCountry(country) {
  if (cache[country]) {
    renderAssemblies(cache[country]);
    return;
  }

  showSpinner();

  fetch(CSV_URLS[country])
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    })
    .then(text => {
      const assemblies = parseCSV(text);
      cache[country] = assemblies;
      renderAssemblies(assemblies);
    })
    .catch(err => showError(err.message));
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCSV(text) {
  const lines = text.split('\n');
  const results = [];

  // Row 0 is the header — skip it
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    // col 3 is the Name; skip rows without one
    const name = (cols[3] || '').trim();
    if (!name) continue;

    results.push({
      county:   (cols[0] || '').trim(),
      city:     (cols[1] || '').trim(),
      // cols[2] intentionally skipped (blank column)
      name:     name,
      address:  (cols[4] || '').trim(),
      postcode: (cols[5] || '').trim(),
      tel:      (cols[6] || '').trim(),
      email:    (cols[7] || '').trim(),
      url:      (cols[8] || '').trim(),
    });
  }

  return results;
}

function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else if (ch === '\r') {
      // Strip carriage returns
    } else {
      field += ch;
    }
  }

  fields.push(field);
  return fields;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAssemblies(assemblies) {
  const q = searchQuery;
  const filtered = q ? assemblies.filter(a => matchesQuery(a, q)) : assemblies;

  const count = filtered.length;
  metaEl.textContent = count === 0
    ? 'No assemblies found.'
    : count === 1
      ? 'Showing 1 assembly'
      : 'Showing ' + count + ' assemblies';

  if (count === 0) {
    cardsEl.innerHTML = '<div class="state-message">No results found — try a different search term.</div>';
    return;
  }

  cardsEl.innerHTML = filtered.map(cardHTML).join('');
}

function matchesQuery(a, q) {
  return [a.county, a.city, a.name, a.postcode].some(s => s.toLowerCase().includes(q));
}

function cardHTML(a) {
  const addrParts = [a.address, a.city, a.county, a.postcode].filter(Boolean);

  let contactRows = '';

  if (a.tel) {
    contactRows += contactRow('Tel', `<a href="tel:${esc(a.tel)}">${esc(a.tel)}</a>`);
  }
  if (a.email) {
    contactRows += contactRow('Email', `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>`);
  }
  if (a.url) {
    const href = normaliseUrl(a.url);
    contactRows += contactRow('Web', `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a>`);
  }

  return [
    '<article class="card">',
    `  <h2 class="card-name">${esc(a.name)}</h2>`,
    addrParts.length
      ? `  <address class="card-address">${addrParts.map(esc).join('<br>')}</address>`
      : '',
    contactRows
      ? `  <div class="card-contact">${contactRows}</div>`
      : '',
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

// ---------------------------------------------------------------------------
// State displays
// ---------------------------------------------------------------------------

function showSpinner() {
  metaEl.textContent = '';
  cardsEl.innerHTML = [
    '<div class="spinner-wrap">',
    '  <div class="spinner" aria-hidden="true"></div>',
    '  <p>Loading…</p>',
    '</div>',
  ].join('\n');
}

function showError(msg) {
  metaEl.textContent = '';
  cardsEl.innerHTML = `<div class="state-message error">Failed to load data — please check your connection and try again.<small>${esc(msg)}</small></div>`;
}

// ---------------------------------------------------------------------------
// Privacy modal
// ---------------------------------------------------------------------------

function initModal() {
  const backdrop = document.getElementById('privacy-modal');
  const openBtn  = document.getElementById('privacy-open');
  const closeBtn = document.getElementById('privacy-close');

  openBtn.addEventListener('click', () => {
    backdrop.hidden = false;
    closeBtn.focus();
  });

  closeBtn.addEventListener('click', closeModal);

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !backdrop.hidden) closeModal();
  });

  function closeModal() {
    backdrop.hidden = true;
    openBtn.focus();
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  init();
  initModal();
});
