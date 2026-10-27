import numpy as np
def subdivide(P,tri,attrs):
    """subdivision linéaire (milieux d'arêtes). attrs: dict name->(n,k) interpolés par moyenne."""
    e={};newP=[];newT=[]
    n=len(P); A={k:[v] for k,v in attrs.items()}
    pts=[P];extra={k:[] for k in attrs}
    mids=[]
    def mid(a,b):
        k=(a,b) if a<b else (b,a)
        if k not in e:
            e[k]=n+len(mids); mids.append(k)
        return e[k]
    T=tri.reshape(-1,3)
    for a,b,c in T:
        ab=mid(a,b);bc=mid(b,c);ca=mid(c,a)
        newT+= [a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca]
    m=np.array(mids)
    P2=np.vstack([P,(P[m[:,0]]+P[m[:,1]])/2])
    out={k:np.vstack([v,(v[m[:,0]]+v[m[:,1]])/2]) for k,v in attrs.items()}
    return P2,np.array(newT,np.uint32),out
def weld(P):
    q=np.round(P*1e4).astype(np.int64)
    _,inv=np.unique(q,axis=0,return_inverse=True);return inv.reshape(-1)
def vnormals(P,tri):
    inv=weld(P)
    f=inv[tri.reshape(-1,3)];n=np.zeros((inv.max()+1,3))
    fn=np.cross(P[tri.reshape(-1,3)[:,1]]-P[tri.reshape(-1,3)[:,0]],P[tri.reshape(-1,3)[:,2]]-P[tri.reshape(-1,3)[:,0]])
    for k in range(3): np.add.at(n,f[:,k],fn)
    l=np.linalg.norm(n,axis=1,keepdims=True);l[l==0]=1
    return (n/l)[inv]
def vnormals_old(P,tri):
    f=tri.reshape(-1,3);n=np.zeros_like(P)
    fn=np.cross(P[f[:,1]]-P[f[:,0]],P[f[:,2]]-P[f[:,0]])
    for k in range(3): np.add.at(n,f[:,k],fn)
    l=np.linalg.norm(n,axis=1,keepdims=True);l[l==0]=1
    return n/l
def smooth(e0,e1,x):
    t=np.clip((x-e0)/(e1-e0),0,1);return t*t*(3-2*t)
def smooth_mesh(P,tri,it=2,lam=.5,fixed=None):
    f=tri.reshape(-1,3)
    E=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);E=np.vstack([E,E[:,::-1]])
    deg=np.bincount(E[:,0],minlength=len(P)).astype(float);deg[deg==0]=1
    for _ in range(it):
        S=np.zeros_like(P)
        for k in range(3): S[:,k]=np.bincount(E[:,0],weights=P[E[:,1],k],minlength=len(P))
        S/=deg[:,None];P=P+lam*(S-P)
    return P
