const API_BASE = 'https://api-maree.fr';
const SUN_API = 'https://api.sunrisesunset.io/json';
const SITE_ID = 'boucau-bayonne-biarritz';
const TZ = 'Europe/Paris';
const LAT = 43.541;
const LNG = -1.462;
const CACHE_SECONDS = 21600;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'marees-tarnos-api', time: new Date().toISOString() });
    }

    if (url.pathname === '/api/tides') {
      if (request.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405);
      if (!env.API_MAREE_KEY) return json({ error: 'Le secret API_MAREE_KEY n’est pas configuré dans Cloudflare.' }, 503);

      const days = clamp(Number(url.searchParams.get('days') || 30), 1, 30);
      const cacheUrl = new URL(request.url);
      cacheUrl.search = `?days=${days}`;
      const cacheKey = new Request(cacheUrl.toString(), request);
      const cache = caches.default;
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      try {
        const result = await buildPayload(env.API_MAREE_KEY, days);
        const response = json(result, 200, {
          'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
          'CDN-Cache-Control': `max-age=${CACHE_SECONDS}`,
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        return json({
          error: 'Données de marée temporairement indisponibles',
          detail: error instanceof Error ? error.message : String(error),
        }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function buildPayload(apiKey, days) {
  const start = parisDateKey(new Date());
  const endDate = addDays(start, days - 1);
  const endExclusive = addDays(start, days);

  const extremaParams = new URLSearchParams({
    key: apiKey,
    site: SITE_ID,
    from: start,
    to: endDate,
    tz: TZ,
  });

  const levelsParams = new URLSearchParams({
    key: apiKey,
    site: SITE_ID,
    from: `${start}T00:00`,
    to: `${endExclusive}T00:00`,
    step: '30',
    tz: TZ,
  });

  const sunParams = new URLSearchParams({
    lat: String(LAT),
    lng: String(LNG),
    date_start: start,
    date_end: endDate,
    timezone: TZ,
    time_format: '24',
    elevation: 'false',
  });

  const [extrema, levels, solar] = await Promise.all([
    fetchJson(`${API_BASE}/tide-extrema?${extremaParams}`),
    fetchJson(`${API_BASE}/water-levels?${levelsParams}`),
    fetchJson(`${SUN_API}?${sunParams}`),
  ]);

  const solarItems = Array.isArray(solar.results) ? solar.results : solar.results ? [solar.results] : [];
  const solarByDate = new Map(solarItems.map(item => [item.date, item]));
  const levelsByDate = new Map();

  for (const point of levels.data || []) {
    const date = String(point.time || '').slice(0, 10);
    const time = String(point.time || '').slice(11, 16);
    if (!date || !time) continue;
    if (!levelsByDate.has(date)) levelsByDate.set(date, []);
    levelsByDate.get(date).push({ time, height: round(Number(point.height), 3) });
  }

  const sourceDays = Array.isArray(extrema.data) ? extrema.data : [];
  const normalizedDays = sourceDays.map(day => {
    const sun = solarByDate.get(day.date) || {};
    return {
      date: day.date,
      events: (day.extrema || []).map(event => ({
        type: event.type === 'PM' ? 'high' : 'low',
        time: event.time,
        height: round(Number(event.height), 2),
        ...(event.coef !== undefined && event.coef !== null ? { coefficient: Number(event.coef) } : {}),
      })),
      levels: levelsByDate.get(day.date) || [],
      solar: {
        dawn: cleanTime(sun.dawn),
        sunrise: cleanTime(sun.sunrise),
        sunset: cleanTime(sun.sunset),
        dusk: cleanTime(sun.dusk),
      },
    };
  });

  if (!normalizedDays.length) throw new Error('La source n’a renvoyé aucune journée.');

  return {
    location: 'Tarnos',
    reference_port: extrema.site_name || levels.site_name || 'Boucau-Bayonne / Biarritz',
    site_id: extrema.site_id || levels.site_id || SITE_ID,
    timezone: TZ,
    updated_at: new Date().toISOString(),
    attribution: 'Données de marée : api-maree.fr — composantes harmoniques Ifremer / PREVIMER. Données solaires : SunriseSunset.io.',
    days: normalizedDays,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Source HTTP ${response.status}${text ? ` — ${text.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cleanTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

function parisDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}
