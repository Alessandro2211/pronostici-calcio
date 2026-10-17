import fs from 'fs';
const out=[];
const get=async u=>{const r=await fetch(u);return r.ok?r.json():{__err:r.status}};
const keys=(o,d=0,p='')=>{ if(d>3||o==null||typeof o!=='object') return []; return Object.keys(o).flatMap(k=>[p+k+(Array.isArray(o[k])?'[]('+o[k].length+')':'')].concat(Array.isArray(o[k])?keys(o[k][0],d+1,p+k+'[0].'):keys(o[k],d+1,p+k+'.')));};
const day=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10).replace(/-/g,'');
let ev=null, upc=null;
for(let n=0;n<8&&!ev;n++){const sb=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates='+day(n)); ev=(sb.events||[]).find(e=>e.status.type.state==='post'); if(ev){out.push('SCOREBOARD EVENT KEYS\n'+keys(ev).join('\n')); out.push('DETAILS SAMPLE '+JSON.stringify(ev.competitions[0].details||null).slice(0,1500));}}
for(let n=1;n<8&&!upc;n++){const sb=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates='+day(-n)); upc=(sb.events||[]).find(e=>e.status.type.state==='pre');}
if(ev){const s=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event='+ev.id);
 out.push('SUMMARY TOP '+Object.keys(s).join(','));
 out.push('SUMMARY KEYS\n'+keys(s).join('\n'));
 out.push('ROSTERS SAMPLE '+JSON.stringify((s.rosters||[])[0]||null).slice(0,3000));
 out.push('KEYEVENTS SAMPLE '+JSON.stringify((s.keyEvents||[]).slice(0,4)).slice(0,2500));
 out.push('INJURIES '+JSON.stringify(s.injuries||null).slice(0,800));}
if(upc){const s=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event='+upc.id);
 out.push('UPCOMING SUMMARY TOP '+Object.keys(s).join(',')+' rosters:'+JSON.stringify(s.rosters||null).slice(0,300)+' injuries:'+JSON.stringify(s.injuries||null).slice(0,1500));}
const tm=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams/110/roster');
out.push('TEAM ROSTER KEYS '+JSON.stringify(Object.keys(tm))+' '+JSON.stringify((tm.athletes||[])[0]||null).slice(0,800));
const inj=await get('https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/injuries');
out.push('LEAGUE INJURIES '+JSON.stringify(inj).slice(0,800));
fs.writeFileSync('analisi-probe.md',out.join('\n\n'));
