import sys; sys.path.insert(0,'/root/outils/mannequin/build')
import numpy as np, zlib
from geom import *; from muscles import *
RED=np.array([0.60,0.13,0.11]);TEND=np.array([0.88,0.80,0.68]);DARK=np.array([0.26,0.06,0.06])
SEGS={('Sh','El'):('upperarm01','upperarm02'),('El','Wr'):('lowerarm01','lowerarm02'),('Hip','Kn'):('upperleg01','upperleg02'),('Kn','An'):('lowerleg01','lowerleg02')}
def make_shift(P,Wd,BONES,L):
    tab={}
    for side in ('L','R'):
        for (a,b),bn in SEGS.items():
            idx=[BONES.index(x+'.'+side) for x in bn]
            gate=Wd[:,idx].sum(1)>0.5
            V=P[gate]
            A=np.array(L[a],float);B=np.array(L[b],float)
            if side=='R': A[0]=-A[0];B[0]=-B[0]
            ab=B-A;ln=np.linalg.norm(ab);u=((V-A)@ab)/ln**2
            ts=np.linspace(0,1,13);sh=[]
            for t in ts:
                m=np.abs(u-t)*ln<1.3
                if m.sum()<5: sh.append(np.zeros(3));continue
                c=V[m].mean(0);ax=A+t*ab
                d=c-ax; d=d-(d@ab)/ln**2*ab   # composante perpendiculaire à l'axe
                sh.append(d)
            tab[(a,b,side)]=(ts,np.array(sh))
    def shift(side,a,b,t):
        if a==b:
            if a=='Sh': k=('Sh','El');tt=0.1
            elif a=='El': k=('Sh','El');tt=1.0
            elif a=='Hip': k=('Hip','Kn');tt=0.1
            else: return np.zeros(3)
            ts,sh=tab[(k[0],k[1],side)]
        elif (a,b,side) in tab:
            ts,sh=tab[(a,b,side)];tt=t
        else: return np.zeros(3)
        return np.array([np.interp(tt,ts,sh[:,i]) for i in range(3)])
    return shift
def muscle_layer(P_cm,tri,Jd,L,height_cm,detail=True,Wd=None,BONES=None):
    """P_cm (n,3) sommets de peau (cm) ; Jd dict dense non requis ici. renvoie (P_musc, colors, Wmax, names)"""
    N=vnormals(P_cm,tri)
    s=height_cm/175.0
    shift=make_shift(P_cm,Wd,BONES,L) if Wd is not None else None
    specs=build_specs(L,s,shift)
    n=len(P_cm);Wm=np.zeros(n);owner=-np.ones(n,int);tendf=np.zeros(n);redness=np.ones(n)
    jit=np.zeros(n);stripe=np.zeros(n)
    for k,m in enumerate(specs):
        if m['kind']=='tube':
            w,u=tube_w(P_cm,N,m['pts'],m['r'],m['facing'])
            ax=m['pts'][-1]-m['pts'][0];ax/=np.linalg.norm(ax)+1e-9
            Bv=np.cross(ax,np.array([0,0,1.0]));Bv/=np.linalg.norm(Bv)+1e-9
            ph=np.sin((P_cm@Bv)*5.5+k)
            t0,t1=m['tend']; tf=np.zeros(n)
            if t0>0: tf=np.maximum(tf,smooth(t0,t0-.12,u))
            if t1<1: tf=np.maximum(tf,smooth(t1,t1+.12,u))
        else:
            w=poly_w(P_cm,N,m['poly'],m['side'],m['feather'],m['nthr']);tf=np.zeros(n)
            ph=np.sin(np.abs(P_cm[:,0])*5.5+k)
        win=w>Wm+1e-6
        owner[win]=k;Wm[win]=w[win];tendf[win]=tf[win];redness[win]=m['col']
        h=(zlib.crc32(m['name'].encode())%1000)/1000.0
        jit[win]=h;stripe[win]=ph[win]
    base=RED[None,:]*(0.78+0.45*jit[:,None])*(1+0.07*stripe[:,None])
    col=base*redness[:,None]+TEND[None,:]*(1-redness[:,None])
    col=col*(1-tendf[:,None])+TEND[None,:]*tendf[:,None]
    col=DARK[None,:]*(1-smooth(0.15,0.8,Wm)[:,None])+col*smooth(0.15,0.8,Wm)[:,None]
    D0=1.3*s
    Pm=P_cm-N*(D0*(1-Wm))[:,None]
    return Pm,col,Wm,[m['name'] for m in specs],owner
