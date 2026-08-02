const TZ = 'Europe/Paris';
const SOLAR_API = 'https://api.sunrisesunset.io/json';
const LAT = 43.541;
const LNG = -1.462;
let tideData;
let selectedDayIndex = 0;
let selectedWeekIndex = 0;
let activeView = 'todayView';

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
  $('dawn').textContent=cleanTime(s.dawn); $('sunrise').textContent=cleanTime(s.sunrise);
  $('sunset').textContent=cleanTime(s.sunset); $('dusk').textContent=cleanTime(s.dusk);
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
function curvePath(points, width, height, bottomPadding = 10) {
  const heights = points.map(point => point.height);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const spread = Math.max(0.35, max - min);
  const topPad = 12;
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
  const topPad = 12;
  const bottomPad = 10;
  const usableHeight = height - topPad - bottomPad;
  const before = [...points].reverse().find(point => point.minutes <= targetMinutes) || points[0];
  const after = points.find(point => point.minutes >= targetMinutes) || points[points.length - 1];
  const heightValue = before.minutes === after.minutes ? before.height : interpolateHeight(before, after, targetMinutes);
  return {
    x: (targetMinutes / 1440) * width,
    y: topPad + (1 - ((heightValue - min) / spread)) * usableHeight,
  };
}
function renderHeroCurve(day, now = new Date()) {
  const svgWidth = 320;
  const svgHeight = 112;
  const points = curvePointsForDay(selectedDayIndex);
  const { line, fill } = curvePath(points, svgWidth, svgHeight);
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
}
function eventCard(e,dateKey) {
  return `<article class="card event-card"><div class="event-date">${shortEventDate(dateKey)}</div><div class="event-time">${e.time}</div><div class="event-type">${eventName(e.type)}</div><div class="event-meta"><strong>${formatHeight(e.height)}</strong><span>${e.coefficient ? `Coef. ${e.coefficient}` : '&nbsp;'}</span></div></article>`;
}
function updateHeaderForDay(day, now=new Date()) {
  const shownDate=eventDate(day.date,'12:00');
  const isToday=day.date===localDateKey(now);
  $('pageTitle').textContent=isToday?'Aujourd’hui':frDate(shownDate,{weekday:'long'}).replace(/^./,c=>c.toUpperCase());
  $('fullDate').textContent=frDate(shownDate,{weekday:'long',day:'numeric',month:'long'});
  $('todayButton').hidden=isToday;
  $('todayButton').textContent=`Retour au ${shortEventDate(localDateKey(now))}`;
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
  if (day.date===localDateKey(now)) updateLive(now); else renderForecastHero(day);
}
function renderForecastHero(day) {
  const first=day.events[0];
  $('tideDirection').textContent='Prévisions';
  $('currentTime').textContent=shortEventDate(day.date);
  $('nextLabel').textContent='PREMIÈRE MARÉE';
  $('countdown').textContent=first.time;
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
  $('currentTime').textContent=frDate(now,{hour:'2-digit',minute:'2-digit'});
  $('nextLabel').textContent=`${eventName(next.type).toUpperCase()} DANS`;
  $('countdown').textContent=countdownText(next.at-now);
  $('nextDate').textContent=shortEventDate(next.date); $('nextTime').textContent=next.time; $('nextType').textContent=eventName(next.type);
  $('nextHeight').textContent=formatHeight(next.height); $('nextCoeff').textContent=next.coefficient?`Coefficient ${next.coefficient}`:'';
  renderHeroCurve(selectedDay(), now);
}

function weekCount() { return Math.max(1, Math.ceil(tideData.days.length / 7)); }
function weekSlice(index=selectedWeekIndex) { return tideData.days.slice(index * 7, index * 7 + 7); }
function renderWeek() {
  const days=weekSlice();
  $('weekList').innerHTML=days.map(day=>{
    const date=eventDate(day.date,'12:00');
    const name=frDate(date,{weekday:'long'}); const shortDate=frDate(date,{day:'numeric',month:'long'});
    const events=day.events.map(e=>`<div class="day-event"><div class="mini-type">${shortType(e.type)}</div><div class="mini-time">${e.time}</div><div class="mini-height">${formatHeight(e.height)}</div><div class="mini-coeff">${e.coefficient?`Coef. ${e.coefficient}`:''}</div></div>`).join('');
    return `<article class="card day-card"><div class="day-heading"><strong>${name[0].toUpperCase()+name.slice(1)}</strong><span>${shortDate}</span></div><div class="day-events">${events}</div></article>`;
  }).join('');
  const first=days[0],last=days.at(-1);
  $('pageTitle').textContent='7 jours';
  $('fullDate').textContent=first&&last?`${frDate(eventDate(first.date,'12:00'),{day:'numeric',month:'short'})} – ${frDate(eventDate(last.date,'12:00'),{day:'numeric',month:'short'})}`:'';
  const totalWeeks = weekCount();
  $('previousDay').disabled = selectedWeekIndex === 0;
  $('nextDay').disabled = selectedWeekIndex >= totalWeeks - 1;
  $('previousDay').setAttribute('aria-label', 'Semaine précédente');
  $('nextDay').setAttribute('aria-label', 'Semaine suivante');
  $('weekHint').hidden = totalWeeks > 1;
  $('todayButton').hidden=selectedWeekIndex===Math.floor(todayIndex()/7);
  $('todayButton').textContent='Semaine actuelle';
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
    else {selectedWeekIndex=Math.floor(todayIndex()/7);renderWeek();}
    window.scrollTo({top:0,behavior:'smooth'});
  });
}
function renderDataStatus() {
  const updated=tideData.updated_at?new Date(tideData.updated_at):null;
  $('dataStatus').textContent=updated&&!Number.isNaN(updated.valueOf())?`Actualisé ${frDate(updated,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'';
}
function bindTabs() {
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    activeView=tab.dataset.view;
    document.querySelectorAll('.tab').forEach(t=>{t.classList.remove('active');t.removeAttribute('aria-current');});
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    tab.classList.add('active');tab.setAttribute('aria-current','page');$(activeView).classList.add('active');
    $('dayRailSection').hidden = activeView !== 'todayView';
    if(activeView==='todayView') {
      $('previousDay').setAttribute('aria-label','Jour précédent');
      $('nextDay').setAttribute('aria-label','Jour suivant');
      renderSelectedDay();
    } else {
      selectedWeekIndex=Math.floor(todayIndex()/7);
      renderWeek();
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }));
}
async function init() {
  const response=await fetch(`data/tides.json?v=${Date.now()}`,{cache:'no-store'});
  if(!response.ok) throw new Error('Données indisponibles');
  tideData=await response.json();
  if(!Array.isArray(tideData.days)||!tideData.days.length) throw new Error('Données indisponibles');
  selectedDayIndex=todayIndex(); selectedWeekIndex=Math.floor(selectedDayIndex/7);
  renderSelectedDay(); renderDataStatus(); bindTabs(); bindNavigation(); scrollSelectedDayIntoView();
  loadMissingSolar().then(()=>renderSolar(selectedDay())).catch(error=>console.warn(error));
  setInterval(()=>updateLive(new Date()),30000);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
}
init().catch(()=>{document.body.innerHTML='<main class="app-shell"><p class="eyebrow">TARNOS</p><h1>Données indisponibles</h1><p class="date-line">Réessayez avec une connexion internet.</p></main>';});
