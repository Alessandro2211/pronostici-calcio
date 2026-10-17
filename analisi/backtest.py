import csv, io, math, random, urllib.request, collections, datetime, json
UA={'User-Agent':'Mozilla/5.0 (analisi)'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read().decode('utf-8-sig','replace')
LG=['I1','E0','SP1','D1','F1','N1','P1']
SEAS=['2223','2324','2425','2526','2627']
out=['# Prova a ritroso: cosa migliora i pronostici','']
def num(x):
    try: return float(x)
    except: return None
def load(season,lg):
    try: rows=list(csv.DictReader(io.StringIO(get(f'https://www.football-data.co.uk/mmz4281/{season}/{lg}.csv'))))
    except Exception: return []
    res=[]
    for r in rows:
        if not r.get('FTHG') or not r.get('HomeTeam'): continue
        s=r['Date']
        try: d=datetime.datetime.strptime(s,'%d/%m/%Y' if len(s)==10 else '%d/%m/%y').date()
        except: continue
        g=lambda k: num(r.get(k))
        res.append(dict(d=d,h=r['HomeTeam'],a=r['AwayTeam'],hg=int(r['FTHG']),ag=int(r['FTAG']),
            hs=g('HS'),as_=g('AS'),hst=g('HST'),ast=g('AST'),hc=g('HC'),ac=g('AC'),hy=g('HY'),ay=g('AY'),hr=g('HR'),ar=g('AR'),
            hxg=g('HxG'),axg=g('AxG'),oh=g('AvgH') or g('B365H'),od=g('AvgD') or g('B365D'),oa=g('AvgA') or g('B365A')))
    res.sort(key=lambda m:m['d']); return res
data={}
for lg in LG:
    for s in SEAS:
        data[(lg,s)]=load(s,lg)
out.append('Partite lette: '+', '.join(f'{lg} {s}:{len(data[(lg,s)])}' for lg in LG for s in SEAS if data[(lg,s)]))
def fill(col):
    ms=[m for v in data.values() for m in v]
    return sum(1 for m in ms if m[col] is not None)/max(1,len(ms))
out.append('Copertura: tiri %.0f%%, tiri in porta %.0f%%, cartellini gialli %.0f%%, xG %.0f%%'%(100*fill('hs'),100*fill('hst'),100*fill('hy'),100*fill('hxg')))
out.append('')

def pois(l,k):
    p=math.exp(-l)
    for i in range(1,k+1): p*=l/i
    return p
def probs(R_h,R_a,hfa,T):
    d=R_h-R_a+hfa; k=0.00115
    lh=T/2*math.exp(k*d); la=T/2*math.exp(-k*d); rho=-0.08
    N=9; p1=px=p2=tot=0.0; g=[[0]*N for _ in range(N)]
    for i in range(N):
        for j in range(N):
            p=pois(lh,i)*pois(la,j); tau=1
            if i==0 and j==0: tau=1-lh*la*rho
            elif i==0 and j==1: tau=1+lh*rho
            elif i==1 and j==0: tau=1+la*rho
            elif i==1 and j==1: tau=1-rho
            g[i][j]=p*tau; tot+=p*tau
    for i in range(N):
        for j in range(N):
            q=g[i][j]/tot
            if i>j: p1+=q
            elif i==j: px+=q
            else: p2+=q
    return p1,px,p2

# xG proxy da tiri: coefficienti fissi tipici (tiro in porta ~0.30 gol, altro tiro ~0.04 gol)
def xgp(s,sot):
    if s is None or sot is None: return None
    return 0.30*sot+0.04*max(0,s-sot)

def season_prior(lg,s):
    # forza dell'anno prima: punti a partita e differenza reti a partita (squadre assenti: neopromosse)
    i=SEAS.index(s)
    if i==0: return {},2.7
    prev=data[(lg,SEAS[i-1])]
    st=collections.defaultdict(lambda:[0,0,0,0])
    for m in prev:
        for t,gf,ga in ((m['h'],m['hg'],m['ag']),(m['a'],m['ag'],m['hg'])):
            x=st[t]; x[0]+=1; x[1]+=3 if gf>ga else (1 if gf==ga else 0); x[2]+=gf-ga
    pr={t:1700+(x[1]/x[0]-1.37)*170+x[2]/x[0]*55 for t,x in st.items() if x[0]>=10}
    T=sum(m['hg']+m['ag'] for m in prev)/max(1,len(prev))
    return pr,T

def evaluate(variant,coef,seasons,cardc=0.0,mix=0.5):
    # restituisce lista di (logloss, brier, ok, p1,px,p2, esito)
    res=[]
    for lg in LG:
        for s in seasons:
            ms=data[(lg,s)]
            if not ms: continue
            prior,T=season_prior(lg,s)
            st=collections.defaultdict(lambda:dict(g=0,pts=0,gd=0,xd=0.0,xn=0,cd=0.0,cn=0))
            for m in ms:
                H,A=st[m['h']],st[m['a']]
                def R(t,x):
                    p0=prior.get(t,1560)
                    if x['g']==0: return p0
                    ppg=x['pts']/x['g']
                    if variant=='gol': dd=x['gd']/x['g']
                    elif variant=='xg':
                        dd=(x['xd']/x['xn']) if x['xn']>=max(1,0.7*x['g']) else x['gd']/x['g']
                    elif variant=='tiri':
                        dd=(x['xd']/x['xn']) if x['xn']>=max(1,0.7*x['g']) else x['gd']/x['g']
                    elif variant=='mix':
                        a=x['gd']/x['g']; b=(x['xd']/x['xn']) if x['xn']>=max(1,0.7*x['g']) else a
                        dd=(1-mix)*a+mix*b
                    perf=1700+(ppg-1.37)*170+dd*coef
                    if cardc and x['cn']>0: perf-=cardc*(x['cd']/x['cn'])
                    w=x['g']/(x['g']+9)
                    return p0*(1-w)+perf*w
                if H['g']>=4 and A['g']>=4:
                    p1,px,p2=probs(R(m['h'],H),R(m['a'],A),55,T)
                    o=0 if m['hg']>m['ag'] else (1 if m['hg']==m['ag'] else 2)
                    p=(p1,px,p2)
                    res.append((-math.log(max(p[o],1e-9)),sum((p[i]-(1 if i==o else 0))**2 for i in range(3)),1 if max(range(3),key=lambda i:p[i])==o else 0,s,lg,m['oh'],m['od'],m['oa'],o))
                # aggiorna
                for t,x,gf,ga,sh,sot,shopp,sotopp,xgf,xga,yc,rc in ((m['h'],H,m['hg'],m['ag'],m['hs'],m['hst'],m['as_'],m['ast'],m['hxg'],m['axg'],m['hy'],m['hr']),
                                                                    (m['a'],A,m['ag'],m['hg'],m['as_'],m['ast'],m['hs'],m['hst'],m['axg'],m['hxg'],m['ay'],m['ar'])):
                    x['g']+=1; x['pts']+=3 if gf>ga else (1 if gf==ga else 0); x['gd']+=gf-ga
                    if variant=='xg' and xgf is not None and xga is not None:
                        x['xd']+=xgf-xga; x['xn']+=1
                    elif variant in('tiri','mix') :
                        if variant=='mix' and xgf is not None and xga is not None: x['xd']+=xgf-xga; x['xn']+=1
                        elif variant=='tiri':
                            a=xgp(sh,sot); b=xgp(shopp,sotopp)
                            if a is not None and b is not None: x['xd']+=a-b; x['xn']+=1
                    if yc is not None: x['cd']+=yc+2*(rc or 0); x['cn']+=1
    return res
def summ(res):
    n=len(res)
    return dict(n=n,ll=sum(r[0] for r in res)/n,br=sum(r[1] for r in res)/n,acc=sum(r[2] for r in res)/n)
def fmt(sm): return 'partite %d · log-loss %.4f · Brier %.4f · segni centrati %.1f%%'%(sm['n'],sm['ll'],sm['br'],100*sm['acc'])

TRAIN=['2223','2324','2425']; TEST=['2526','2627']
out.append('## Scelta del peso sulle stagioni 2022/23-2024/25, verifica fuori campione su 2025/26 e 2026/27')
out.append('(log-loss più basso = previsioni migliori; il modello attuale usa differenza reti con peso 55)')
best={}
cands=[('gol',55),('gol',40),('gol',80),('xg',55),('xg',80),('xg',110),('tiri',55),('tiri',80),('tiri',110),('mix',80)]
for var,c in cands:
    tr=evaluate(var,c,TRAIN)
    if not tr: continue
    sm=summ(tr); out.append(f'- allenamento · {var} peso {c}: {fmt(sm)}')
    if var not in best or sm['ll']<best[var][1]: best[var]=(c,sm['ll'])
out.append('')
base_te=evaluate('gol',55,TEST)
out.append('### Fuori campione (stagioni 2025/26 e 2026/27)')
out.append('- MODELLO ATTUALE (gol, peso 55): '+fmt(summ(base_te)))
def paired(a,b):
    # differenza di log-loss per partita (b - a), con intervallo bootstrap
    n=min(len(a),len(b)); d=[b[i][0]-a[i][0] for i in range(n)]
    mean=sum(d)/n; random.seed(1); bs=[]
    for _ in range(400):
        s=sum(d[random.randrange(n)] for _ in range(n))/n; bs.append(s)
    bs.sort(); return mean,bs[10],bs[389]
for var,(c,_) in best.items():
    te=evaluate(var,c,TEST)
    if not te: continue
    m,lo,hi=paired(base_te,te) if len(te)==len(base_te) else (float('nan'),)*3
    out.append(f'- {var} (peso scelto {c}): {fmt(summ(te))}' + (f' · differenza di log-loss rispetto all\'attuale {m:+.4f} (intervallo 95%: {lo:+.4f} / {hi:+.4f}; negativo = meglio)' if m==m else ' · (partite diverse dal confronto: copertura dati incompleta)'))
# cartellini
out.append('')
out.append('### Ammonizioni (gialli + 2 x rossi, per partita) come malus sulla forza')
for cc in (0,3,6,10):
    te=evaluate('gol',55,TEST,cardc=cc)
    m,lo,hi=paired(base_te,te) if len(te)==len(base_te) else (float('nan'),)*3
    out.append(f'- malus {cc}: {fmt(summ(te))}' + (f' · diff {m:+.4f} ({lo:+.4f} / {hi:+.4f})' if m==m else ''))
# mercato come riferimento
mk=[r for r in base_te if r[5] and r[6] and r[7]]
if mk:
    ll=0
    for r in mk:
        z=1/r[5]+1/r[6]+1/r[7]; p=[1/r[5]/z,1/r[6]/z,1/r[7]/z]; ll+=-math.log(p[r[8]])
    out.append('')
    out.append(f'Riferimento: quote medie dei bookmaker, {len(mk)} partite, log-loss {ll/len(mk):.4f} (il modello attuale su queste stesse partite: {sum(r[0] for r in base_te if r[5] and r[6] and r[7])/len(mk):.4f})')
open('analisi-backtest.md','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
