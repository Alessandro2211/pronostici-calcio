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
                    res.append((-math.log(max(p[o],1e-9)),sum((p[i]-(1 if i==o else 0))**2 for i in range(3)),1 if max(range(3),key=lambda i:p[i])==o else 0,s,lg,m["oh"],m["od"],m["oa"],o,p))
                for t,x,gf,ga,sh,sot,shopp,sotopp,yc,rc in ((m['h'],H,m['hg'],m['ag'],m['hs'],m['hst'],m['as_'],m['ast'],m['hy'],m['hr']),(m['a'],A,m['ag'],m['hg'],m['as_'],m['ast'],m['hs'],m['hst'],m['ay'],m['ar'])):
                    x['g']+=1; x['pts']+=3 if gf>ga else (1 if gf==ga else 0); x['gd']+=gf-ga
                    if None not in (sh,sot,shopp,sotopp):
                        x['ng']+=1; x['sot']+=sot-sotopp; x['sh']+=(sh-sot)-(shopp-sotopp)
                        x['cd']+=(yc or 0)+2*(rc or 0)
    return res

import traceback
try:
    # ---- Mescolanza modello + quote dei bookmaker ----
    PB=dict(cg=92.8,cp=170,kk=4.41,hfa=107,cs=21,cn=12,cc=24)  # modello con tiri (come in produzione, hfa unico)
    def nv(r):
        a,b,c=r[5],r[6],r[7]; s=1/a+1/b+1/c; return [1/a/s,1/b/s,1/c/s]
    def blend(rows,w,logit=False):
        tot=0;n=0
        for r in rows:
            if not(r[5] and r[6] and r[7]): continue
            pm=r[9]; pb=nv(r)
            if logit:
                z=[math.exp((1-w)*math.log(max(pm[i],1e-9))+w*math.log(pb[i])) for i in range(3)]; s=sum(z); q=[x/s for x in z]
            else: q=[(1-w)*pm[i]+w*pb[i] for i in range(3)]
            tot+=-math.log(max(q[r[8]],1e-9)); n+=1
        return tot/n,n
    TRAIN=['2223','2324','2425']; TEST=['2526','2627']
    tr=evaluate(PB,TRAIN); te=evaluate(PB,TEST)
    out.append('## Mescolanza con le quote (log-loss, più basso è meglio)')
    for nm,rows in (('allenamento 2022-25',tr),('verifica 2025/26-2026/27',te)):
        out.append(nm+': '+', '.join('w=%.1f %.4f'%(w,blend(rows,w)[0]) for w in [0,0.2,0.4,0.5,0.6,0.7,0.8,0.9,1.0])+'  (partite con quote: %d)'%blend(rows,0)[1])
        out.append(nm+' (media geometrica): '+', '.join('w=%.1f %.4f'%(w,blend(rows,w,True)[0]) for w in [0.3,0.5,0.7,0.85]))
    for lg in LG:
        rows=[x for x in te if x[4]==lg]; out.append('%s verifica: modello %.4f, quote %.4f, 50/50 %.4f, 70/30 %.4f'%(lg,blend(rows,0)[0],blend(rows,1)[0],blend(rows,0.5)[0],blend(rows,0.7)[0]))
    # Over/Under 2.5: il modello, con Poisson, contro quote
    pass

except Exception:
    out.append(traceback.format_exc())
open('analisi-blend.md','w').write('\n'.join(out))
