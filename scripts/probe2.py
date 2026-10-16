import csv, io, json, re, sys, urllib.request, datetime
UA={'User-Agent':'Mozilla/5.0 (probe)'}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=40).read().decode('utf-8-sig','replace')
out=[]
def p(*a): out.append(' '.join(str(x) for x in a))
today=datetime.date(2026,10,16)

p('# Prova 2: qualità e aggiornamento delle fonti',datetime.datetime.utcnow().isoformat()+'Z')
p('\n## football-data.co.uk 2026/27')
for code,name in [('I1','Serie A'),('E0','Premier'),('SP1','LaLiga'),('D1','Bundesliga'),('F1','Ligue 1'),('N1','Eredivisie'),('P1','Primeira')]:
    try:
        rows=list(csv.DictReader(io.StringIO(get(f'https://www.football-data.co.uk/mmz4281/2627/{code}.csv'))))
        played=[r for r in rows if r.get('FTHG') not in (None,'')]
        def d(r):
            s=r['Date']; fmt='%d/%m/%Y' if len(s)==10 else '%d/%m/%y'
            return datetime.datetime.strptime(s,fmt).date()
        last=max(d(r) for r in played) if played else None
        def fill(col): return f"{sum(1 for r in played if r.get(col) not in (None,''))}/{len(played)}"
        p(f'- {name} ({code}): righe {len(rows)}, giocate {len(played)}, ultima partita {last} (ritardo {(today-last).days if last else "?"} giorni); '
          f'tiri HS {fill("HS")}, in porta HST {fill("HST")}, corner HC {fill("HC")}, falli HF {fill("HF")}, gialli HY {fill("HY")}, rossi HR {fill("HR")}, xG HxG {fill("HxG")}, quote B365H {fill("B365H")}, quote medie AvgH {fill("AvgH")}')
        if played: p('  ultima riga:',{k:played[-1].get(k) for k in ['Date','HomeTeam','AwayTeam','FTHG','FTAG','HS','AS','HY','AY','HxG','AxG','AvgH','AvgD','AvgA']})
    except Exception as e:
        p(f'- {name} ({code}): ERRORE {e}')

p('\n## openfootball 2026-27')
for code,name in [('it.1','Serie A'),('en.1','Premier'),('es.1','LaLiga'),('de.1','Bundesliga'),('fr.1','Ligue 1'),('nl.1','Eredivisie'),('pt.1','Primeira')]:
    try:
        j=json.loads(get(f'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/{code}.json'))
        ms=j['matches']
        def has(m):
            s=m.get('score'); 
            return bool(s) and (s.get('ft') if isinstance(s,dict) else s)
        pl=[m for m in ms if has(m)]
        last=max((m['date'] for m in pl),default=None)
        p(f'- {name}: partite totali {len(ms)}, con risultato {len(pl)}, ultima con risultato {last}')
    except Exception as e:
        p(f'- {name} ({code}): ERRORE {e}')

p('\n## OpenLigaDB Bundesliga 2026')
try:
    j=json.loads(get('https://api.openligadb.de/getmatchdata/bl1/2026'))
    fin=[m for m in j if m.get('matchIsFinished')]
    last=max(fin,key=lambda m:m['matchDateTimeUTC']) if fin else None
    upd=max((m.get('lastUpdateDateTime') or '' for m in j))
    p(f'- partite {len(j)}, finite {len(fin)}, ultima finita {last["matchDateTimeUTC"] if last else None} {last["team1"]["teamName"]+" - "+last["team2"]["teamName"] if last else ""}, ultimo aggiornamento dati {upd}')
    if last:
        p('  gol (marcatore, minuto):',[(g.get('goalGetterName'),g.get('matchMinute')) for g in last.get('goals',[])][:6])
        p('  chiavi disponibili:',sorted(last.keys()))
except Exception as e:
    p('- ERRORE',e)

p('\n## Understat 2026')
try:
    html=get('https://understat.com/league/Serie_A/2026')
    names=re.findall(r'var (\w+)\s*=\s*JSON\.parse',html)
    p('- variabili dati nella pagina:',names)
    m=re.search(r"var datesData\s*=\s*JSON\.parse\('(.*?)'\)",html)
    if m:
        data=json.loads(m.group(1).encode().decode('unicode_escape'))
        done=[x for x in data if x.get('isResult')]
        p(f'- partite {len(data)}, giocate {len(done)}')
        if done: p('  esempio:',{k:done[-1][k] for k in ['datetime','h','a','goals','xG'] if k in done[-1]})
    m=re.search(r"var teamsData\s*=\s*JSON\.parse\('(.*?)'\)",html)
    if m:
        t=json.loads(m.group(1).encode().decode('unicode_escape'))
        k=next(iter(t)); p('  squadra esempio:',t[k]['title'],'chiavi storia:',sorted(t[k]['history'][0].keys()) if t[k].get('history') else None)
except Exception as e:
    p('- ERRORE',e)
open('probe-result2.md','w').write('\n'.join(out)+'\n')
print('\n'.join(out))
