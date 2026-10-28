"""Déformations locales (blend shapes) : n'agissent que sur la zone concernée, le reste du corps ne bouge pas."""
import numpy as np
from geom import smooth, vnormals
ARM=('upperarm','lowerarm','wrist','finger','metacarpal')
def bump(y,y0,y1):
    u=np.clip((y-y0)/(y1-y0),0,1); return np.sin(np.pi*u)**1.2
def tent(t,tk):
    f=np.where(t<tk,t/tk,(1-t)/(1-tk)); f=np.clip(f,0,1)
    return f*f*(3-2*f)*0+ (np.sin(f*np.pi/2)**1.0)   # pointe lissée
def morphs(P,Wd,bones,bp,H):
    """P (n,3) mètres, bind pose ; Wd (n,nb) poids denses ; bp dict os→(tête,queue) en dm."""
    s=H/1.75; n=len(P); N=vnormals(P,np.arange(n).reshape(-1,3)*0+0) if False else None
    return None
def build_morphs(P,tri,Wd,bones,bp,H):
    s=H/1.75; y=P[:,1]; x=P[:,0]
    N=vnormals(P,tri)
    back=smooth(0.2,-0.5,N[:,2]); front=1-back
    idx=lambda pref,side=None:[i for i,b in enumerate(bones) if b.startswith(pref) and (side is None or b.endswith('.'+side))]
    arm=np.zeros(len(P))
    for pr in ARM: arm+=Wd[:,idx(pr)].sum(1)
    arm=np.clip(arm*1.5,0,1)
    out={}
    D=np.zeros_like(P); D[:,2]=-0.030*s*bump(y,1.20*s,1.47*s)*(0.12+0.88*back)*(1-arm); out['cyphose']=D
    D=np.zeros_like(P); legs=sum(Wd[:,idx(p)].sum(1) for p in ('upperleg','lowerleg'))
    D[:,2]=0.050*s*bump(y,0.95*s,1.22*s)*(0.20+0.80*back)*(1-arm)*(1-np.clip(legs,0,1)); out['lordose']=D
    D=np.zeros_like(P); D[:,2]=-0.040*s*bump(y,0.78*s,1.04*s)*back*smooth(0.30,0.05,np.abs(x)/s); out['fessiers']=D
    for side,sg in (('L',1),('R',-1)):
        hip=bp['upperleg01.'+side][0]*0.1; kn=bp['lowerleg01.'+side][0]*0.1; an=bp['foot.'+side][0]*0.1
        t=np.clip((y-an[1])/(hip[1]-an[1]),0,1); tk=(kn[1]-an[1])/(hip[1]-an[1])
        f=tent(t,tk)
        ml=np.zeros(len(P))
        for pr in ('upperleg01','upperleg02','lowerleg01','lowerleg02'): ml+=Wd[:,idx(pr,side)].sum(1)
        ml=np.clip(ml,0,1)*(sg*x>0)
        L=np.linalg.norm(hip-kn)
        D=np.zeros_like(P); D[:,2]=L*np.sin(np.radians(15))*f*ml; out['genou_flex_'+side]=D          # 30° => +1
        D=np.zeros_like(P); D[:,0]=-sg*L*np.sin(np.radians(7.5))*f*ml; out['genou_valgus_'+side]=D   # 15° valgus => +1 (genou vers l'intérieur)
    return out
