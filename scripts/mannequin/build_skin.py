import sys; sys.path.insert(0,'/root/outils/mannequin/build')
import numpy as np
from body import *; from rig import *; from glb import *
S=0.1
def body_mesh(v,uv,groups):
    """triangles + sommets uniques (v,vt) ; renvoie pos, uv, idx, src (index de sommet d'origine)"""
    key={};pos=[];uvs=[];src=[];tri=[]
    for f in groups['body']:
        ids=[]
        for (vi,ti) in f:
            k=(vi,ti)
            if k not in key:
                key[k]=len(pos);pos.append(v[vi]);uvs.append(uv[ti]);src.append(vi)
            ids.append(key[k])
        for a in range(1,len(ids)-1): tri+= [ids[0],ids[a],ids[a+1]]
    return np.array(pos),np.array(uvs),np.array(tri,np.uint32),np.array(src)
def build(gender,out,**kw):
    v0,uv,groups=load_obj()
    mus=kw.get('muscle',.8 if gender else .45)
    v=macro(v0,gender,.5,mus,kw.get('weight',.5))
    if gender>=.5:
        for t,k in (('torso/torso-muscle-pectoral-incr',1.0),('torso/torso-muscle-dorsi-incr',.7),('torso/torso-vshape-incr',.5)): apply(v,t+'.target',k*gender)
    vnb=v.copy()
    if gender<.5: v=breast(v,gender,mus,.5,kw.get('cup',.85),.6)
    yoff=v[:13380,1].min(); v[:,1]-=yoff; vnb[:,1]-=yoff
    posnb=body_mesh(vnb,uv,groups)[0]
    pos,uvs,idx,src=body_mesh(v,uv,groups)
    J,W=skin_weights(len(v))
    bp=bone_positions(v,groups)
    g=GLB()
    mat=g.material(name='peau',pbrMetallicRoughness={'baseColorFactor':[.80,.58,.46,1],'metallicFactor':0,'roughnessFactor':.55},doubleSided=False)
    # nœuds : 0 = armature
    names=BONES
    nid={n:i+1 for i,n in enumerate(names)}
    g.nodes.append({'name':'Armature','children':[nid[n] for n in names if not parent_of(n)]})
    for n in names:
        h=bp[n][0]*S; p=parent_of(n); ph=bp[p][0]*S if p else np.zeros(3)
        nd={'name':n,'translation':(h-ph).tolist()}
        ch=[nid[m] for m in names if parent_of(m)==n]
        if ch: nd['children']=ch
        g.nodes.append(nd)
    ibm=np.zeros((len(names),4,4),'f4')
    for i,n in enumerate(names):
        m=np.eye(4); m[:3,3]=-bp[n][0]*S; ibm[i]=m.T   # colonne-major
    skin={'joints':[nid[n] for n in names],'inverseBindMatrices':g.accessor(ibm,5126,'MAT4'),'skeleton':0}
    g.skins.append(skin)
    P=pos*S
    mi=g.mesh('peau',P,normals(P,idx),uvs*[1,1],idx,mat,J[src],W[src])
    g.nodes.append({'name':'Corps','mesh':mi,'skin':0})
    top=[0,len(g.nodes)-1]
    if kw.get('muscles',True):
        from build_muscle import muscle_layer
        from geom import subdivide, vnormals
        # poids denses pour sous-division
        Jd=np.zeros((len(pos),len(BONES)),'f4')
        for k in range(4): np.add.at(Jd,(np.arange(len(pos)),J[src][:,k]),W[src][:,k])
        P2,t2,at=subdivide(pos,idx,{'w':Jd,'pnb':posnb})
        Wd=at['w']
        top4=np.argsort(-Wd,axis=1)[:,:4]
        J4=top4.astype('u2');W4=np.take_along_axis(Wd,top4,1);W4/=W4.sum(1,keepdims=True)
        L={'Sh':bp['upperarm01.L'][0],'El':bp['lowerarm01.L'][0],'Wr':bp['wrist.L'][0],'Hip':bp['upperleg01.L'][0],'Kn':bp['lowerleg01.L'][0],'An':bp['foot.L'][0],'NeckB':bp['neck01'][0],'HeadB':bp['head'][0]}
        L={k:np.array(vv)*10*0.1*10/10 for k,vv in L.items()}  # dm -> cm : *10
        L={k:np.array(bp_)*10 for k,bp_ in {'Sh':bp['upperarm01.L'][0],'El':bp['lowerarm01.L'][0],'Wr':bp['wrist.L'][0],'Hip':bp['upperleg01.L'][0],'Kn':bp['lowerleg01.L'][0],'An':bp['foot.L'][0],'NeckB':bp['neck01'][0],'HeadB':bp['head'][0]}.items()}
        height=(pos[:,1].max()-pos[:,1].min())*10
        # cm = dm*10
        Pm,col,Wm,names,owner=muscle_layer(at['pnb']*10,t2,None,L,height,Wd=Wd,BONES=BONES)
        Pm=Pm/10*S*0+Pm*0.01
        mm=g.material(name='muscles',pbrMetallicRoughness={'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.42},doubleSided=False)
        mi2=g.mesh('muscles',Pm,normals(Pm,t2),None,t2,mm,J4,W4,color=col)
        g.nodes.append({'name':'Muscles','mesh':mi2,'skin':0})
        top.append(len(g.nodes)-1)
        build.last=(names,owner)
    g.write(out,top)
    return v,pos,idx,src,bp
if __name__=='__main__':
    for n,gd in (('homme',1),('femme',0)):
        build(gd,f'/root/outils/mannequin/out_{n}.glb'); print(n,'ok')
