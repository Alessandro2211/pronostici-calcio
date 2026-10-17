// Seconda fonte, gratuita e senza registrazione: football-data.co.uk (file CSV).
// Per ogni partita finita: tiri, tiri in porta, falli, corner, cartellini e; per le prossime: quote medie dei bookmaker.
// Scrive site/data/fd.json con i nomi delle squadre già abbinati a quelli della pagina. Uso: node scripts/fd.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const NameMatch = createRequire(import.meta.url)(path.join(root, 'site', 'names.js'));
const OUT = path.join(root, 'site', 'data', 'fd.json');
const DIV = { I1: 'serie-a', E0: 'premier', SP1: 'liga', D1: 'bundesliga', F1: 'ligue1', N1: 'eredivisie', P1: 'primeira' };
const BASE = 'https://www.football-data.co.uk/';
const MIN_AGE = 20 * 60 * 1000; // i file cambiano poche volte al giorno: non li rileggo a ogni giro

function siteData() {
  const html = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
  const a = html.indexOf('function T('), b = html.indexOf('/* ---------- MODELLO');
  return new Function(html.slice(a, b) + ';return LEAGUES;')();
}
const names = Object.fromEntries(siteData().map((L) => [L.id, L.teams.map((t) => t[0])]));

function csv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); const o = {}; head.forEach((h, i) => { o[h] = c[i]; }); return o; });
}
const num = (x) => { const v = parseFloat(x); return Number.isNaN(v) ? null : v; };
const dt = (s) => { const m = /^(\d\d)\/(\d\d)\/(\d{2,4})$/.exec(s || ''); if (!m) return null; return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2] + '-' + m[1]; };

const now = new Date();
const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const season = String(y).slice(2) + String(y + 1).slice(2);

if (process.env.GITHUB_REPOSITORY) {
  try {
    const [o, n] = process.env.GITHUB_REPOSITORY.split('/');
    const r = await fetch(`https://${o.toLowerCase()}.github.io/${n}/data/fd.json?t=${Date.now()}`);
    if (r.ok) { const j = await r.json(); if (process.env.FORCE_FULL !== '1' && j.season === season && Date.now() - Date.parse(j.generatedAt) < MIN_AGE) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(j)); console.log('football-data: copia recente, non riscarico'); process.exit(0); } }
  } catch { /* si riscarica */ }
}

const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (pronostici-calcio)' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
const out = { generatedAt: now.toISOString(), season, bad: [], m: [], o: [] };
const bad = new Set();
const map = (lg, n) => { const x = NameMatch.matchTeam({ name: n, shortName: n }, names[lg]); if (!x) bad.add(lg + ':' + n); return x; };
let ok = 0;
for (const [code, lg] of Object.entries(DIV)) {
  try {
    const rows = csv(await get(`${BASE}mmz4281/${season}/${code}.csv`));
    for (const r of rows) {
      const d = dt(r.Date), h = r.HomeTeam && map(lg, r.HomeTeam), a = r.AwayTeam && map(lg, r.AwayTeam);
      if (!d || !h || !a || r.FTHG === '' || r.FTHG == null) continue;
      const s = ['HS', 'AS', 'HST', 'AST', 'HC', 'AC', 'HF', 'AF', 'HY', 'AY', 'HR', 'AR'].map((k) => num(r[k]));
      const o1 = [num(r.AvgH) ?? num(r.B365H), num(r.AvgD) ?? num(r.B365D), num(r.AvgA) ?? num(r.B365A)];
      const ou = [num(r['Avg>2.5']) ?? num(r['B365>2.5']), num(r['Avg<2.5']) ?? num(r['B365<2.5'])];
      out.m.push({ lg, d, h, a, hg: +r.FTHG, ag: +r.FTAG, s: s.some((v) => v == null) ? null : s,
        ...(o1.every((v) => v != null && v > 1) ? { o: o1 } : {}), ...(ou.every((v) => v != null && v > 1) ? { ou } : {}) });
    }
    ok++;
  } catch (e) { console.log('::warning::football-data ' + code + ': ' + e.message); }
}
try {
  const rows = csv(await get(BASE + 'fixtures.csv'));
  for (const r of rows) {
    const lg = DIV[r.Div]; if (!lg) continue;
    const d = dt(r.Date), h = map(lg, r.HomeTeam || ''), a = map(lg, r.AwayTeam || '');
    const o1 = [num(r.AvgH) ?? num(r.B365H), num(r.AvgD) ?? num(r.B365D), num(r.AvgA) ?? num(r.B365A)];
    if (!d || !h || !a || o1.some((v) => v == null || v <= 1)) continue;
    const ou = [num(r['Avg>2.5']) ?? num(r['B365>2.5']), num(r['Avg<2.5']) ?? num(r['B365<2.5'])];
    out.o.push({ lg, d, t: r.Time || null, h, a, o: o1, ou: ou.some((v) => v == null || v <= 1) ? null : ou });
  }
} catch (e) { console.log('::warning::football-data fixtures: ' + e.message); }
out.bad = [...bad].sort();
if (!ok) { console.log('::warning::football-data non raggiungibile: nessun file scritto'); process.exit(0); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`football-data: ${out.m.length} partite, ${out.o.length} quote, ${out.bad.length} nomi non abbinati: ${out.bad.join(', ')}`);
