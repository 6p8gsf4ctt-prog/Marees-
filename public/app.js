const TZ = 'Europe/Paris';
const SOLAR_API = 'https://api.sunrisesunset.io/json';
const LAT = 43.541;
const LNG = -1.462;
let tideData;
let selectedDayIndex = 0;
let selectedWeekIndex = 0;
let activeView = 'todayView';
let pendingImport = null;
let isRefreshing = false;

const APP_VERSION = '4.2.0';
const STORAGE = {
  preferences: 'marees-preferences-v1',
  previousPreferences: 'marees-preferences-previous-v1',
  lastPayload: 'marees-last-valid-payload-v1',
  lastBackup: 'marees-last-manual-backup-v1',
};
const defaultPreferences = {
  timeFormat24: true,
  showSolar: true,
  animations: true,
};
let preferences = loadPreferences();

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
function displayTime(value) {
  const normalized = cleanTime(value);
  if (normalized === '—' || preferences.timeFormat24) return normalized;
  const [hourText, minute] = normalized.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}
function safeJsonParse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function loadPreferences() {
  const stored = safeJsonParse(storageGet(STORAGE.preferences), {});
  return { ...defaultPreferences, ...(stored && typeof stored === 'object' ? stored : {}) };
}
function savePreferences(next, { markModified = true } = {}) {
  preferences = { ...defaultPreferences, ...next };
  storageSet(STORAGE.preferences, JSON.stringify(preferences));
  if (markModified) storageSet('marees-last-preference-change-v1', new Date().toISOString());
}
function saveLastPayload(payload) { storageSet(STORAGE.lastPayload, JSON.stringify(payload)); }
function readLastPayload() { return safeJsonParse(storageGet(STORAGE.lastPayload)); }
function eventName(type) { return type === 'high' ? 'Pleine mer' : 'Basse mer'; }
function shortEventDate(dateKey) {
  const date = eventDate(dateKey, '12:00');
  return frDate(date, { weekday:'short', day:'numeric', month:'short' }).replace(/\.$/, '');
}
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
function readSolarCache(date) { try { return JSON.parse(localStorage.getItem(solarCacheKey(date)) || 'null'); } catch { return null; } }
function writeSolarCache(date, solar) { try { localStorage.setItem(solarCacheKey(date), JSON.stringify(solar)); } catch {} }

async function loadMissingSolar() {
  const missing = tideData.days.filter(day => {
    const s = day.solar || readSolarCache(day.date);
    if (s) day.solar = s;
    return !(s && s.dawn && s.sunrise && s.sunset && s.dusk);
  });
  if (!missing.length) return;
  const dates = missing.map(day => day.date).sort();
  const params = new URLSearchParams({lat:String(LAT),lng:String(LNG),date_start:dates[0],date_end:dates.at(-1),timezone:TZ,time_format:'24',elevation:'false'});
  const response = await fetch(`${SOLAR_API}?${params}`, {cache:'no-store'});
  if (!response.ok) throw new Error('Heures solaires indisponibles');
  const payload = await response.json();
  if (!['OK','INVALID_TZID'].includes(payload.status)) throw new Error(payload.status || 'Réponse solaire invalide');
  const results = Array.isArray(payload.results) ? payload.results : [payload.results];
  const byDate = new Map(results.filter(Boolean).map(item => [item.date,item]));
  missing.forEach(day => {
    const item = byDate.get(day.date); if (!item) return;
    day.solar = {dawn:cleanTime(item.dawn),sunrise:cleanTime(item.sunrise),sunset:cleanTime(item.sunset),dusk:cleanTime(item.dusk)};
    writeSolarCache(day.date,day.solar);
  });
}

function todayIndex(now = new Date()) {
  const key = localDateKey(now);
  const exact = tideData.days.findIndex(d => d.date === key);
  if (exact >= 0) return exact;
  const future = tideData.days.findIndex(d => d.date > key);
  return future >= 0 ? future : Math.max(0,tideData.days.length-1);
}
function selectedDay() { return tideData.days[selectedDayIndex] || tideData.days[0]; }
function renderDayRail() {
  const rail = $('dayRail');
  if (!rail) return;
  const todayKey = localDateKey();
  rail.innerHTML = tideData.days.map((day,index) => {
    const date = eventDate(day.date,'12:00');
    const weekday = frDate(date,{weekday:'short'}).replace('.','');
    const dayNumber = frDate(date,{day:'numeric'});
    const classes = ['day-chip'];
    if (day.date === todayKey) classes.push('current');
    if (index === selectedDayIndex) classes.push('selected');
    return `<button class="${classes.join(' ')}" type="button" role="listitem" data-day-index="${index}" aria-label="${frDate(date,{weekday:'long',day:'numeric',month:'long'})}" ${index===selectedDayIndex?'aria-current="date"':''}><span class="rail-weekday">${weekday}</span><span class="rail-day">${dayNumber}</span><span class="rail-dot"></span></button>`;
  }).join('');
  const first=tideData.days[0],last=tideData.days.at(-1);
  if ($('dayRailRange') && first && last) $('dayRailRange').textContent=`${frDate(eventDate(first.date,'12:00'),{day:'numeric',month:'short'})} – ${frDate(eventDate(last.date,'12:00'),{day:'numeric',month:'short'})}`;
  rail.querySelectorAll('.day-chip').forEach(button => button.addEventListener('click', () => {
    selectedDayIndex = Number(button.dataset.dayIndex);
    renderSelectedDay();
    scrollSelectedDayIntoView();
    window.scrollTo({top:0,behavior:'smooth'});
  }));
}
function scrollSelectedDayIntoView() {
  requestAnimationFrame(() => {
    const selected = $('dayRail')?.querySelector('.day-chip.selected');
    selected?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
  });
}
function allEvents() { return tideData.days.flatMap(day => day.events.map(event => ({...event,date:day.date,at:eventDate(day.date,event.time)}))); }
function nextAndPrevious(now) {
  const events = allEvents().sort((a,b)=>a.at-b.at);
  let nextIndex = events.findIndex(e=>e.at>now);
  if (nextIndex < 0) nextIndex = events.length-1;
  return {next:events[nextIndex],previous:events[Math.max(0,nextIndex-1)]};
}
function countdownText(ms) {
  if (ms <= 0) return 'Maintenant';
  const minutes=Math.floor(ms/60000),h=Math.floor(minutes/60),m=minutes%60;
  return h ? `${h} h ${pad(m)}` : `${m} min`;
}
function renderSolar(day) {
  const s=day.solar||{};
  $('dawn').textContent=displayTime(s.dawn); $('sunrise').textContent=displayTime(s.sunrise);
  $('sunset').textContent=displayTime(s.sunset); $('dusk').textContent=displayTime(s.dusk);
}
function minutesOf(time) { const [hh,mm] = String(time || '00:00').split(':').map(Number); return hh * 60 + mm; }
function dayEventsWithNeighbors(dayIndex) {
  const current = tideData.days[dayIndex];
  const prevDay = tideData.days[dayIndex - 1];
  const nextDay = tideData.days[dayIndex + 1];
  const events = [];
  if (prevDay?.events?.length) {
    const prev = prevDay.events[prevDay.events.length - 1];
    events.push({...prev, date: prevDay.date, minutes: minutesOf(prev.time) - 1440});
  }
  current.events.forEach(event => events.push({...event, date: current.date, minutes: minutesOf(event.time)}));
  if (nextDay?.events?.length) {
    const next = nextDay.events[0];
    events.push({...next, date: nextDay.date, minutes: minutesOf(next.time) + 1440});
  }
  return events.sort((a,b) => a.minutes - b.minutes);
}
function interpolateHeight(pointA, pointB, targetMinutes) {
  const span = pointB.minutes - pointA.minutes || 1;
  const t = Math.min(1, Math.max(0, (targetMinutes - pointA.minutes) / span));
  const eased = (1 - Math.cos(Math.PI * t)) / 2;
  return pointA.height + (pointB.height - pointA.height) * eased;
}
function boundaryPoint(events, targetMinutes) {
  const direct = events.find(event => event.minutes === targetMinutes);
  if (direct) return {minutes: targetMinutes, height: direct.height};
  let before = events[0], after = events[events.length - 1];
  for (let i = 0; i < events.length - 1; i += 1) {
    if (events[i].minutes <= targetMinutes && events[i + 1].minutes >= targetMinutes) {
      before = events[i];
      after = events[i + 1];
      break;
    }
  }
  return {minutes: targetMinutes, height: interpolateHeight(before, after, targetMinutes)};
}
function curvePointsForDay(dayIndex) {
  const neighborEvents = dayEventsWithNeighbors(dayIndex);
  const current = tideData.days[dayIndex];
  const inner = current.events.map(event => ({minutes: minutesOf(event.time), height: event.height}));
  return [boundaryPoint(neighborEvents, 0), ...inner, boundaryPoint(neighborEvents, 1440)].sort((a,b) => a.minutes - b.minutes);
}
function curvePath(points, width, height, bottomPadding = 30) {
  const heights = points.map(point => point.height);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const spread = Math.max(0.35, max - min);
  const topPad = 40;
  const usableHeight = height - topPad - bottomPadding;
  const normalized = points.map(point => ({
    x: (point.minutes / 1440) * width,
    y: topPad + (1 - ((point.height - min) / spread)) * usableHeight,
  }));
  if (normalized.length < 2) return { line: '', fill: '', markerAt: normalized[0] || {x:0,y:height / 2}, mapped: normalized };
  let line = `M ${normalized[0].x.toFixed(2)} ${normalized[0].y.toFixed(2)}`;
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const p0 = normalized[Math.max(0, i - 1)];
    const p1 = normalized[i];
    const p2 = normalized[i + 1];
    const p3 = normalized[Math.min(normalized.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  const baseline = height - 1;
  const fill = `${line} L ${normalized[normalized.length - 1].x.toFixed(2)} ${baseline} L ${normalized[0].x.toFixed(2)} ${baseline} Z`;
  return { line, fill, mapped: normalized };
}
function pointOnCurve(points, targetMinutes, width, height) {
  const heights = points.map(point => point.height);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const spread = Math.max(0.35, max - min);
  const topPad = 40;
  const bottomPad = 30;
  const usableHeight = height - topPad - bottomPad;
  const before = [...points].reverse().find(point => point.minutes <= targetMinutes) || points[0];
  const after = points.find(point => point.minutes >= targetMinutes) || points[points.length - 1];
  const heightValue = before.minutes === after.minutes ? before.height : interpolateHeight(before, after, targetMinutes);
  return {
    x: (targetMinutes / 1440) * width,
    y: topPad + (1 - ((heightValue - min) / spread)) * usableHeight,
  };
}
function renderHeroCurve(day, now = new Date(), animate = true) {
  const svgWidth = 320;
  const svgHeight = 132;
  const points = curvePointsForDay(selectedDayIndex);
  const { line, fill, mapped } = curvePath(points, svgWidth, svgHeight);
  $('heroCurvePath').setAttribute('d', line || '');
  $('heroCurveFillPath').setAttribute('d', fill || '');

  const isToday = day.date === localDateKey(now);
  const marker = isToday
    ? pointOnCurve(points, now.getHours() * 60 + now.getMinutes(), svgWidth, svgHeight)
    : pointOnCurve(points, minutesOf(day.events[0]?.time || '00:00'), svgWidth, svgHeight);
  $('heroCurveMarker').setAttribute('cx', marker.x.toFixed(2));
  $('heroCurveMarker').setAttribute('cy', marker.y.toFixed(2));
  $('heroCurveMarker').setAttribute('r', isToday ? '6' : '4.5');
  $('heroCurveMarkerHalo').setAttribute('cx', marker.x.toFixed(2));
  $('heroCurveMarkerHalo').setAttribute('cy', marker.y.toFixed(2));
  $('heroCurveMarkerHalo').setAttribute('r', isToday ? '12' : '9');

  const innerMapped = mapped.slice(1, 1 + day.events.length);
  $('heroCurveLabels').innerHTML = day.events.map((event, index) => {
    const point = innerMapped[index];
    if (!point) return '';
    const left = Math.min(94, Math.max(6, (point.x / svgWidth) * 100));
    const isHigh = event.type === 'high';
    const top = isHigh ? point.y - 7 : point.y + 8;
    return `<span class="curve-extrema ${isHigh ? 'is-high' : 'is-low'}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}px"><span class="curve-kind">${isHigh ? 'PM' : 'BM'}</span><span class="curve-clock">${displayTime(event.time)}</span><span class="curve-height">${formatHeight(event.height)}</span></span>`;
  }).join('');

  const curve = $('heroCurve')?.closest('.hero-curve');
  if (curve && animate) {
    curve.classList.remove('animating');
    void curve.offsetWidth;
    curve.classList.add('animating');
  }
}

function eventCard(e,dateKey) {
  return `<article class="card event-card"><div class="event-date">${shortEventDate(dateKey)}</div><div class="event-time">${displayTime(e.time)}</div><div class="event-type">${eventName(e.type)}</div><div class="event-meta"><strong>${formatHeight(e.height)}</strong><span>${e.coefficient ? `Coef. ${e.coefficient}` : '&nbsp;'}</span></div></article>`;
}
function updateHeaderForDay(day, now=new Date()) {
  const shownDate=eventDate(day.date,'12:00');
  const isToday=day.date===localDateKey(now);
  $('pageTitle').textContent=isToday?'Aujourd’hui':frDate(shownDate,{weekday:'long'}).replace(/^./,c=>c.toUpperCase());
  $('fullDate').textContent=frDate(shownDate,{weekday:'long',day:'numeric',month:'long'});
  $('todayButton').hidden=isToday;
  $('todayButton').textContent=`Retour au ${shortEventDate(localDateKey(now))}`;
}
function animateDayChange() {
  const view = $('todayView');
  if (!view) return;
  view.classList.remove('day-change-flash');
  void view.offsetWidth;
  view.classList.add('day-change-flash');
  window.setTimeout(() => view.classList.remove('day-change-flash'), 360);
}
function renderSelectedDay(now=new Date()) {
  const day=selectedDay();
  updateHeaderForDay(day,now);
  $('todayEvents').innerHTML=day.events.map(e=>eventCard(e,day.date)).join('');
  renderSolar(day);
  renderHeroCurve(day, now);
  $('previousDay').disabled=selectedDayIndex===0;
  $('nextDay').disabled=selectedDayIndex===tideData.days.length-1;
  renderDayRail();
  animateDayChange();
  if (day.date===localDateKey(now)) updateLive(now); else renderForecastHero(day);
}
function renderForecastHero(day) {
  const first=day.events[0];
  $('tideDirection').textContent='Prévisions';
  $('currentTime').textContent=shortEventDate(day.date);
  $('nextLabel').textContent='PREMIÈRE MARÉE';
  $('countdown').textContent=displayTime(first.time);
  $('nextDate').textContent=shortEventDate(day.date);
  $('nextTime').textContent=eventName(first.type);
  $('nextType').textContent=first.coefficient?`Coefficient ${first.coefficient}`:'';
  $('nextHeight').textContent=formatHeight(first.height);
  $('nextCoeff').textContent='';
}
function updateLive(now=new Date()) {
  if (selectedDay().date!==localDateKey(now)) return;
  const {next,previous}=nextAndPrevious(now);
  const rising=previous.type==='low'&&next.type==='high';
  $('tideDirection').textContent=rising?'Marée montante':'Marée descendante';
  $('currentTime').textContent=frDate(now,{hour:'2-digit',minute:'2-digit',hour12:!preferences.timeFormat24});
  $('nextLabel').textContent=`${eventName(next.type).toUpperCase()} DANS`;
  $('countdown').textContent=countdownText(next.at-now);
  $('nextDate').textContent=shortEventDate(next.date); $('nextTime').textContent=displayTime(next.time); $('nextType').textContent=eventName(next.type);
  $('nextHeight').textContent=formatHeight(next.height); $('nextCoeff').textContent=next.coefficient?`Coefficient ${next.coefficient}`:'';
  renderHeroCurve(selectedDay(), now, false);
}

function weekCount() { return Math.max(1, Math.ceil(tideData.days.length / 14)); }
function weekSlice(index=selectedWeekIndex) { return tideData.days.slice(index * 14, index * 14 + 14); }
function renderWeek() {
  const days=weekSlice();
  $('weekList').innerHTML=days.map(day=>{
    const date=eventDate(day.date,'12:00');
    const name=frDate(date,{weekday:'long'}); const shortDate=frDate(date,{day:'numeric',month:'long'});
    const events=day.events.map(e=>`<div class="day-event"><div class="mini-type">${shortType(e.type)}</div><div class="mini-time">${displayTime(e.time)}</div><div class="mini-height">${formatHeight(e.height)}</div><div class="mini-coeff">${e.coefficient?`Coef. ${e.coefficient}`:''}</div></div>`).join('');
    return `<article class="card day-card"><div class="day-heading"><strong>${name[0].toUpperCase()+name.slice(1)}</strong><span>${shortDate}</span></div><div class="day-events">${events}</div></article>`;
  }).join('');
  const first=days[0],last=days.at(-1);
  $('pageTitle').textContent='14 jours';
  $('fullDate').textContent=first&&last?`${frDate(eventDate(first.date,'12:00'),{day:'numeric',month:'short'})} – ${frDate(eventDate(last.date,'12:00'),{day:'numeric',month:'short'})}`:'';
  const totalWeeks = weekCount();
  $('previousDay').disabled = selectedWeekIndex === 0;
  $('nextDay').disabled = selectedWeekIndex >= totalWeeks - 1;
  $('previousDay').setAttribute('aria-label', '14 jours précédents');
  $('nextDay').setAttribute('aria-label', '14 jours suivants');
  $('weekHint').hidden = totalWeeks > 1;
  $('todayButton').hidden=selectedWeekIndex===Math.floor(todayIndex()/14);
  $('todayButton').textContent='Période actuelle';
}
function bindNavigation() {
  $('previousDay').addEventListener('click',()=>{
    if(activeView==='todayView'&&selectedDayIndex>0){selectedDayIndex--;renderSelectedDay();scrollSelectedDayIntoView();}
    else if(activeView==='weekView'&&selectedWeekIndex>0){selectedWeekIndex--;renderWeek();}
    window.scrollTo({top:0,behavior:'smooth'});
  });
  $('nextDay').addEventListener('click',()=>{
    if(activeView==='todayView'&&selectedDayIndex<tideData.days.length-1){selectedDayIndex++;renderSelectedDay();scrollSelectedDayIntoView();}
    else if(activeView==='weekView'&&selectedWeekIndex<weekCount()-1){selectedWeekIndex++;renderWeek();}
    window.scrollTo({top:0,behavior:'smooth'});
  });
  $('todayButton').addEventListener('click',()=>{
    if(activeView==='todayView'){selectedDayIndex=todayIndex();renderSelectedDay();scrollSelectedDayIntoView();}
    else {selectedWeekIndex=Math.floor(todayIndex()/14);renderWeek();}
    window.scrollTo({top:0,behavior:'smooth'});
  });
}
function formattedUpdateDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return 'Date inconnue';
  const today = localDateKey();
  const key = localDateKey(date);
  const prefix = key === today ? 'aujourd’hui' : `le ${frDate(date,{day:'numeric',month:'long'})}`;
  return `${prefix} à ${frDate(date,{hour:'2-digit',minute:'2-digit',hour12:!preferences.timeFormat24})}`;
}
function payloadAgeHours() {
  const updated = tideData?.updated_at ? new Date(tideData.updated_at) : null;
  return updated && !Number.isNaN(updated.valueOf()) ? (Date.now() - updated.valueOf()) / 3600000 : Infinity;
}
function statusIcon(kind) {
  const icons = {
    success: '<svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    loading: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M12 4 21 20H3L12 4Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 9v5M12 17.2v.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5v6M12 16.7v.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    offline: '<svg viewBox="0 0 24 24"><path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 12.5a6.8 6.8 0 0 1 9 0M10.5 15.5a2.8 2.8 0 0 1 3 0M4 4l16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  };
  return icons[kind] || icons.success;
}
function setDataStatus(kind, title, detail) {
  const card = $('dataUpdateCard');
  card.dataset.state = kind;
  $('dataUpdateIcon').innerHTML = statusIcon(kind);
  $('dataUpdateTitle').textContent = title;
  $('dataUpdateDetail').textContent = detail;
  $('refreshDataButton').disabled = isRefreshing;
  if ($('settingsRefreshButton')) $('settingsRefreshButton').disabled = isRefreshing;
  $('refreshDataButton').classList.toggle('spinning', kind === 'loading');
  $('settingsDataState').textContent = title;
  if ($('settingsLastUpdate')) $('settingsLastUpdate').textContent = tideData?.updated_at ? `Dernière mise à jour ${formattedUpdateDate(tideData.updated_at)}` : '—';
}
function renderDataStatus({ offline = !navigator.onLine, error = false } = {}) {
  const updated = tideData?.updated_at;
  $('dataStatus').textContent = updated ? `Actualisé ${formattedUpdateDate(updated)}` : '';
  if (offline) {
    setDataStatus('offline', 'Données disponibles hors ligne', updated ? `Dernière mise à jour ${formattedUpdateDate(updated)}` : 'Dernières données enregistrées');
  } else if (error) {
    setDataStatus('error', 'Impossible d’actualiser les données', updated ? `Dernières informations conservées · ${formattedUpdateDate(updated)}` : 'Réessayez avec une connexion internet');
  } else if (payloadAgeHours() > 12) {
    setDataStatus('warning', 'Actualisation recommandée', updated ? `Dernière mise à jour ${formattedUpdateDate(updated)}` : 'Données anciennes');
  } else {
    setDataStatus('success', 'Données actualisées', updated ? `Dernière mise à jour ${formattedUpdateDate(updated)}` : 'Données disponibles');
  }
  updateSettingsMetadata();
}
function applyPreferences({ rerender = true } = {}) {
  document.documentElement.dataset.animations = preferences.animations ? 'on' : 'off';
  const solarSection = document.querySelector('.solar-card')?.closest('.section-block');
  if (solarSection) solarSection.hidden = !preferences.showSolar;
  $('timeFormatSetting').checked = preferences.timeFormat24;
  $('solarSetting').checked = preferences.showSolar;
  $('animationsSetting').checked = preferences.animations;
  if (rerender && tideData) {
    if (activeView === 'todayView') renderSelectedDay(); else renderWeek();
    renderDataStatus();
  }
}
function updateSettingsMetadata() {
  if (!tideData?.days?.length) return;
  $('settingsStation').textContent = `${tideData.location || 'Tarnos'} · ${tideData.reference_port || 'Boucau-Bayonne / Biarritz'}`;
  const first = tideData.days[0];
  const last = tideData.days.at(-1);
  $('settingsPeriod').textContent = `${shortEventDate(first.date)} – ${shortEventDate(last.date)} · ${tideData.days.length} jours`;
  $('settingsLastUpdate').textContent = tideData.updated_at ? `Dernière mise à jour ${formattedUpdateDate(tideData.updated_at)}` : '—';
  const lastModification = storageGet('marees-last-preference-change-v1');
  $('settingsLastModification').textContent = lastModification ? `Dernière modification ${formattedUpdateDate(lastModification)}` : 'Aucune modification locale';
  const lastBackup = storageGet(STORAGE.lastBackup);
  $('lastBackupLabel').textContent = lastBackup ? `Dernière sauvegarde ${formattedUpdateDate(lastBackup)}` : 'Aucune sauvegarde exportée';
  const previous = safeJsonParse(storageGet(STORAGE.previousPreferences));
  $('restorePreviousSettingsButton').disabled = !previous;
  $('previousSettingsLabel').textContent = previous?.savedAt ? `Copie créée ${formattedUpdateDate(previous.savedAt)}` : 'Aucune copie locale';
}
function showToast(message, kind = 'info') {
  const toast = $('toast');
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2800);
}
function openSettings() {
  updateSettingsMetadata();
  $('settingsBackdrop').hidden = false;
  $('settingsSheet').hidden = false;
  document.body.classList.add('sheet-open');
  setTimeout(() => $('closeSettingsButton').focus(), 0);
}
function closeSettings() {
  $('settingsBackdrop').hidden = true;
  $('settingsSheet').hidden = true;
  $('importPreview').hidden = true;
  pendingImport = null;
  document.body.classList.remove('sheet-open');
  $('settingsButton').focus();
}
function exportPreferences() {
  const now = new Date();
  const payload = {
    suite: 'Applications personnelles',
    app: 'Marées',
    schemaVersion: 1,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    data: { selectedStation: tideData?.site_id || 'boucau-bayonne-biarritz', stationName: tideData?.location || 'Tarnos', favorites: [] },
    settings: { ...preferences },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filenameDate = new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(now).replace(' ','_').replace(':','-');
  link.href = url;
  link.download = `Marees_${filenameDate}.json`;
  link.click();
  URL.revokeObjectURL(url);
  storageSet(STORAGE.lastBackup, now.toISOString());
  updateSettingsMetadata();
  showToast('Sauvegarde exportée', 'success');
}
function validateImport(payload) {
  if (!payload || payload.suite !== 'Applications personnelles' || payload.app !== 'Marées') throw new Error('Ce fichier ne correspond pas à l’application Marées.');
  if (payload.schemaVersion !== 1) throw new Error('Cette version de sauvegarde n’est pas compatible.');
  if (!payload.settings || typeof payload.settings !== 'object') throw new Error('Aucune préférence valide n’a été détectée.');
  return payload;
}
function previewImport(payload) {
  pendingImport = validateImport(payload);
  $('importPreviewDate').textContent = formattedUpdateDate(payload.exportedAt);
  $('importPreviewStation').textContent = payload.data?.stationName || 'Tarnos';
  $('importPreviewFavorites').textContent = String(Array.isArray(payload.data?.favorites) ? payload.data.favorites.length : 0);
  const detected = ['timeFormat24','showSolar','animations'].filter(key => key in payload.settings).length;
  $('importPreviewPreferences').textContent = `${detected} préférence${detected > 1 ? 's' : ''}`;
  $('importPreview').hidden = false;
  $('confirmImportButton').focus();
}
function confirmImport() {
  if (!pendingImport) return;
  storageSet(STORAGE.previousPreferences, JSON.stringify({ savedAt: new Date().toISOString(), settings: { ...preferences } }));
  savePreferences({ ...preferences, ...pendingImport.settings });
  applyPreferences();
  $('importPreview').hidden = true;
  pendingImport = null;
  updateSettingsMetadata();
  showToast('Préférences restaurées', 'success');
}
function restorePreviousPreferences() {
  const previous = safeJsonParse(storageGet(STORAGE.previousPreferences));
  if (!previous?.settings) return;
  const current = { savedAt: new Date().toISOString(), settings: { ...preferences } };
  savePreferences(previous.settings);
  storageSet(STORAGE.previousPreferences, JSON.stringify(current));
  applyPreferences();
  updateSettingsMetadata();
  showToast('Copie locale restaurée', 'success');
}
function bindSettings() {
  $('settingsButton').addEventListener('click', openSettings);
  $('closeSettingsButton').addEventListener('click', closeSettings);
  $('settingsBackdrop').addEventListener('click', closeSettings);
  $('timeFormatSetting').addEventListener('change', event => { savePreferences({ ...preferences, timeFormat24: event.target.checked }); applyPreferences(); });
  $('solarSetting').addEventListener('change', event => { savePreferences({ ...preferences, showSolar: event.target.checked }); applyPreferences(); });
  $('animationsSetting').addEventListener('change', event => { savePreferences({ ...preferences, animations: event.target.checked }); applyPreferences({rerender:false}); });
  $('settingsRefreshButton').addEventListener('click', () => refreshData({ manual: true }));
  $('exportSettingsButton').addEventListener('click', exportPreferences);
  $('importSettingsButton').addEventListener('click', () => $('importSettingsFile').click());
  $('importSettingsFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { previewImport(JSON.parse(await file.text())); } catch (error) { showToast(error.message || 'Sauvegarde incorrecte', 'error'); }
  });
  $('cancelImportButton').addEventListener('click', () => { $('importPreview').hidden = true; pendingImport = null; });
  $('confirmImportButton').addEventListener('click', confirmImport);
  $('restorePreviousSettingsButton').addEventListener('click', restorePreviousPreferences);
  document.addEventListener('keydown', event => {
    if ($('settingsSheet').hidden) return;
    if (event.key === 'Escape') { closeSettings(); return; }
    if (event.key === 'Tab') {
      const focusable = [...$('settingsSheet').querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}
function bindTabs() {
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    activeView=tab.dataset.view;
    document.querySelectorAll('.tab').forEach(t=>{t.classList.remove('active');t.removeAttribute('aria-current');});
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    tab.classList.add('active');tab.setAttribute('aria-current','page');$(activeView).classList.add('active');
    $('dayRailSection').hidden = activeView !== 'todayView';
    $('dataUpdateCard').hidden = activeView !== 'todayView';
    if (!$('appError').hidden) $('appError').hidden = activeView !== 'todayView';
    if(activeView==='todayView') {
      $('previousDay').setAttribute('aria-label','Jour précédent');
      $('nextDay').setAttribute('aria-label','Jour suivant');
      renderSelectedDay();
    } else {
      selectedWeekIndex=Math.floor(todayIndex()/14);
      renderWeek();
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }));
}
async function fetchPayload() {
  const response = await fetch('/api/tides?days=30', { cache: 'no-store' });
  if (!response.ok) throw new Error('Données indisponibles');
  const payload = await response.json();
  if (!Array.isArray(payload.days) || !payload.days.length) throw new Error('Données indisponibles');
  return payload;
}
function renderApplication({ selectedDate = null } = {}) {
  const matchingIndex = selectedDate ? tideData.days.findIndex(day => day.date === selectedDate) : -1;
  selectedDayIndex = matchingIndex >= 0 ? matchingIndex : todayIndex();
  selectedWeekIndex = Math.floor(selectedDayIndex / 14);
  renderSelectedDay();
  renderDataStatus();
  updateSettingsMetadata();
  scrollSelectedDayIntoView();
  $('appError').hidden = true;
  requestAnimationFrame(() => document.body.classList.add('app-ready'));
}
async function refreshData({ manual = false, initial = false } = {}) {
  if (isRefreshing) return;
  isRefreshing = true;
  setDataStatus('loading', 'Actualisation des données…', manual ? 'Mise à jour demandée' : 'Connexion en cours');
  try {
    const selectedDate = tideData?.days?.[selectedDayIndex]?.date || null;
    const payload = await fetchPayload();
    tideData = payload;
    saveLastPayload(payload);
    renderApplication({ selectedDate });
    if (manual) showToast('Données actualisées', 'success');
  } catch (error) {
    const fallback = tideData || readLastPayload();
    if (fallback?.days?.length) {
      const selectedDate = tideData?.days?.[selectedDayIndex]?.date || null;
      tideData = fallback;
      renderApplication({ selectedDate });
      renderDataStatus({ offline: !navigator.onLine, error: navigator.onLine });
      if (manual) showToast(navigator.onLine ? 'Actualisation impossible · dernières données conservées' : 'Données disponibles hors ligne', 'warning');
    } else {
      $('appError').hidden = false;
      $('appErrorTitle').textContent = navigator.onLine ? 'Données indisponibles' : 'Aucune donnée disponible hors ligne';
      $('appErrorMessage').textContent = navigator.onLine ? 'Impossible d’actualiser les données. Réessayez dans quelques instants.' : 'Connectez-vous une première fois pour enregistrer les marées de cette station.';
      setDataStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? 'Échec de mise à jour' : 'Hors ligne', 'Aucune donnée enregistrée');
    }
  } finally {
    isRefreshing = false;
    $('refreshDataButton').disabled = false;
    $('settingsRefreshButton').disabled = false;
  }
}
async function init() {
  applyPreferences({ rerender: false });
  bindTabs();
  bindNavigation();
  bindSettings();
  $('refreshDataButton').addEventListener('click', () => refreshData({ manual: true }));
  $('retryButton').addEventListener('click', () => refreshData({ manual: true }));
  window.addEventListener('online', () => refreshData({ manual: false }));
  window.addEventListener('offline', () => { if (tideData) renderDataStatus({ offline: true }); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
  await refreshData({ initial: true });
  if (tideData) {
    loadMissingSolar().then(() => renderSolar(selectedDay())).catch(() => {});
    setInterval(() => updateLive(new Date()), 30000);
  }
}
init();
