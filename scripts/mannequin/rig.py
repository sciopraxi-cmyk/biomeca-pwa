import json, numpy as np
from body import D
RIG=json.load(open(D+'/rigs/standard/rig.default.json'))
WEI=json.load(open(D+'/rigs/standard/weights.default.json'))['weights']
FACE=('levator','oculi','orbicularis','oris','risorius','temporalis','tongue','special','eye','jaw')
def keep(n): return not n.startswith(FACE)
BONES=[n for n in RIG if keep(n)]
def pos(spec,v,groups_idx):
    s=spec['strategy']
    if s=='CUBE': return v[groups_idx[spec['cube_name']]].mean(0)
    if s=='VERTEX': return v[spec['vertex_index']]
    if s=='MEAN': return v[spec['vertex_indices']].mean(0)
    return np.array(spec['default_position'])
def joint_groups(groups):
    out={}
    for k,faces in groups.items():
        if k.startswith('joint'):
            out[k]=sorted({i[0] for f in faces for i in f})
    return out
def bone_positions(v,groups):
    gi=joint_groups(groups)
    return {n:(pos(RIG[n]['head'],v,gi),pos(RIG[n]['tail'],v,gi)) for n in BONES}
def parent_of(n):
    p=RIG[n]['parent']
    while p and not keep(p): p=RIG[p]['parent']
    return p
def skin_weights(nverts,maxinf=4):
    """-> joints (N,4) indices dans BONES, weights (N,4). Les os du visage → head."""
    acc=[dict() for _ in range(nverts)]
    for bone,lst in WEI.items():
        tgt=bone
        if not keep(bone): tgt='head'
        if tgt not in BONES: continue
        j=BONES.index(tgt)
        for vi,w in lst:
            if vi<nverts: acc[vi][j]=acc[vi].get(j,0)+w
    J=np.zeros((nverts,maxinf),np.uint16);W=np.zeros((nverts,maxinf),np.float32)
    for i,a in enumerate(acc):
        if not a: a={BONES.index('root'):1.0}
        top=sorted(a.items(),key=lambda x:-x[1])[:maxinf]
        s=sum(w for _,w in top)
        for k,(j,w) in enumerate(top): J[i,k]=j;W[i,k]=w/s
    return J,W
