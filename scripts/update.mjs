// Scarica classifiche, calendario e marcatori da football-data.org e scrive site/data/dati.json.
// Uso: FOOTBALL_DATA_KEY=... node scripts/update.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const require = createRequire(import.meta.url);
const NameMatch = require(path.join(root, 'site', 'names.js'));

const KEY = process.env.FOOTBALL_DATA_KEY;
const OUT = path.join(root, 'site', 'data', 'dati.json');
const CODES = { 'serie-a': 'SA', premier: 'PL', liga: 'PD', bundesliga: 'BL1', ligue1: 'FL1', eredivisie: 'DED', primeira: 'PPL' };
const PENDING = ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE'];
const DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeOut(obj) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(obj));
}

if (!KEY) {
  console.log('::warning::FOOTBALL_DATA_KEY non impostata: la pagina usa i dati incorporati.');
  writeOut({ generatedAt: new Date().toISOString(), leagues: {} });
  process.exit(0);
}

// Nomi squadra usati nella pagina, letti da index.html, per controllare gli abbinamenti.
function siteTeams() {
  const html = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
  const a = html.indexOf('function T(');
  const b = html.indexOf('/* ---------- MODELLO');
  const L = new Function(html.slice(a, b) + ';return LEAGUES;')();
  const out = {};
  L.forEach((l) => (out[l.id] = l.teams.map((t) => t[0])));
  return out;
}

let lastCall = 0;
async function api(p) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = 6500 - (Date.now() - lastCall); // limite piano gratuito: 10 richieste al minuto
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch('https://api.football-data.org/v4' + p, { headers: { 'X-Auth-Token': KEY } });
    if (res.status === 429) { console.log('429, attendo 60 secondi'); await sleep(60000); continue; }
    if (!res.ok) throw new Error(p + ' → HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return res.json();
  }
  throw new Error(p + ' → troppe richieste');
}

const tm = (t) => ({ name: t.name, shortName: t.shortName });
const row = (r) => ({ team: tm(r.team), pos: r.position, played: r.playedGames, pts: r.points, gf: r.goalsFor, ga: r.goalsAgainst, gd: r.goalDifference });

function pickMatchday(matches) {
  const byDay = new Map();
  matches.forEach((m) => { if (m.matchday != null) { if (!byDay.has(m.matchday)) byDay.set(m.matchday, []); byDay.get(m.matchday).push(m); } });
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (!days.length) return null;
  const near = (list) => { // esclude le partite rinviate a date lontane dal resto della giornata
    const ts = list.map((m) => Date.parse(m.utcDate)).sort((a, b) => a - b);
    const med = ts[Math.floor(ts.length / 2)];
    return list.filter((m) => Math.abs(Date.parse(m.utcDate) - med) <= 7 * DAY);
  };
  for (const d of days) {
    if (near(byDay.get(d)).some((m) => PENDING.includes(m.status))) return { day: d, list: near(byDay.get(d)) };
  }
  const d = days[days.length - 1];
  return { day: d, list: near(byDay.get(d)) };
}

const teamsBySite = siteTeams();
const result = { generatedAt: new Date().toISOString(), leagues: {} };
let okCount = 0;

for (const [id, code] of Object.entries(CODES)) {
  try {
    const st = await api(`/competitions/${code}/standings`);
    const mt = await api(`/competitions/${code}/matches`);
    let sc = { scorers: [] };
    try { sc = await api(`/competitions/${code}/scorers?limit=30`); } catch (e) { console.log('::warning::marcatori ' + code + ': ' + e.message); }
    const table = (type) => ((st.standings || []).find((s) => s.type === type) || { table: [] }).table.map(row);
    const pick = pickMatchday(mt.matches || []);
    const data = {
      code,
      season: st.season && st.season.startDate ? st.season.startDate.slice(0, 4) : null,
      matchday: pick ? pick.day : null,
      standings: { total: table('TOTAL'), home: table('HOME'), away: table('AWAY') },
      matches: pick ? pick.list.map((m) => ({
        utc: m.utcDate, status: m.status, home: tm(m.homeTeam), away: tm(m.awayTeam),
        score: m.score && m.score.fullTime && m.score.fullTime.home != null ? { h: m.score.fullTime.home, a: m.score.fullTime.away } : null,
      })) : [],
      scorers: (sc.scorers || []).map((s) => ({ player: s.player.name, team: tm(s.team), goals: s.goals })),
    };
    // controllo degli abbinamenti con i nomi della pagina
    const names = teamsBySite[id];
    const unmatched = data.standings.total.filter((r) => !NameMatch.matchTeam(r.team, names)).map((r) => r.team.name);
    const unmatchedM = data.matches.flatMap((m) => [m.home, m.away]).filter((t) => !NameMatch.matchTeam(t, names)).map((t) => t.name);
    if (unmatched.length || unmatchedM.length) console.log('::warning::' + id + ' squadre non abbinate: ' + [...new Set([...unmatched, ...unmatchedM])].join(', '));
    result.leagues[id] = data;
    okCount++;
    console.log(id + ': giornata ' + data.matchday + ', ' + data.matches.length + ' partite, ' + data.standings.total.length + ' squadre');
  } catch (e) {
    console.log('::warning::' + id + ' non aggiornata: ' + e.message);
  }
}

if (!okCount) { console.log('::error::Nessun campionato scaricato: non pubblico.'); process.exit(1); }
writeOut(result);
console.log('Scritto ' + OUT + ' (' + okCount + ' campionati)');
