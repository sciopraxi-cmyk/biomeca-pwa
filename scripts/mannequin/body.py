"""Corps de base : maillage CC0 MakeHuman (données MPFB, aucun code GPL) + cibles macro."""
import numpy as np, gzip, os, json
D='/root/outils/mannequin/mpfb2-2.0.18/src/mpfb/data'
def load_obj():
    v=[];groups={};cur=None;uv=[];fuv={}
    faces=[]
    for l in open(D+'/3dobjs/base.obj'):
        if l.startswith('v '): v.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): uv.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('g '): cur=l.split()[1]; groups[cur]=[]
        elif l.startswith('f '):
            f=[tuple(int(i or 0)-1 for i in p.split('/')) for p in l.split()[1:]]
            groups[cur].append(f)
    return np.array(v),np.array(uv),groups
def load_target(path):
    out={}
    op=gzip.open if path.endswith('.gz') else open
    with op(path,'rt') as fh:
        for l in fh:
            p=l.split()
            if len(p)==4 and not l.startswith('#'):
                out[int(p[0])]=[float(p[1]),float(p[2]),float(p[3])]
    return out
def apply(v,tpath,w):
    if w==0: return
    p=D+'/targets/'+tpath
    if not os.path.exists(p): p+='.gz'
    if not os.path.exists(p): raise FileNotFoundError(p)
    for i,d in load_target(p).items(): v[i]+=np.array(d)*w
def breast(v,gender,muscle,weight,cup=0.5,firm=0.5):
    g=1-gender
    m={'minmuscle':max(0,(.5-muscle)*2),'maxmuscle':max(0,(muscle-.5)*2)}; m['averagemuscle']=1-m['minmuscle']-m['maxmuscle']
    w={'minweight':max(0,(.5-weight)*2),'maxweight':max(0,(weight-.5)*2)}; w['averageweight']=1-w['minweight']-w['maxweight']
    c={'mincup':max(0,(.5-cup)*2),'maxcup':max(0,(cup-.5)*2)}; c['averagecup']=1-c['mincup']-c['maxcup']
    f={'minfirmness':max(0,(.5-firm)*2),'maxfirmness':max(0,(firm-.5)*2)}; f['averagefirmness']=1-f['minfirmness']-f['maxfirmness']
    for mk,mv in m.items():
     for wk,wv in w.items():
      for ck,cv in c.items():
       for fk,fv in f.items():
        if ck=='averagecup' and fk=='averagefirmness': continue
        k=g*mv*wv*cv*fv
        if k>1e-6: apply(v,f'breast/female-young-{mk}-{wk}-{ck}-{fk}.target',k)
    return v
def age_macro(annees):
    """âge en années → valeur macro MPFB (1 an = 0 ; 11 ans = 0,1875 ; 25 ans = 0,5)."""
    if annees<=1: return 0.0
    if annees<=11: return 0.1875*(annees-1)/10
    if annees<=25: return 0.1875+(0.5-0.1875)*(annees-11)/14
    return 0.5
def macro(v0,gender,age,muscle,weight,race=(0,0,1),height=0.5):
    """gender 0=femme 1=homme ; age 0.5=25 ans ; muscle/weight 0.5=moyen ; race=(african,asian,caucasian)"""
    v=v0.copy()
    g={'female':1-gender,'male':gender}
    if age>=0.5: a={'young':1-(age-.5)*2,'old':(age-.5)*2}
    elif age>=0.1875: t=(age-0.1875)/(0.5-0.1875); a={'child':1-t,'young':t}
    else: t=age/0.1875; a={'baby':1-t,'child':t}
    m={'minmuscle':max(0,(.5-muscle)*2),'maxmuscle':max(0,(muscle-.5)*2)}; m['averagemuscle']=1-m['minmuscle']-m['maxmuscle']
    w={'minweight':max(0,(.5-weight)*2),'maxweight':max(0,(weight-.5)*2)}; w['averageweight']=1-w['minweight']-w['maxweight']
    for gk,gv in g.items():
      for ak,av in a.items():
        for mk,mv in m.items():
          for wk,wv in w.items():
            k=gv*av*mv*wv
            if k>1e-6: apply(v,f'macrodetails/universal-{gk}-{ak}-{mk}-{wk}.target',k)
        for rk,rv in zip(('african','asian','caucasian'),race):
            k=gv*av*rv
            if k>1e-6: apply(v,f'macrodetails/{rk}-{gk}-{ak}.target',k)
    # taille
    hv={'minheight':max(0,(.5-height)*2),'maxheight':max(0,(height-.5)*2)}
    for gk,gv in g.items():
      for mk,mv in m.items():
        for wk,wv in w.items():
          for hk,hh in hv.items():
            k=gv*mv*wv*hh
            if k>1e-6: apply(v,f'macrodetails/height/{gk}-young-{mk}-{wk}-{hk}.target',k)
    return v
if __name__=='__main__':
    v0,uv,groups=load_obj()
    print(len(v0),{k:len(f) for k,f in groups.items() if len(f)>0 and not k.startswith('joint')})
    print('bbox',v0.min(0),v0.max(0))
    for name,g in (('homme',1),('femme',0)):
        v=macro(v0,g,0.5,0.62 if g else 0.45,0.5)
        b=np.array(sorted({i[0] for f in groups['body'] for i in f}))
        print(name,v[b].min(0),v[b].max(0))
