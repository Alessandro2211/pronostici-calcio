// Scarica calendario, risultati e classifiche dall'API pubblica di ESPN (nessuna chiave) e scrive:
//  - site/data/dati.json  (giornata corrente, classifica)
//  - site/data/live.json  (partite in corso o finite negli ultimi giorni)
// Uso: node scripts/update.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const require = createRequire(import.meta.url);
const NameMatch = require(path.join(root, 'site', 'names.js'));

const OUT = path.join(root, 'site', 'data', 'dati.json');
const OUT_LIVE = path.join(root, 'site', 'data', 'live.json');
const CODES = { 'serie-a': 'ita.1', premier: 'eng.1', liga: 'esp.1', bundesliga: 'ger.1', ligue1: 'fra.1', eredivisie: 'ned.1', primeira: 'por.1' };
const STANDINGS_EVERY = 30 * 60 * 1000;
const DAY = 86400000;
const PENDING = ['TIMED', 'IN_PLAY', 'PAUSED'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
}

async function espn(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sleep(350);
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (pronostici-calcio)', Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (attempt === 2) throw new Error(url + ' → ' + e.message);
      await sleep(2000 * (attempt + 1));
    }
  }
}

// Squadre e giornata di riferimento incorporate nella pagina (per controllare gli abbinamenti e numerare le giornate).
function siteData() {
  const html = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
  const a = html.indexOf('function T(');
  const b = html.indexOf('/* ---------- MODELLO');
  return new Function(html.slice(a, b) + ';return LEAGUES;')();
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

function toMatch(ev) {
  const comp = ev.competitions && ev.competitions[0];
  if (!comp) return null;
  const h = comp.competitors.find((c) => c.homeAway === 'home');
  const a = comp.competitors.find((c) => c.homeAway === 'away');
  if (!h || !a) return null;
  const st = status(ev);
  const n = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
  return {
    utc: ev.date, status: st, home: tm(h.team), away: tm(a.team),
    score: st === 'TIMED' || st === 'POSTPONED' ? null : { h: n(h.score), a: n(a.score) },
    minute: st === 'IN_PLAY' && ev.status.displayClock ? ev.status.displayClock : undefined,
  };
}

// Raggruppa le partite in giornate: una giornata finisce quando una squadra tornerebbe a giocare.
function groupRounds(matches) {
  const sorted = matches.filter((m) => m.status !== 'POSTPONED').sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
  const groups = [];
  let cur = null, teams = null;
  for (const m of sorted) {
    const k1 = m.home.name, k2 = m.away.name;
    if (!cur || teams.has(k1) || teams.has(k2)) { cur = []; teams = new Set(); groups.push(cur); }
    cur.push(m); teams.add(k1); teams.add(k2);
  }
  return groups;
}

function pickRound(groups) {
  const near = (list) => {
    const ts = list.map((m) => Date.parse(m.utc)).sort((a, b) => a - b);
    const med = ts[Math.floor(ts.length / 2)];
    return list.filter((m) => Math.abs(Date.parse(m.utc) - med) <= 7 * DAY);
  };
  for (let i = 0; i < groups.length; i++) {
    const g = near(groups[i]);
    if (g.some((m) => PENDING.includes(m.status))) return { idx: i, list: g };
  }
  return groups.length ? { idx: groups.length - 1, list: near(groups[groups.length - 1]) } : null;
}

function parseStandings(json) {
  const entries = (json.children && json.children[0] && json.children[0].standings && json.children[0].standings.entries) || [];
  const stat = (e, ...names) => { for (const n of names) { const s = (e.stats || []).find((x) => x.name === n); if (s && s.value != null) return +s.value; } return null; };
  const rows = entries.map((e, i) => ({
    team: tm(e.team), pos: stat(e, 'rank') || i + 1, played: stat(e, 'gamesPlayed'), pts: stat(e, 'points'),
    gf: stat(e, 'pointsFor'), ga: stat(e, 'pointsAgainst'), gd: stat(e, 'pointDifferential'),
  })).filter((r) => r.played != null && r.pts != null);
  const total = rows.reduce((s, r) => s + r.played, 0);
  return total > 0 ? rows : []; // classifica a zero = stagione non ancora caricata da ESPN: la ignoro
}

const leagues = siteData();
const now = Date.now();
const result = { generatedAt: new Date(now).toISOString(), standingsAt: null, leagues: {} };
const live = { generatedAt: result.generatedAt, matches: [] };

// Classifiche precedenti, riprese dalla pagina già pubblicata, per non riscaricarle a ogni esecuzione.
let prev = null;
if (process.env.FORCE_FULL !== '1' && process.env.GITHUB_REPOSITORY) {
  const [owner, name] = process.env.GITHUB_REPOSITORY.split('/');
  try {
    const res = await fetch(`https://${owner.toLowerCase()}.github.io/${name}/data/dati.json?t=${now}`);
    if (res.ok) { const j = await res.json(); if (j.standingsAt && now - Date.parse(j.standingsAt) < STANDINGS_EVERY) prev = j; }
  } catch { /* nessuna copia precedente */ }
}
if (prev) console.log('Classifiche recenti (' + prev.standingsAt + '): le riuso.');
let standingsFetched = false;

for (const L of leagues) {
  const code = CODES[L.id];
  const names = L.teams.map((t) => t[0]);
  try {
    const sb = await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${ymd(now - 7 * DAY)}-${ymd(now + 10 * DAY)}&limit=500`);
    const all = (sb.events || []).map(toMatch).filter(Boolean);
    const groups = groupRounds(all);
    const pick = pickRound(groups);

    let standings = prev && prev.leagues[L.id] ? prev.leagues[L.id].standings : null;
    if (!standings || !standings.total.length) {
      try {
        const st = await espn(`https://site.api.espn.com/apis/v2/sports/soccer/${code}/standings`);
        standings = { total: parseStandings(st), home: [], away: [] };
        standingsFetched = true;
      } catch (e) { console.log('::warning::classifica ' + L.id + ': ' + e.message); standings = { total: [], home: [], away: [] }; }
    }

    // numero della giornata: dalla classifica se valida, altrimenti rispetto alla giornata incorporata nella pagina
    let matchday = null;
    if (pick && standings.total.length) {
      const gp = new Map(standings.total.map((r) => [NameMatch.matchTeam(r.team, names), r.played]));
      let best = 0;
      pick.list.forEach((m) => [m.home, m.away].forEach((t) => {
        const n = NameMatch.matchTeam(t, names);
        if (n && gp.has(n)) best = Math.max(best, gp.get(n) + (PENDING.includes(m.status) ? 1 : 0));
      }));
      matchday = best || null;
    }
    if (pick && !matchday && L.matches.length) {
      const first = L.matches[0][0];
      const ai = groups.findIndex((g) => g.some((m) => Math.abs(Date.parse(m.utc) - Date.parse(first + 'T12:00:00Z')) <= 1.5 * DAY));
      if (ai >= 0) matchday = L.round + (pick.idx - ai);
    }

    result.leagues[L.id] = {
      code, matchday, standings,
      matches: pick ? pick.list : [], scorers: [],
    };
    all.filter((m) => ['IN_PLAY', 'PAUSED', 'FINISHED'].includes(m.status) && now - Date.parse(m.utc) < 2 * DAY)
      .forEach((m) => live.matches.push({ comp: L.id, status: m.status, utc: m.utc, minute: m.minute, home: m.home, away: m.away, score: m.score }));

    const bad = new Set();
    pick && pick.list.forEach((m) => [m.home, m.away].forEach((t) => { if (!NameMatch.matchTeam(t, names)) bad.add(t.name); }));
    standings.total.forEach((r) => { if (!NameMatch.matchTeam(r.team, names)) bad.add(r.team.name); });
    if (bad.size) console.log('::warning::' + L.id + ' squadre non abbinate: ' + [...bad].join(', '));
    console.log(L.id + ': giornata ' + matchday + ', ' + (pick ? pick.list.length : 0) + ' partite, classifica ' + standings.total.length + ' squadre');
  } catch (e) {
    console.log('::warning::' + L.id + ' non aggiornato: ' + e.message);
  }
}

if (!Object.keys(result.leagues).length) { console.log('::error::Nessun campionato scaricato: non pubblico.'); process.exit(1); }
result.standingsAt = standingsFetched || !prev ? result.generatedAt : prev.standingsAt;
writeJson(OUT, result);
writeJson(OUT_LIVE, live);
console.log('Scritti dati.json (' + Object.keys(result.leagues).length + ' campionati) e live.json (' + live.matches.length + ' partite)');
