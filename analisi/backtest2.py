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
    i=SEAS.index(s)
    if i==0: return {},2.7
    prev=data[(lg,SEAS[i-1])]
    st=collections.defaultdict(lambda:[0,0,0])
    for m in prev:
        for t,gf,ga in ((m['h'],m['hg'],m['ag']),(m['a'],m['ag'],m['hg'])):
            x=st[t]; x[0]+=1; x[1]+=3 if gf>ga else (1 if gf==ga else 0); x[2]+=gf-ga
    pr={t:1700+(x[1]/x[0]-1.37)*170+x[2]/x[0]*55 for t,x in st.items() if x[0]>=10}
    return pr,sum(m['hg']+m['ag'] for m in prev)/max(1,len(prev))

BASE=dict(cg=55,cp=170,kk=9,hfa=55,cs=0,cn=0,cc=0)
def evaluate(P,seasons):
    res=[]
    for lg in LG:
        for s in seasons:
            ms=data[(lg,s)]
            if not ms: continue
            prior,T=season_prior(lg,s)
            st=collections.defaultdict(lambda:dict(g=0,pts=0,gd=0,ng=0,sot=0.0,sh=0.0,cd=0.0))
            for m in ms:
                H,A=st[m['h']],st[m['a']]
                def R(t,x):
                    p0=prior.get(t,1560)
                    if x['g']==0: return p0
                    ppg=x['pts']/x['g']
                    perf=1700+(ppg-1.37)*P['cp']+x['gd']/x['g']*P['cg']
                    if x['ng']>0:
                        perf+=x['sot']/x['ng']*P['cs']+x['sh']/x['ng']*P['cn']-x['cd']/x['ng']*P['cc']
                    w=x['g']/(x['g']+P['kk'])
                    return p0*(1-w)+perf*w
                if H['g']>=4 and A['g']>=4:
                    p=probs(R(m['h'],H),R(m['a'],A),P['hfa'],T)
                    o=0 if m['hg']>m['ag'] else (1 if m['hg']==m['ag'] else 2)
                    res.append((-math.log(max(p[o],1e-9)),sum((p[i]-(1 if i==o else 0))**2 for i in range(3)),1 if max(range(3),key=lambda i:p[i])==o else 0,s,lg,m['oh'],m['od'],m['oa'],o))
                for t,x,gf,ga,sh,sot,shopp,sotopp,yc,rc in ((m['h'],H,m['hg'],m['ag'],m['hs'],m['hst'],m['as_'],m['ast'],m['hy'],m['hr']),(m['a'],A,m['ag'],m['hg'],m['as_'],m['ast'],m['hs'],m['hst'],m['ay'],m['ar'])):
                    x['g']+=1; x['pts']+=3 if gf>ga else (1 if gf==ga else 0); x['gd']+=gf-ga
                    if None not in (sh,sot,shopp,sotopp):
                        x['ng']+=1; x['sot']+=sot-sotopp; x['sh']+=(sh-sot)-(shopp-sotopp)
                        x['cd']+=(yc or 0)+2*(rc or 0)
    return res
def ll(r): return sum(x[0] for x in r)/len(r)
def summ(r): return 'partite %d - log-loss %.4f - Brier %.4f - segni centrati %.1f%%'%(len(r),ll(r),sum(x[1] for x in r)/len(r),100*sum(x[2] for x in r)/len(r))
GRID=dict(cg=[0.5,0.75,1.5,2,3],cp=[0.6,0.8,1.25,1.5],kk=[0.5,0.7,1.4,2],hfa=[0.7,0.85,1.15,1.3])
SHOT=dict(cs=[-1,1,2,4],cn=[-1,1,2,4],cc=[3,6])
def tune(keys,start,train,rounds=2):
    P=dict(start); cur=ll(evaluate(P,train)); log=[]
    for _ in range(rounds):
        for k in keys:
            bestv,bestl=P[k],cur
            cand=[]
            if k in GRID: cand=[P[k]*f for f in GRID[k]]
            else:
                scale={'cs':0.5,'cn':0.5,'cc':1}[k]*100 if k!='cc' else 1
                cand=[P[k]+d*({'cs':3.0,'cn':1.5,'cc':3.0}[k]) for d in (-2,-1,1,2,3,4)]
            for v in cand:
                Q=dict(P); Q[k]=v; l=ll(evaluate(Q,train))
                if l<bestl-1e-6: bestv,bestl=v,l
            if bestv!=P[k]: log.append(f'{k}: {P[k]:.3g} -> {bestv:.3g} (train {bestl:.4f})'); P[k]=bestv; cur=bestl
    return P,cur,log
def paired(a,b):
    n=min(len(a),len(b)); d=[b[i][0]-a[i][0] for i in range(n)]
    mean=sum(d)/n; random.seed(1); bs=sorted(sum(d[random.randrange(n)] for _ in range(n))/n for _ in range(400))
    return mean,bs[10],bs[389]
TRAIN=['2223','2324','2425']; TEST=['2526','2627']
out.append('Parametri del modello: peso differenza reti (cg), peso punti a partita (cp), prudenza sui pochi dati (kk, peso corrente = g/(g+kk)), vantaggio casa (hfa), peso tiri in porta (cs), peso altri tiri (cn), malus ammonizioni (cc).')
out.append('Si ottimizza su 2022/23-2024/25 e si misura su 2025/26 e 2026/27, mai viste in allenamento.')
out.append('')
base_tr=evaluate(BASE,TRAIN); base_te=evaluate(BASE,TEST)
out.append('ATTUALE  allenamento: '+summ(base_tr)); out.append('ATTUALE  verifica:    '+summ(base_te)); out.append('')
P1,l1,log1=tune(['cg','cp','kk','hfa'],BASE,TRAIN)
out.append('## A) Ritocco dei parametri senza tiri'); out+= ['- '+x for x in log1]
te1=evaluate(P1,TEST); m,lo,hi=paired(base_te,te1)
out.append('parametri: '+json.dumps({k:round(v,3) for k,v in P1.items()}))
out.append('verifica: '+summ(te1)+f' - differenza rispetto all attuale {m:+.4f} (95%: {lo:+.4f} / {hi:+.4f})'); out.append('')
P2,l2,log2=tune(['cs','cn','cg','cp','kk','hfa','cc'],P1,TRAIN)
out.append('## B) Come A, in più tiri e ammonizioni'); out+= ['- '+x for x in log2]
te2=evaluate(P2,TEST); m2,lo2,hi2=paired(base_te,te2); m3,lo3,hi3=paired(te1,te2)
out.append('parametri: '+json.dumps({k:round(v,3) for k,v in P2.items()}))
out.append('verifica: '+summ(te2)+f' - differenza rispetto all attuale {m2:+.4f} (95%: {lo2:+.4f} / {hi2:+.4f})')
out.append(f'- guadagno dei soli tiri/ammonizioni sopra A: {m3:+.4f} (95%: {lo3:+.4f} / {hi3:+.4f}; negativo = i tiri aiutano)'); out.append('')
for nm,te in (('attuale',base_te),('A',te1),('B',te2)):
    out.append(f'Per campionato, verifica, {nm}: '+', '.join('%s %.4f'%(lg,ll([x for x in te if x[4]==lg])) for lg in LG))
mk=[i for i,r in enumerate(base_te) if r[5] and r[6] and r[7]]
if mk:
    L=0
    for i in mk:
        r=base_te[i]; z=1/r[5]+1/r[6]+1/r[7]; L+=-math.log([1/r[5]/z,1/r[6]/z,1/r[7]/z][r[8]])
    out.append(f'Riferimento quote bookmaker: {L/len(mk):.4f} su {len(mk)} partite')
open('analisi-backtest2.md','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
