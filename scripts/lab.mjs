// Laboratorio (solo diagnostica): prova se tiri, xG e media gol migliorano il modello sulle partite 2026/27 già giocate
// e controlla quali statistiche per partita dà ESPN. Scrive lab-result.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve('.');
const NameMatch = require(path.join(root, 'site', 'names.js'));
const html = fs.readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
const lib = new Function(html.slice(html.indexOf('function T('), html.indexOf('/* ---------- UI')) + ';return {LEAGUES,predict};')();
const FD = { 'serie-a': 'I1', premier: 'E0', liga: 'SP1', bundesliga: 'D1', ligue1: 'F1', eredivisie: 'N1', primeira: 'P1' };
const out = [];
const p = (...a) => out.push(a.join(' '));

async function text(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (lab)' } });
  if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
  return (await r.text()).replace(/^﻿/, '');
}
function parseCsv(t) {
  const lines = t.split(/\r?\n/).filter(Boolean), head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); const o = {}; head.forEach((h, i) => { o[h] = c[i]; }); return o; });
}
const num = (v) => (v === undefined || v === '' || isNaN(+v) ? null : +v);
function when(r) {
  const [d, m, y] = r.Date.split('/'); const yy = y.length === 2 ? '20' + y : y;
  return `${yy}-${m}-${d} ${r.Time || '00:00'}`;
}

// ---------- 1) backtest dei modelli ----------
const data = {};
for (const [id, code] of Object.entries(FD)) {
  const L = lib.LEAGUES.find((l) => l.id === id), names = L.teams.map((t) => t[0]);
  const rows = parseCsv(await text(`https://www.football-data.co.uk/mmz4281/2627/${code}.csv`)).filter((r) => num(r.FTHG) !== null);
  rows.sort((a, b) => when(a).localeCompare(when(b)));
  const ms = [];
  for (const r of rows) {
    const h = NameMatch.matchTeam({ name: r.HomeTeam, shortName: r.HomeTeam }, names), a = NameMatch.matchTeam({ name: r.AwayTeam, shortName: r.AwayTeam }, names);
    if (!h || !a) { p('- non abbinata:', id, r.HomeTeam, '-', r.AwayTeam); continue; }
    ms.push({ h, a, hg: +r.FTHG, ag: +r.FTAG, xh: num(r.HxG), xa: num(r.AxG), sh: num(r.HS), sa: num(r.AS), sth: num(r.HST), sta: num(r.AST),
      yh: num(r.HY), ya: num(r.AY), rh: num(r.HR), ra: num(r.AR), oh: num(r.AvgH), od: num(r.AvgD), oa: num(r.AvgA), oo: num(r['Avg>2.5']), ou: num(r['Avg<2.5']) });
  }
  data[id] = { L, ms };
}

const VARIANTS = {
  attuale: { gd: (s) => s.gf - s.ga },
  'xG (peso come gol)': { gd: (s) => s.xf - s.xa },
  'xG (peso x1,5)': { gd: (s) => (s.xf - s.xa) * 1.5 },
  'metà gol metà xG': { gd: (s) => 0.5 * (s.gf - s.ga) + 0.5 * (s.xf - s.xa) },
  'tiri in porta (0,30 gol l’uno)': { gd: (s) => 0.3 * (s.stf - s.sta) },
  'metà gol metà tiri in porta': { gd: (s) => 0.5 * (s.gf - s.ga) + 0.5 * 0.3 * (s.stf - s.sta) },
  'attuale + media gol del campionato': { gd: (s) => s.gf - s.ga, tEff: true },
  'metà gol metà xG + media gol': { gd: (s) => 0.5 * (s.gf - s.ga) + 0.5 * (s.xf - s.xa), tEff: true },
  'attuale + 30% quote': { gd: (s) => s.gf - s.ga, w: 0.3 },
  'attuale + 50% quote': { gd: (s) => s.gf - s.ga, w: 0.5 },
  'attuale + 70% quote': { gd: (s) => s.gf - s.ga, w: 0.7 },
  'xG x1,5 + 50% quote': { gd: (s) => (s.xf - s.xa) * 1.5, w: 0.5 },
  'metà gol metà xG + cartellini': { gd: (s) => 0.5 * (s.gf - s.ga) + 0.5 * (s.xf - s.xa) - 0.05 * (s.yc + 3 * s.rc - s.ycOpp - 3 * s.rcOpp) },
};
const blank = () => ({ pts: 0, g: 0, gf: 0, ga: 0, xf: 0, xa: 0, stf: 0, sta: 0, yc: 0, rc: 0, ycOpp: 0, rcOpp: 0 });
const ll = (pr, k) => -Math.log(Math.max(1e-9, pr[k]));
const brier = (pr, k) => [0, 1, 2].reduce((s, i) => s + (pr[i] - (i === k ? 1 : 0)) ** 2, 0);

function evaluate(name, spec, minG) {
  let n = 0, sLL = 0, sBr = 0, hit = 0, nOU = 0, sOU = 0;
  for (const { L, ms } of Object.values(data)) {
    const st = {}; L.teams.forEach((t) => { st[t[0]] = blank(); });
    let goals = 0, played = 0;
    for (const m of ms) {
      const H = st[m.h], A = st[m.a];
      const ready = H.g >= minG && A.g >= minG;
      if (ready) {
        const T = spec.tEff && played ? (L.T * 30 + (goals / played) * played) / (30 + played) : L.T;
        const rows = L.teams.map((t) => { const s = st[t[0]]; return [t[0], t[1], s.g ? s.pts : null, s.g, s.g ? spec.gd(s) : null, null, s.g ? s.gf : null, null, null]; });
        const pr = lib.predict({ T, hfa: L.hfa, teams: rows, scorers: {}, ratings: null }, m.h, m.a);
        if (!(m.oh && m.od && m.oa)) { H.g++; A.g++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg; H.xf += m.xh ?? m.hg; H.xa += m.xa ?? m.ag; A.xf += m.xa ?? m.ag; A.xa += m.xh ?? m.hg; H.stf += m.sth ?? 0; H.sta += m.sta ?? 0; A.stf += m.sta ?? 0; A.sta += m.sth ?? 0; H.yc += m.yh ?? 0; H.rc += m.rh ?? 0; A.yc += m.ya ?? 0; A.rc += m.ra ?? 0; H.ycOpp += m.ya ?? 0; H.rcOpp += m.rh ?? 0; A.ycOpp += m.yh ?? 0; A.rcOpp += m.rh ?? 0; if (m.hg > m.ag) H.pts += 3; else if (m.hg < m.ag) A.pts += 3; else { H.pts++; A.pts++; } goals += m.hg + m.ag; played++; continue; }
        let probs = [pr.p1, pr.px, pr.p2], ov = pr.ou[1].over;
        if (spec.w) {
          const inv = [1 / m.oh, 1 / m.od, 1 / m.oa], sm = inv.reduce((x, y) => x + y, 0);
          probs = probs.map((x, i) => (1 - spec.w) * x + spec.w * inv[i] / sm);
          if (m.oo && m.ou) ov = (1 - spec.w) * ov + spec.w * ((1 / m.oo) / (1 / m.oo + 1 / m.ou));
        }
        const k = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
        n++; sLL += ll(probs, k); sBr += brier(probs, k);
        if (probs.indexOf(Math.max(...probs)) === k) hit++;
        const isO = m.hg + m.ag > 2 ? 1 : 0;
        nOU++; sOU += -Math.log(Math.max(1e-9, isO ? ov : 1 - ov));
      }
      H.g++; A.g++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
      H.xf += m.xh ?? m.hg; H.xa += m.xa ?? m.ag; A.xf += m.xa ?? m.ag; A.xa += m.xh ?? m.hg;
      H.stf += m.sth ?? 0; H.sta += m.sta ?? 0; A.stf += m.sta ?? 0; A.sta += m.sth ?? 0;
      H.yc += m.yh ?? 0; H.rc += m.rh ?? 0; A.yc += m.ya ?? 0; A.rc += m.ra ?? 0;
      H.ycOpp += m.ya ?? 0; H.rcOpp += m.ra ?? 0; A.ycOpp += m.yh ?? 0; A.rcOpp += m.rh ?? 0;
      if (m.hg > m.ag) H.pts += 3; else if (m.hg < m.ag) A.pts += 3; else { H.pts++; A.pts++; }
      goals += m.hg + m.ag; played++;
    }
  }
  return { n, ll: sLL / n, brier: sBr / n, acc: hit / n, llOU: sOU / nOU };
}
function market(minG) {
  let n = 0, sLL = 0, sBr = 0, hit = 0, nOU = 0, sOU = 0, nn = 0, nl = 0, nbr = 0, nh = 0;
  for (const { L, ms } of Object.values(data)) {
    const st = {}; L.teams.forEach((t) => { st[t[0]] = 0; });
    for (const m of ms) {
      if (st[m.h] >= minG && st[m.a] >= minG && m.oh && m.od && m.oa) {
        const inv = [1 / m.oh, 1 / m.od, 1 / m.oa], s = inv.reduce((x, y) => x + y, 0), pr = inv.map((x) => x / s);
        const k = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
        n++; sLL += ll(pr, k); sBr += brier(pr, k); if (pr.indexOf(Math.max(...pr)) === k) hit++;
        if (m.oo && m.ou) { const po = (1 / m.oo) / (1 / m.oo + 1 / m.ou), isO = m.hg + m.ag > 2; nOU++; sOU += -Math.log(isO ? po : 1 - po); }
      }
      st[m.h]++; st[m.a]++;
    }
  }
  return { n, ll: sLL / n, brier: sBr / n, acc: hit / n, llOU: sOU / nOU };
}
function fixed(minG) { // frequenze generali (1/X/2 su tutte le partite), valutate sulle stesse partite dei modelli
  const c = [0, 0, 0]; let tot = 0;
  for (const { ms } of Object.values(data)) for (const m of ms) { c[m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2]++; tot++; }
  const pr = c.map((x) => x / tot); let n = 0, s = 0, b = 0, hit = 0;
  for (const { L, ms } of Object.values(data)) {
    const st = {}; L.teams.forEach((t) => { st[t[0]] = 0; });
    for (const m of ms) {
      if (st[m.h] >= minG && st[m.a] >= minG) { const k = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2; n++; s += ll(pr, k); b += brier(pr, k); if (pr.indexOf(Math.max(...pr)) === k) hit++; }
      st[m.h]++; st[m.a]++;
    }
  }
  return { n, ll: s / n, brier: b / n, acc: hit / n, llOU: NaN, pr };
}
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(4) : '-');
p('# Laboratorio modello', new Date().toISOString());
p('Partite per campionato:', Object.entries(data).map(([k, v]) => k + ' ' + v.ms.length).join(', '));
for (const minG of [3, 0]) {
  p(`\n## Valutazione su partite in cui entrambe le squadre hanno già giocato almeno ${minG} gare`);
  p('| modello | partite | log-loss 1X2 (più basso è meglio) | Brier | segno azzeccato | log-loss Over 2,5 |');
  p('|---|---|---|---|---|---|');
  const base = evaluate('', VARIANTS.attuale, minG);
  for (const [name, spec] of Object.entries(VARIANTS)) {
    const r = evaluate(name, spec, minG);
    p(`| ${name} | ${r.n} | ${f3(r.ll)} | ${f3(r.brier)} | ${(r.acc * 100).toFixed(1)}% | ${f3(r.llOU)} |`);
  }
  const mk = market(minG);
  p(`| quote dei bookmaker (riferimento) | ${mk.n} | ${f3(mk.ll)} | ${f3(mk.brier)} | ${(mk.acc * 100).toFixed(1)}% | ${f3(mk.llOU)} |`);
  const fx = fixed(minG);
  p(`| frequenze generali, nessun modello (riferimento) | ${fx.n} | ${f3(fx.ll)} | ${f3(fx.brier)} | ${(fx.acc * 100).toFixed(1)}% | - |`);
}

// ---------- 2) statistiche per partita di ESPN ----------
p('\n## ESPN: statistiche per partita');
try {
  const code = 'ita.1';
  const sb = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=20261012`)).json();
  const ev = (sb.events || []).find((e) => e.status && e.status.type && e.status.type.state === 'post');
  p('- partita di prova:', ev ? ev.name + ' id ' + ev.id : 'nessuna finita il 12/10');
  if (ev) {
    const s = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/summary?event=${ev.id}`)).json();
    p('- chiavi del riepilogo:', Object.keys(s).join(', '));
    const teams = (s.boxscore && s.boxscore.teams) || [];
    teams.forEach((t) => p('- ' + (t.team && t.team.displayName) + ':', (t.statistics || []).map((x) => `${x.name}=${x.displayValue}`).join('; ')));
    p('- eventi chiave:', ((s.keyEvents || []).length), 'esempio:', JSON.stringify((s.keyEvents || [])[0] || {}).slice(0, 300));
    p('- rosters:', (s.rosters || []).length, '· ammonizioni nei roster:', JSON.stringify(((s.rosters || [])[0] || {}).roster ? ((s.rosters[0].roster[0] || {}).stats || []).slice(0, 12).map((x) => x.name + '=' + x.displayValue) : []));
  }
} catch (e) { p('- ERRORE', e.message); }
p('\n## ESPN: quote nelle partite in programma');
for (const [id, code] of Object.entries({ 'serie-a': 'ita.1', premier: 'eng.1', liga: 'esp.1', bundesliga: 'ger.1', ligue1: 'fra.1', eredivisie: 'ned.1', primeira: 'por.1' })) {
  try {
    let evs = [];
    for (const d of ['20261017', '20261018', '20261019']) { const sb = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${d}`)).json(); evs = evs.concat(sb.events || []); }
    const withOdds = evs.filter((e) => e.competitions && e.competitions[0] && e.competitions[0].odds && e.competitions[0].odds.length);
    p(`- ${id}: partite 17-19/10 ${evs.length}, con quote ${withOdds.length}`);
    if (withOdds[0]) p('  esempio', withOdds[0].name, JSON.stringify(withOdds[0].competitions[0].odds[0]).slice(0, 900));
  } catch (e) { p('- ' + id + ' ERRORE', e.message); }
}
fs.writeFileSync('lab-result.md', out.join('\n') + '\n');
console.log(out.join('\n'));
