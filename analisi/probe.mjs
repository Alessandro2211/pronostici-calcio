import fs from 'fs';
const out=[]; const get=async u=>{try{const r=await fetch(u);return r.ok?await r.json():{__err:r.status}}catch(e){return {__err:e.message}}};
const ymd=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10).replace(/-/g,'');
for(const code of ['uefa.champions','uefa.europa']){
  out.push('# '+code);
  const evs=[];
  for(let n=-14;n<=21;n++){const sb=await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${ymd(n)}`); (sb.events||[]).forEach(e=>evs.push(e));}
  out.push('eventi '+evs.length);
  evs.slice(0,3).forEach(e=>out.push(JSON.stringify({d:e.date,name:e.name,st:e.status.type.name,season:e.season,slug:e.season&&e.season.slug,odds:(e.competitions[0].odds||[]).slice(0,1),keys:Object.keys(e.competitions[0])})).slice(0,900));
  const byDate={}; evs.forEach(e=>{const d=e.date.slice(0,10); byDate[d]=(byDate[d]||0)+1;}); out.push('per data '+JSON.stringify(byDate));
  out.push('upcoming '+evs.filter(e=>e.status.type.state==='pre').slice(0,40).map(e=>e.date.slice(0,10)+' '+e.name+' ['+((e.season||{}).slug||'')+'/'+(e.competitions[0].type&&e.competitions[0].type.abbreviation||'')+']').join('\n'));
  const st=await get(`https://site.api.espn.com/apis/v2/sports/soccer/${code}/standings`);
  out.push('standings keys '+JSON.stringify(Object.keys(st))+' children '+(st.children||[]).length+' first '+JSON.stringify(((st.children||[])[0]||{}).name)+' entries '+(((st.children||[])[0]||{}).standings||{entries:[]}).entries.length);
  const e0=(((st.children||[])[0]||{}).standings||{entries:[]}).entries[0]; if(e0) out.push('entry '+JSON.stringify({t:e0.team&&e0.team.displayName,stats:(e0.stats||[]).map(s=>s.name+'='+s.value)}).slice(0,900));
  const tm=await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/teams`);
  const ts=((tm.sports||[{leagues:[{teams:[]}]}])[0].leagues[0].teams||[]).map(t=>t.team.displayName+' ('+(t.team.location||'')+')');
  out.push('teams '+ts.length+': '+ts.join(', '));
}
fs.writeFileSync('analisi-probe.md',out.join('\n'));
