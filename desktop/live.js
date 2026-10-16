// Risultati in diretta letti direttamente da ESPN (nessuna chiave), dal programma e non da GitHub.
// Il file live.json pubblicato dipende da GitHub Actions, che parte solo ogni poche ore: qui no.
// Restituisce lo stesso formato di site/data/live.json.
const CODES = { 'serie-a': 'ita.1', premier: 'eng.1', liga: 'esp.1', bundesliga: 'ger.1', ligue1: 'fra.1', eredivisie: 'ned.1', primeira: 'por.1' };
const DAY = 86400000;
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (pronostici-calcio-desktop)', Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

const tm = (t) => ({ name: t.displayName || t.name, shortName: t.shortDisplayName || t.name });

function status(ev) {
  const t = (ev.status && ev.status.type) || {};
  if (['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_SUSPENDED', 'STATUS_ABANDONED'].includes(t.name)) return 'POSTPONED';
  if (t.name === 'STATUS_HALFTIME') return 'PAUSED';
  if (t.state === 'in') return 'IN_PLAY';
  if (t.state === 'post') return 'FINISHED';
  return 'TIMED';
}

function toMatch(id, ev) {
  const comp = ev.competitions && ev.competitions[0];
  if (!comp) return null;
  const h = comp.competitors.find((c) => c.homeAway === 'home');
  const a = comp.competitors.find((c) => c.homeAway === 'away');
  if (!h || !a) return null;
  const st = status(ev);
  if (!['IN_PLAY', 'PAUSED', 'FINISHED'].includes(st)) return null;
  const n = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
  return {
    comp: id, status: st, utc: ev.date, home: tm(h.team), away: tm(a.team),
    score: { h: n(h.score), a: n(a.score) },
    minute: st === 'IN_PLAY' && ev.status.displayClock ? ev.status.displayClock : undefined,
  };
}

// Ultimo risultato valido per campionato: se una richiesta fallisce, restano le partite del giro precedente.
const byLeague = {};

async function fetchLive() {
  const now = Date.now();
  const days = [ymd(now - DAY), ymd(now), ymd(now + DAY)];
  let ok = 0;
  await Promise.all(Object.entries(CODES).map(async ([id, code]) => {
    try {
      const lists = await Promise.all(days.map((d) => getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${d}`)));
      const seen = new Map();
      lists.forEach((sb) => (sb.events || []).forEach((ev) => {
        const m = toMatch(id, ev);
        if (m && now - Date.parse(m.utc) < 2 * DAY) seen.set(ev.id || m.home.name + m.away.name + m.utc, m);
      }));
      byLeague[id] = [...seen.values()];
      ok++;
    } catch { /* tengo il giro precedente */ }
  }));
  if (!ok) throw new Error('ESPN non raggiungibile');
  return { generatedAt: new Date(now).toISOString(), matches: Object.values(byLeague).flat() };
}

module.exports = { fetchLive };
