import fs from 'fs';
const out=[];
const t=async(name,u,n=700)=>{try{const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0'},redirect:'follow'});const b=await r.text();out.push(`## ${name}\n${u}\nHTTP ${r.status} len ${b.length}\n${b.slice(0,n)}\n`);return b;}catch(e){out.push(`## ${name}\n${u}\nERR ${e.message}\n`);return '';}};
for(const c of ['I1','E0','SP1','D1','F1','N1','P1']){const b=await t('FD '+c,`https://www.football-data.co.uk/mmz4281/2627/${c}.csv`,0);const L=b.trim().split('\n');out.push(`${c}: righe ${L.length-1}; ultima: ${(L[L.length-1]||'').slice(0,90)}\nintestazione: ${(L[0]||'').slice(0,400)}\n`);}
await t('FD fixtures','https://www.football-data.co.uk/fixtures.csv',900);
await t('Understat','https://understat.com/league/Serie_A/2026',300);
await t('FBref','https://fbref.com/en/comps/11/Serie-A-Stats',200);
await t('openfootball','https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/it.1.json',300);
await t('TheSportsDB','https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4332&s=2026-2027',300);
fs.writeFileSync('analisi-probe.md',out.join('\n'));
