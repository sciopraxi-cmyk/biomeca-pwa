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
    age=kw.get('age',.5); enfant=age<.5
    mus=kw.get('muscle',.5 if enfant else (.8 if gender else .45))
    v=macro(v0,gender,age,mus,kw.get('weight',.5))
    import ecorche as _E
    _E.ENFANT=None
    if gender>=.5 and not enfant:
        for t,k in (('torso/torso-muscle-pectoral-incr',1.0),('torso/torso-muscle-dorsi-incr',.7),('torso/torso-vshape-incr',.5)): apply(v,t+'.target',k*gender)
    vnb=v.copy()
    if gender<.5 and not enfant: v=breast(v,gender,mus,.5,kw.get('cup',.85),.6)
    yoff=v[:13380,1].min(); v[:,1]-=yoff; vnb[:,1]-=yoff
    posnb=body_mesh(vnb,uv,groups)[0]
    pos,uvs,idx,src=body_mesh(v,uv,groups)
    J,W=skin_weights(len(v))
    bp=bone_positions(v,groups)
    if enfant:
        # repères du corps de l'enfant → repères du corps adulte de même sexe (écorché : polygones définis sur l'adulte)
        def reperes(vv,bpp):
            f=lambda n:float(bpp[n][0][1])*10
            bb=np.array(sorted({i[0] for ff in groups['body'] for i in ff}))
            top=float(vv[bb,1].max())*10
            hb=top-f('head')
            band=bb[(vv[bb,1]*10>f('head')+0.35*hb)]
            hy=f('upperleg01.L'); Hh=top-0.0
            hs=bb[(np.abs(vv[bb,1]*10-hy)<2.5)&(np.abs(vv[bb,0]*10)<0.14*Hh)]
            return [0.0,f('foot.L'),f('lowerleg01.L'),f('upperleg01.L'),f('spine03'),f('upperarm01.L'),f('neck01'),f('head'),top],float(np.abs(vv[band,0]).max())*10,float(np.abs(vv[hs,0]).max())*10
        va=macro(v0,gender,.5,.5,.5); va[:,1]-=va[:13380,1].min()
        bpa=bone_positions(va,groups)
        cy,chw,chp=reperes(v,bp); ay,ahw,ahp=reperes(va,bpa)
        # échelle du bassin : largeur de hanche de l'enfant / de l'adulte, rapportée à l'échelle d'épaule déjà appliquée (sx)
        sxe=float(bp['upperarm01.L'][0][0])*10/18.8
        _E.ENFANT=((np.array(cy),np.array(ay),cy[6],chp/ahp*1.0),chw/ahw)
        print('  bassin',round(chp/ahp,2),'épaule',round(sxe,2),flush=True)
        print('  repères enfant',[round(x) for x in cy],'→',[round(x) for x in ay],'tête',round(chw/ahw,2),flush=True)
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
    from build_morph import build_morphs
    Jd0=np.zeros((len(pos),len(BONES)),'f4')
    for k in range(4): np.add.at(Jd0,(np.arange(len(pos)),J[src][:,k]),W[src][:,k])
    Hm=(P[:,1].max()-P[:,1].min())
    mph=build_morphs(P,idx,Jd0,BONES,bp,Hm)
    mi=g.mesh('peau',P,normals(P,idx),uvs*[1,1],idx,mat,J[src],W[src],morphs=mph)
    g.nodes.append({'name':'Corps','mesh':mi,'skin':0})
    top=[0,len(g.nodes)-1]
    if kw.get('muscles',True):
        from geom import subdivide, vnormals
        from bake import bake
        import os, io
        from PIL import Image
        Jd=np.zeros((len(pos),len(BONES)),'f4')
        for k in range(4): np.add.at(Jd,(np.arange(len(pos)),J[src][:,k]),W[src][:,k])
        P2,t2,at=subdivide(pos,idx,{'w':Jd,'pnb':posnb,'uv':uvs})
        Wd=at['w']
        top4=np.argsort(-Wd,axis=1)[:,:4]
        J4=top4.astype('u2');W4=np.take_along_axis(Wd,top4,1);W4/=W4.sum(1,keepdims=True)
        height=(pos[:,1].max()-pos[:,1].min())*10
        sx=bp['upperarm01.L'][0][0]*10/18.8
        pn_cm=posnb*10
        Nv=vnormals(pn_cm,idx)
        R=int(os.environ.get('BAKE_RES','2048'))
        cache='/root/outils/mannequin/tex_%s_%d%s.jpg'%(out.split('_')[-1].split('.')[0],R,'_dbg' if os.environ.get('ECORCHE_DEBUG') else '')
        img,nrm,names,_=bake(pn_cm,Nv,uvs,idx,Jd,BONES,bp,height,sx,R=R,debug=bool(os.environ.get('ECORCHE_DEBUG')))
        bio=io.BytesIO(); Image.fromarray(img).save(bio,'JPEG',quality=88); jpg=bio.getvalue(); open(cache,'wb').write(jpg)
        print('  texture',len(jpg)//1024,'Ko',flush=True)
        bio2=io.BytesIO(); Image.fromarray(nrm).save(bio2,'JPEG',quality=90); jn=bio2.getvalue()
        print('  normales',len(jn)//1024,'Ko',flush=True)
        tex=g.texture(jpg); texn=g.texture(jn)
        N2=vnormals(at['pnb']*10,t2)
        from relief import vertex_relief
        import ecorche as E
        P2cm=at['pnb']*10
        SV=E.build_territories(P2cm,N2,Wd,BONES,bp,height,sx)
        depth,_=vertex_relief(SV.owner.astype(int),SV.flag,SV.names,P2cm,t2)
        Pm=(P2cm+N2*depth[:,None])*0.01
        uv2=at['uv']*np.array([1,-1])+np.array([0,1])
        mm=g.material(name='muscles',pbrMetallicRoughness={'baseColorTexture':{'index':tex},'metallicFactor':0,'roughnessFactor':.95},normalTexture={'index':texn,'scale':0.8},doubleSided=False)
        mph2=build_morphs(Pm,t2,Wd,BONES,bp,Hm)
        mi2=g.mesh('muscles',Pm,normals(Pm,t2),uv2,t2,mm,J4,W4,morphs=mph2)
        g.nodes.append({'name':'Muscles','mesh':mi2,'skin':0})
        top.append(len(g.nodes)-1)
    g.write(out,top)
    return v,pos,idx,src,bp
AGES={'garcon':{'II':0.099,'III':0.1536,'IV':0.2462},'fille':{'II':0.1095,'III':0.1714,'IV':0.3102}}
if __name__=='__main__':
    import os
    if os.environ.get('ENFANTS'):
        for per in os.environ['ENFANTS'].split(','):
            for n,gd in (('garcon',1),('fille',0)):
                if os.environ.get('SEXES') and n not in os.environ['SEXES'].split(','): continue
                kw={'age':AGES[n][per]}
                if os.environ.get('SANS_MUSCLES'): kw['muscles']=False
                build(gd,f'/root/outils/mannequin/out_{n}_p{per}.glb',**kw); print(n,per,'ok',flush=True)
        raise SystemExit
    for n,gd in (('homme',1),('femme',0)):
        if os.environ.get('SEXES') and n not in os.environ['SEXES'].split(','): continue
        build(gd,f'/root/outils/mannequin/out_{n}.glb'); print(n,'ok')
