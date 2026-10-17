// Scarica calendario, risultati e classifiche dall'API pubblica di ESPN (nessuna chiave) e scrive:
//  - site/data/dati.json  (giornata corrente, classifica, marcatori)
//  - site/data/live.json  (partite in corso o finite negli ultimi giorni)
// ESPN accetta una sola data per richiesta (gli intervalli danno errore), quindi:
//  - a ogni esecuzione: solo ieri, oggi e domani (21 richieste) per i risultati;
//  - ogni 30 minuti, o quando finisce l'ultima partita di una giornata: finestra completa e classifiche.
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
const OUT_HIST = path.join(root, 'site', 'data', 'storico.json');
const CODES = { 'serie-a': 'ita.1', premier: 'eng.1', liga: 'esp.1', bundesliga: 'ger.1', ligue1: 'fra.1', eredivisie: 'ned.1', primeira: 'por.1' };
const FULL_EVERY = 30 * 60 * 1000;
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
  const sideOf = (d) => (d.team && String(d.team.id) === String(h.team.id) ? 'h' : d.team && String(d.team.id) === String(a.team.id) ? 'a' : null);
  const goals = [], reds = [];
  (comp.details || []).forEach((d) => {
    const who = d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName, sd = sideOf(d);
    if (!who || !sd) return;
    if (d.scoringPlay && !d.ownGoal && !d.shootout) goals.push([who, sd]);
    if (d.redCard) reds.push([who, sd]);
  });
  return {
    id: ev.id, utc: ev.date, status: st, home: tm(h.team), away: tm(a.team), goals, reds,
    score: st === 'TIMED' || st === 'POSTPONED' ? null : { h: n(h.score), a: n(a.score) },
    minute: st === 'IN_PLAY' && ev.status.displayClock ? ev.status.displayClock : undefined,
  };
}

// Raggruppa le partite in giornate. Una nuova giornata comincia quando una squadra tornerebbe a giocare
// oppure quando passano più di 3 giorni dalla partita precedente (altrimenti gli ultimi recuperi di una
// giornata si fondono con le prime partite della successiva).
const ROUND_GAP = 3 * DAY;
function groupRounds(matches) {
  const sorted = matches.filter((m) => m.status !== 'POSTPONED').sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
  const groups = [];
  let cur = null, teams = null, last = 0;
  for (const m of sorted) {
    const k1 = m.home.name, k2 = m.away.name, t = Date.parse(m.utc);
    if (!cur || teams.has(k1) || teams.has(k2) || t - last > ROUND_GAP) { cur = []; teams = new Set(); groups.push(cur); }
    cur.push(m); teams.add(k1); teams.add(k2); last = t;
  }
  return groups;
}

// Sceglie la giornata da mostrare: la prima con partite ancora da giocare. Un recupero isolato non conta come giornata
// (servono almeno metà delle partite attese); se non c'è nessuna giornata in programma resta l'ultima conclusa.
function pickRound(groups, expected = 8) {
  const near = (list) => {
    const ts = list.map((m) => Date.parse(m.utc)).sort((a, b) => a - b);
    const med = ts[Math.floor(ts.length / 2)];
    return list.filter((m) => Math.abs(Date.parse(m.utc) - med) <= 7 * DAY);
  };
  const minSize = Math.max(2, Math.ceil(expected / 2));
  const lists = groups.map(near);
  const big = lists.map((g, i) => i).filter((i) => lists[i].length >= minSize);
  const pend = (i) => lists[i].some((m) => PENDING.includes(m.status));
  let idx = big.find(pend);
  if (idx === undefined && big.length) idx = big[big.length - 1];
  if (idx === undefined) idx = lists.findIndex((g, i) => pend(i));
  if (idx === undefined || idx < 0) idx = groups.length - 1;
  return groups.length ? { idx, list: lists[idx] } : null;
}

function standingsEntries(json) {
  return (json.children && json.children[0] && json.children[0].standings && json.children[0].standings.entries) || [];
}
// id ESPN della squadra -> nome (serve per collegare i marcatori alla squadra)
function teamIds(json) {
  const m = new Map();
  standingsEntries(json).forEach((e) => { if (e.team && e.team.id != null) m.set(String(e.team.id), tm(e.team)); });
  return m;
}
function parseStandings(json) {
  const entries = standingsEntries(json);
  const stat = (e, ...names) => { for (const n of names) { const s = (e.stats || []).find((x) => x.name === n); if (s && s.value != null) return +s.value; } return null; };
  const rows = entries.map((e, i) => ({
    team: tm(e.team), pos: stat(e, 'rank') || i + 1, played: stat(e, 'gamesPlayed'), pts: stat(e, 'points'),
    gf: stat(e, 'pointsFor'), ga: stat(e, 'pointsAgainst'), gd: stat(e, 'pointDifferential'),
  })).filter((r) => r.played != null && r.pts != null);
  const total = rows.reduce((s, r) => s + r.played, 0);
  return total > 0 ? rows : []; // classifica a zero = stagione non ancora caricata da ESPN: la ignoro
}


// Classifica marcatori (servizio "core" di ESPN): i giocatori arrivano come riferimenti, i nomi si leggono una volta e si conservano.
const seasonYear = () => { const d = new Date(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
const refId = (ref, kind) => { const m = new RegExp('/' + kind + '/(\\d+)').exec((ref && ref.$ref) || ''); return m ? m[1] : null; };
const httpsRef = (r) => r.replace(/^http:/, 'https:');
async function fetchScorers(code, idToTeam, names) {
  const base = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${code}/seasons/${seasonYear()}`;
  const lj = await espn(`${base}/types/1/leaders?limit=20`);
  const cat = (lj.categories || []).find((c) => c.name === 'goals') || (lj.categories || []).find((c) => c.name === 'goalsLeaders');
  const leaders = ((cat && cat.leaders) || []).slice(0, 20);
  const out = [];
  const queue = leaders.map((l) => ({ l, aid: refId(l.athlete, 'athletes'), tid: refId(l.team, 'teams') }));
  const worker = async () => {
    while (queue.length) {
      const { l, aid, tid } = queue.shift();
      if (!aid) continue;
      if (!names[aid]) { try { const a = await espn(httpsRef(l.athlete.$ref)); names[aid] = a.displayName || a.fullName || null; } catch { /* nome non disponibile */ } }
      let team = idToTeam.get(tid);
      if (!team && l.team && l.team.$ref) { try { const t = await espn(httpsRef(l.team.$ref)); team = tm(t); idToTeam.set(tid, team); } catch { /* squadra non disponibile */ } }
      if (names[aid] && team) out.push({ player: names[aid], team, goals: +l.value });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out.sort((a, b) => b.goals - a.goals);
}

// Elenco di partite per più giorni, con poche richieste in parallelo.
async function fetchDays(code, offsets, now) {
  const byId = new Map();
  const queue = [...offsets];
  const worker = async () => {
    while (queue.length) {
      const k = queue.shift();
      const sb = await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${ymd(now + k * DAY)}`);
      (sb.events || []).forEach((ev) => { const m = toMatch(ev); if (m) byId.set(ev.id || m.home.name + m.away.name + m.utc, m); });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return [...byId.values()];
}
const key = (m) => m.home.name + '|' + m.away.name;

// Storico delle partite finite della stagione (serve alla voce "Giocate" della pagina).
// ESPN dà un solo giorno per richiesta: la prima volta si scarica tutta la stagione, poi solo gli ultimi giorni.
const hist = { covered: {}, leagues: {} }; // leagues[id] = Map(key -> {utc, home, away, h, a})
const addHist = (id, m) => {
  if (m.status !== 'FINISHED' || !m.score || m.score.h == null || m.score.a == null) return;
  if (!hist.leagues[id]) hist.leagues[id] = new Map();
  const old = hist.leagues[id].get(key(m));
  const sum = (m.goals || []).length;
  const goalsOk = sum >= 1 || m.score.h + m.score.a === 0; // dettagli presenti (o partita 0-0)
  const g = goalsOk ? m.goals : old && old.g;
  hist.leagues[id].set(key(m), {
    id: m.id || (old && old.id), utc: m.utc, home: m.home, away: m.away, h: m.score.h, a: m.score.a,
    ...(g && g.length ? { g } : {}), ...(m.reds && m.reds.length ? { rc: m.reds } : old && old.rc ? { rc: old.rc } : {}),
    ...(old && old.st ? { st: old.st } : {}), ...(old && old.sa ? { sa: old.sa } : {}),
    ...(old && old.pl ? { pl: old.pl } : {}), ...(old && old.pa ? { pa: old.pa } : {}),
  });
};

// Statistiche di ogni partita finita (tiri, tiri in porta, corner, falli, ammonizioni, possesso), dal riepilogo di ESPN.
// Servono al modello subito dopo la fine delle partite: dalle prove su stagioni passate migliorano i pronostici.
const numv = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isNaN(x) ? null : x; };
function parseStats(js, e) {
  const teams = (js.boxscore && js.boxscore.teams) || [];
  const comps = (((js.header || {}).competitions || [])[0] || {}).competitors || [];
  const side = new Map(comps.map((c) => [String(c.team && c.team.id), c.homeAway]));
  const out = {};
  for (const t of teams) {
    const nm = (t.team && (t.team.displayName || t.team.name)) || '';
    const s = t.homeAway || side.get(String(t.team && t.team.id)) || (nm === e.home.name ? 'home' : nm === e.away.name ? 'away' : null);
    if (!s) continue;
    const v = Object.fromEntries((t.statistics || []).map((x) => [x.name, numv(x.displayValue != null ? x.displayValue : x.value)]));
    out[s] = v;
  }
  if (!out.home || !out.away || out.home.totalShots == null || out.away.totalShots == null || out.home.shotsOnTarget == null || out.away.shotsOnTarget == null) return null;
  const g = (side2, k) => (out[side2][k] == null ? 0 : out[side2][k]);
  return {
    hs: g('home', 'totalShots'), as: g('away', 'totalShots'), hst: g('home', 'shotsOnTarget'), ast: g('away', 'shotsOnTarget'),
    hc: g('home', 'wonCorners'), ac: g('away', 'wonCorners'), hf: g('home', 'foulsCommitted'), af: g('away', 'foulsCommitted'),
    hy: g('home', 'yellowCards'), ay: g('away', 'yellowCards'), hr: g('home', 'redCards'), ar: g('away', 'redCards'),
    hp: out.home.possessionPct == null ? null : out.home.possessionPct,
  };
}
// Chi è sceso in campo (titolari e subentrati) dal riepilogo: serve a capire quali giocatori chiave mancano nell'ultima gara.
function parseRoster(js) {
  const out = {};
  for (const r of js.rosters || []) {
    const names = (r.roster || []).filter((x) => x.starter || x.subbedIn).map((x) => x.athlete && x.athlete.displayName).filter(Boolean);
    if (r.homeAway === 'home' || r.homeAway === 'away') out[r.homeAway === 'home' ? 'h' : 'a'] = names;
  }
  return out.h && out.a && out.h.length >= 11 && out.a.length >= 11 ? out : null;
}
const PL_DAYS = 25;
async function fillStats(id, code, cap) {
  const all = [...(hist.leagues[id] || new Map()).values()];
  const recent = (e) => Date.now() - Date.parse(e.utc) < PL_DAYS * DAY;
  const todo = all.filter((e) => e.id && ((!e.st && (e.sa || 0) < 3) || (!e.pl && recent(e) && (e.pa || 0) < 3))).sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc)).slice(0, cap);
  if (!todo.length) return;
  let ok = 0, fail = 0, empty = 0;
  const worker = async () => {
    while (todo.length) {
      const e = todo.shift();
      try {
        const js = await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/summary?event=${e.id}`);
        if (!e.st) { const st = parseStats(js, e); if (st) { e.st = st; ok++; } else { e.sa = (e.sa || 0) + 1; empty++; } }
        if (!e.pl && recent(e)) { const pl = parseRoster(js); if (pl) e.pl = pl; else e.pa = (e.pa || 0) + 1; }
      } catch { fail++; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log('statistiche ' + id + ': ' + ok + ' partite lette' + (empty ? ', ' + empty + ' senza statistiche' : '') + (fail ? ', ' + fail + ' richieste fallite (riprovo)' : ''));
}
async function backfillHist(id, code, now) {
  const to = ymd(now - DAY).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3');
  const startT = hist.covered[id] ? Date.parse(hist.covered[id]) - 3 * DAY : Date.parse(seasonYear() + '-08-01');
  const n = Math.min(240, Math.max(1, Math.ceil((now - startT) / DAY)));
  const queue = Array.from({ length: n + 1 }, (_, i) => -n + i); // da n giorni fa a oggi
  let failed = 0, read = 0;
  const worker = async () => {
    while (queue.length) {
      const k = queue.shift();
      try {
        const sb = await espn(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${ymd(now + k * DAY)}`);
        (sb.events || []).forEach((ev) => { const m = toMatch(ev); if (m) { addHist(id, m); read++; } });
      } catch { failed++; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (failed) console.log('::warning::storico ' + id + ': ' + failed + ' giorni non letti, li riprovo al prossimo giro');
  else hist.covered[id] = to; // avanzo solo se non mancano giorni
  console.log('storico ' + id + ': ' + (hist.leagues[id] ? hist.leagues[id].size : 0) + ' partite finite (' + (n + 1) + ' giorni letti)');
}

function buildLeague(L, code, all, standings, now) {
  const names = L.teams.map((t) => t[0]);
  const groups = groupRounds(all);
  const pick = pickRound(groups, Math.floor(names.length / 2));
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
  if (pick && !matchday && L.matches.length) { // classifica non valida: conto rispetto alla giornata incorporata nella pagina
    const first = L.matches[0][0];
    const ai = groups.findIndex((g) => g.some((m) => Math.abs(Date.parse(m.utc) - Date.parse(first + 'T12:00:00Z')) <= 1.5 * DAY));
    if (ai >= 0) matchday = L.round + (pick.idx - ai);
  }
  const bad = new Set();
  pick && pick.list.forEach((m) => [m.home, m.away].forEach((t) => { if (!NameMatch.matchTeam(t, names)) bad.add(t.name); }));
  standings.total.forEach((r) => { if (!NameMatch.matchTeam(r.team, names)) bad.add(r.team.name); });
  if (bad.size) console.log('::warning::' + L.id + ' squadre non abbinate: ' + [...bad].join(', '));
  return { code, matchday, standings, matches: pick ? pick.list : [], scorers: [] };
}

const leagues = siteData();
const now = Date.now();
const iso = new Date(now).toISOString();
const live = { generatedAt: iso, matches: [] };
const pushLive = (id, m) => {
  if (['IN_PLAY', 'PAUSED', 'FINISHED'].includes(m.status) && now - Date.parse(m.utc) < 2 * DAY)
    live.matches.push({ comp: id, status: m.status, utc: m.utc, minute: m.minute, home: m.home, away: m.away, score: m.score });
};

// Dati precedenti, ripresi dalla pagina già pubblicata.
let prev = null, prevAny = null;
if (process.env.GITHUB_REPOSITORY) {
  const [owner, name] = process.env.GITHUB_REPOSITORY.split('/');
  try {
    const res = await fetch(`https://${owner.toLowerCase()}.github.io/${name}/data/dati.json?t=${now}`);
    if (res.ok) {
      const j = await res.json();
      prevAny = j; // anche se vecchio: serve per i nomi dei giocatori e, se ESPN non risponde, per i marcatori
      if (process.env.FORCE_FULL !== '1' && j.fullAt && now - Date.parse(j.fullAt) < FULL_EVERY && Object.keys(j.leagues || {}).length) prev = j;
    }
  } catch { /* nessuna copia precedente */ }
}
const athleteNames = { ...((prevAny && prevAny.athletes) || {}) };

if (process.env.GITHUB_REPOSITORY) {
  const [owner, name] = process.env.GITHUB_REPOSITORY.split('/');
  try {
    const res = await fetch(`https://${owner.toLowerCase()}.github.io/${name}/data/storico.json?t=${now}`);
    if (res.ok) {
      const j = await res.json();
      hist.covered = j.v === 2 ? (j.covered || {}) : {}; // versione 2: marcatori per partita, riletto tutto il campionato una volta
      for (const [id, list] of Object.entries(j.leagues || {})) {
        hist.leagues[id] = new Map(list.map((e) => [e.home.name + '|' + e.away.name, e]));
      }
    }
  } catch { /* nessuno storico precedente: si ricostruisce */ }
}

let result = null;
if (prev) {
  // esecuzione leggera: aggiorno stato e punteggi delle partite già note
  result = prev; result.generatedAt = iso;
  let roundOver = false;
  for (const L of leagues) {
    const d = result.leagues[L.id]; if (!d) continue;
    try {
      const recent = await fetchDays(CODES[L.id], [-1, 0, 1], now);
      const byKey = new Map(recent.map((m) => [key(m), m]));
      d.matches = d.matches.map((m) => { const u = byKey.get(key(m)); return u ? { ...m, status: u.status, score: u.score, minute: u.minute } : m; });
      recent.forEach((m) => { pushLive(L.id, m); addHist(L.id, m); });
      if (!hist.covered[L.id]) await backfillHist(L.id, CODES[L.id], now);
      await fillStats(L.id, CODES[L.id], 40);
      if (d.matches.length && !d.matches.some((m) => PENDING.includes(m.status))) roundOver = true;
    } catch (e) { console.log('::warning::' + L.id + ' risultati non aggiornati: ' + e.message); }
  }
  if (roundOver) { console.log('Giornata conclusa in almeno un campionato: aggiornamento completo.'); prev = null; result = null; live.matches = []; }
  else console.log('Aggiornamento leggero: ' + live.matches.length + ' partite in corso o finite.');
}

if (!result) {
  result = { generatedAt: iso, fullAt: iso, athletes: athleteNames, leagues: {} };
  for (const L of leagues) {
    const code = CODES[L.id];
    try {
      const all = await fetchDays(code, Array.from({ length: 23 }, (_, i) => i - 4), now);
      let standings = { total: [], home: [], away: [] };
      let idToTeam = new Map();
      try {
        const st = await espn(`https://site.api.espn.com/apis/v2/sports/soccer/${code}/standings`);
        standings.total = parseStandings(st); idToTeam = teamIds(st);
      } catch (e) { console.log('::warning::classifica ' + L.id + ': ' + e.message); }
      result.leagues[L.id] = buildLeague(L, code, all, standings, now);
      try { result.leagues[L.id].scorers = await fetchScorers(code, idToTeam, athleteNames); }
      catch (e) {
        console.log('::warning::marcatori ' + L.id + ': ' + e.message);
        result.leagues[L.id].scorers = (prevAny && prevAny.leagues && prevAny.leagues[L.id] && prevAny.leagues[L.id].scorers) || [];
      }
      all.forEach((m) => { pushLive(L.id, m); addHist(L.id, m); });
      await backfillHist(L.id, code, now);
      await fillStats(L.id, code, 200);
      const r =result.leagues[L.id];
      console.log(L.id + ': giornata ' + r.matchday + ', ' + r.matches.length + ' partite, classifica ' + standings.total.length + ' squadre, ' + r.scorers.length + ' marcatori (' + all.length + ' partite lette)');
    } catch (e) {
      console.log('::warning::' + L.id + ' non aggiornato: ' + e.message);
    }
  }
}

if (!Object.keys(result.leagues).length) { console.log('::error::Nessun campionato scaricato: non pubblico.'); process.exit(1); }
writeJson(OUT, result);
writeJson(OUT_LIVE, live);
const histOut = { v: 2, generatedAt: iso, covered: hist.covered, leagues: {} };
for (const [id, mp] of Object.entries(hist.leagues)) histOut.leagues[id] = [...mp.values()].sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc)).map((e) => { if (e.pl && Date.now() - Date.parse(e.utc) > PL_DAYS * DAY) { const { pl, pa, ...r } = e; return r; } return e; });
writeJson(OUT_HIST, histOut);
console.log('Scritti dati.json (' + Object.keys(result.leagues).length + ' campionati), live.json (' + live.matches.length + ' partite) e storico.json');
