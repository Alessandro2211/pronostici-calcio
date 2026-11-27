import fs from 'fs';
let out='';
try{
  const j=await (await fetch('https://alessandro2211.github.io/pronostici-calcio/data/dati.json?t='+Date.now())).json();
  out+='generatedAt '+j.generatedAt+'\n';
  for(const k of ['champions','europa']){const L=j.leagues[k]; out+=k+': '+(L?('giornata '+L.matchday+', partite '+L.matches.length+', classifica '+L.standings.total.length+', marcatori '+L.scorers.length+'\n'+L.matches.slice(0,18).map(m=>m.utc.slice(0,16)+' '+m.home.name+' - '+m.away.name).join('\n')):'MANCA')+'\n';}
  const s=await (await fetch('https://alessandro2211.github.io/pronostici-calcio/data/storico.json?t='+Date.now())).json();
  out+='storico: '+Object.entries(s.leagues).map(([k,v])=>k+' '+v.length+' (g '+v.filter(e=>e.g).length+', st '+v.filter(e=>e.st).length+')').join(', ')+'\n';
}catch(e){out+='ERRORE '+e.stack}
fs.writeFileSync('analisi-probe.md',out);
