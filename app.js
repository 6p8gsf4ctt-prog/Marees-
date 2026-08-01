const TZ = 'Europe/Paris';
const SOLAR_API = 'https://api.sunrisesunset.io/json';
const LAT = 43.541;
const LNG = -1.462;
let tideData;

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const frDate = (date, options) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).format(date);

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}
function eventDate(dateKey, time) {
  const [y,m,d] = dateKey.split('-').map(Number);
  const [hh,mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
function formatHeight(v) { return `${Number(v).toFixed(2).replace('.', ',')} m`; }
function eventName(type) { return type === 'high' ? 'Pleine mer' : 'Basse mer'; }
function shortType(type) { return type === 'high' ? 'PM' : 'BM'; }
function cleanTime(value) {
  if (!value) return '—';
  const text = String(value).trim();
  const match24 = text.match(/^(\d{1,2}):(\d{2})/);
  if (match24 && !/[AP]M/i.test(text)) return `${pad(Number(match24[1]))}:${match24[2]}`;
  const match12 = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i);
  if (match12) {
    let hour = Number(match12[1]) % 12;
    if (match12[3].toUpperCase() === 'PM') hour += 12;
    return `${pad(hour)}:${match12[2]}`;
  }
  return text.slice(0, 5);
}

function solarCacheKey(date) { return `marees-solar-${date}`; }

function readSolarCache(date) {
  try { return JSON.parse(localStorage.getItem(solarCacheKey(date)) || 'null'); }
  catch { return null; }
}

function writeSolarCache(date, solar) {
  try { localStorage.setItem(solarCacheKey(date), JSON.stringify(solar)); }
  catch { /* stockage privé ou saturé */ }
}

async function loadMissingSolar() {
  const missing = tideData.days.filter(day => {
    const s = day.solar || readSolarCache(day.date);
    if (s) day.solar = s;
    return !(s && s.dawn && s.sunrise && s.sunset && s.dusk);
  });
  if (!missing.length) return;

  const dates = missing.map(day => day.date).sort();
  const params = new URLSearchParams({
    lat: String(LAT), lng: String(LNG),
    date_start: dates[0], date_end: dates[dates.length - 1],
    timezone: TZ, time_format: '24', elevation: 'false'
  });
  const response = await fetch(`${SOLAR_API}?${params}`, {cache: 'no-store'});
  if (!response.ok) throw new Error('Heures solaires indisponibles');
  const payload = await response.json();
  if (!['OK', 'INVALID_TZID'].includes(payload.status)) throw new Error(payload.status || 'Réponse solaire invalide');
  const results = Array.isArray(payload.results) ? payload.results : [payload.results];
  const byDate = new Map(results.filter(Boolean).map(item => [item.date, item]));

  missing.forEach(day => {
    const item = byDate.get(day.date);
    if (!item) return;
    day.solar = {
      dawn: cleanTime(item.dawn),
      sunrise: cleanTime(item.sunrise),
      sunset: cleanTime(item.sunset),
      dusk: cleanTime(item.dusk)
    };
    writeSolarCache(day.date, day.solar);
  });
}

function getTodayRecord(now = new Date()) {
  const key = localDateKey(now);
  return tideData.days.find(d => d.date === key) || tideData.days[0];
}
function allEvents() {
  return tideData.days.flatMap(day => day.events.map(event => ({...event, date:day.date, at:eventDate(day.date,event.time)})));
}
function nextAndPrevious(now) {
  const events = allEvents().sort((a,b) => a.at-b.at);
  let nextIndex = events.findIndex(e => e.at > now);
  if (nextIndex < 0) nextIndex = events.length - 1;
  return { next: events[nextIndex], previous: events[Math.max(0,nextIndex-1)] };
}
function countdownText(ms) {
  if (ms <= 0) return 'Maintenant';
  const minutes = Math.floor(ms/60000);
  const h = Math.floor(minutes/60), m = minutes%60;
  return h ? `${h} h ${pad(m)}` : `${m} min`;
}
function renderSolar(day) {
  const solar = day.solar || {};
  $('dawn').textContent = cleanTime(solar.dawn);
  $('sunrise').textContent = cleanTime(solar.sunrise);
  $('sunset').textContent = cleanTime(solar.sunset);
  $('dusk').textContent = cleanTime(solar.dusk);
}
function eventCard(e) {
  return `<article class="card event-card">
    <div class="event-time">${e.time}</div>
    <div class="event-type">${eventName(e.type)}</div>
    <div class="event-meta"><strong>${formatHeight(e.height)}</strong><span>${e.coefficient ? `Coef. ${e.coefficient}` : '&nbsp;'}</span></div>
  </article>`;
}
function renderToday(now = new Date()) {
  const day = getTodayRecord(now);
  const shownDate = eventDate(day.date, '12:00');
  $('fullDate').textContent = frDate(shownDate, { weekday:'long', day:'numeric', month:'long' });
  $('todayEvents').innerHTML = day.events.map(eventCard).join('');
  renderSolar(day);
  updateLive(now);
}
function updateLive(now = new Date()) {
  const {next, previous} = nextAndPrevious(now);
  const rising = previous.type === 'low' && next.type === 'high';
  $('tideDirection').textContent = rising ? 'Marée montante' : 'Marée descendante';
  $('currentTime').textContent = frDate(now, {hour:'2-digit', minute:'2-digit'});
  $('nextLabel').textContent = `${eventName(next.type).toUpperCase()} DANS`;
  $('countdown').textContent = countdownText(next.at-now);
  $('nextTime').textContent = next.time;
  $('nextType').textContent = eventName(next.type);
  $('nextHeight').textContent = formatHeight(next.height);
  $('nextCoeff').textContent = next.coefficient ? `Coefficient ${next.coefficient}` : '';
}
function renderWeek() {
  $('weekList').innerHTML = tideData.days.slice(0, 7).map(day => {
    const date = eventDate(day.date, '12:00');
    const name = frDate(date,{weekday:'long'});
    const shortDate = frDate(date,{day:'numeric',month:'long'});
    const events = day.events.map(e => `<div class="day-event"><div class="mini-type">${shortType(e.type)}</div><div class="mini-time">${e.time}</div><div class="mini-height">${formatHeight(e.height)}</div><div class="mini-coeff">${e.coefficient ? `Coef. ${e.coefficient}` : ''}</div></div>`).join('');
    return `<article class="card day-card"><div class="day-heading"><strong>${name[0].toUpperCase()+name.slice(1)}</strong><span>${shortDate}</span></div><div class="day-events">${events}</div></article>`;
  }).join('');
}
function renderDataStatus() {
  const updated = tideData.updated_at ? new Date(tideData.updated_at) : null;
  $('dataStatus').textContent = updated && !Number.isNaN(updated.valueOf())
    ? `Actualisé ${frDate(updated,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`
    : '';
}
function bindTabs() {
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active'); t.removeAttribute('aria-current'); });
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active'); tab.setAttribute('aria-current','page');
    $(tab.dataset.view).classList.add('active');
    $('pageTitle').textContent = tab.dataset.view === 'todayView' ? 'Aujourd’hui' : '7 jours';
    window.scrollTo({top:0,behavior:'smooth'});
  }));
}
async function init() {
  const response = await fetch(`data/tides.json?v=${Date.now()}`, {cache:'no-store'});
  if (!response.ok) throw new Error('Données indisponibles');
  tideData = await response.json();
  if (!Array.isArray(tideData.days) || !tideData.days.length) throw new Error('Données indisponibles');
  renderToday(); renderWeek(); renderDataStatus(); bindTabs();
  loadMissingSolar().then(() => renderSolar(getTodayRecord())).catch(error => console.warn(error));
  setInterval(() => updateLive(new Date()), 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
}
init().catch(() => {
  document.body.innerHTML = '<main class="app-shell"><p class="eyebrow">TARNOS</p><h1>Données indisponibles</h1><p class="date-line">Réessayez avec une connexion internet.</p></main>';
});
