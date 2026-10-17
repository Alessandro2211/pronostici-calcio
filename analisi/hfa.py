import csv, io, math, urllib.request
UA={'User-Agent':'Mozilla/5.0 (analisi)'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read().decode('utf-8-sig','replace')
out=['# Vantaggio casa per campionato (stagioni 2023/24-2026/27)','']
k=0.00115
for lg,name in [('I1','Serie A'),('E0','Premier'),('SP1','LaLiga'),('D1','Bundesliga'),('F1','Ligue 1'),('N1','Eredivisie'),('P1','Primeira')]:
    hg=ag=n=0
    for s in ['2324','2425','2526','2627']:
        try: rows=list(csv.DictReader(io.StringIO(get(f'https://www.football-data.co.uk/mmz4281/{s}/{lg}.csv'))))
        except Exception: continue
        for r in rows:
            if r.get('FTHG') and r.get('FTAG'):
                hg+=int(r['FTHG']); ag+=int(r['FTAG']); n+=1
    T=(hg+ag)/n; dl=(hg-ag)/n
    d=math.asinh(dl/T)/k
    out.append(f'- {name}: partite {n}, gol casa {hg/n:.2f}, gol trasferta {ag/n:.2f}, totale {T:.2f}, vantaggio casa in punti Elo (hfa) {d:.0f}')
open('analisi-hfa.md','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
