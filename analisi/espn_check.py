import json, urllib.request, datetime
UA={'User-Agent':'Mozilla/5.0 (analisi)','Accept':'application/json'}
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read())
L={'ita.1':'Serie A','eng.1':'Premier','esp.1':'LaLiga','ger.1':'Bundesliga','fra.1':'Ligue 1','ned.1':'Eredivisie','por.1':'Primeira'}
out=['# ESPN: statistiche per partita finita ('+datetime.datetime.utcnow().isoformat()+'Z)']
now=datetime.datetime.utcnow()
for code,name in L.items():
    evs=[]
    for k in range(1,9):
        d=(now-datetime.timedelta(days=k)).strftime('%Y%m%d')
        try:
            sb=get(f'https://site.api.espn.com/apis/site/v2/sports/soccer/{code}/scoreboard?dates={d}')
        except Exception as e:
            continue
        for ev in sb.get('events',[]):
            if ev.get('status',{}).get('type',{}).get('state')=='post': evs.append(ev)
    out.append(f'\n## {name}: partite finite negli ultimi 8 giorni: {len(evs)}')
    for ev in evs[:4]:
        try:
            js=get(f'https://site.api.espn.com/apis/site/v2/sports/soccer/{code}/summary?event={ev["id"]}')
            teams=js.get('boxscore',{}).get('teams',[])
            names=[[s.get('name') for s in t.get('statistics',[])] for t in teams]
            out.append(f'- {ev["name"]} (id {ev["id"]}): chiavi riepilogo {sorted(js.keys())}')
            for t in teams:
                out.append('  - '+t.get('team',{}).get('displayName','?')+': '+', '.join(f"{s.get('name')}={s.get('displayValue')}" for s in t.get('statistics',[])))
            out.append(f'  keyEvents: {len(js.get("keyEvents",[]))}, commentary: {len(js.get("commentary",[]))}, rosters: {len(js.get("rosters",[]))}')
        except Exception as e:
            out.append(f'- {ev.get("name")}: ERRORE {e}')
open('analisi-espn.md','w').write('\n'.join(out)+'\n'); print('\n'.join(out)[:3000])
