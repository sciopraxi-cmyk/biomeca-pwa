import json, struct, numpy as np
class GLB:
    def __init__(s): s.bin=bytearray(); s.bv=[]; s.acc=[]; s.nodes=[]; s.meshes=[]; s.mats=[]; s.skins=[]
    def _buf(s,arr,target=None):
        arr=np.ascontiguousarray(arr)
        while len(s.bin)%4: s.bin.append(0)
        off=len(s.bin); s.bin+=arr.tobytes()
        bv={'buffer':0,'byteOffset':off,'byteLength':arr.nbytes}
        if target: bv['target']=target
        s.bv.append(bv); return len(s.bv)-1
    def accessor(s,arr,ctype,typ,target=None,minmax=False):
        arr=np.ascontiguousarray(arr)
        a={'bufferView':s._buf(arr,target),'componentType':ctype,'count':int(arr.shape[0]),'type':typ}
        if minmax: a['min']=arr.min(0).astype(float).tolist(); a['max']=arr.max(0).astype(float).tolist()
        s.acc.append(a); return len(s.acc)-1
    def material(s,**kw): s.mats.append(kw); return len(s.mats)-1
    def mesh(s,name,pos,nor,uv,idx,mat,joints=None,weights=None,extras=None,color=None):
        at={'POSITION':s.accessor(pos.astype('f4'),5126,'VEC3',34962,True),'NORMAL':s.accessor(nor.astype('f4'),5126,'VEC3',34962)}
        if color is not None: at['COLOR_0']=s.accessor(color.astype('f4'),5126,'VEC3',34962)
        if uv is not None: at['TEXCOORD_0']=s.accessor(uv.astype('f4'),5126,'VEC2',34962)
        if joints is not None:
            at['JOINTS_0']=s.accessor(joints.astype('u2'),5123,'VEC4',34962)
            at['WEIGHTS_0']=s.accessor(weights.astype('f4'),5126,'VEC4',34962)
        m={'name':name,'primitives':[{'attributes':at,'indices':s.accessor(idx.astype('u4').reshape(-1),5125,'SCALAR',34963),'material':mat}]}
        if extras: m['extras']=extras
        s.meshes.append(m); return len(s.meshes)-1
    def write(s,path,scene_nodes):
        j={'asset':{'version':'2.0','generator':'verticy-mannequin'},'scene':0,'scenes':[{'nodes':scene_nodes}],
           'nodes':s.nodes,'meshes':s.meshes,'materials':s.mats,'accessors':s.acc,'bufferViews':s.bv,
           'buffers':[{'byteLength':len(s.bin)}]}
        if s.skins: j['skins']=s.skins
        js=json.dumps(j,separators=(',',':')).encode()
        while len(js)%4: js+=b' '
        b=bytes(s.bin)
        while len(b)%4: b+=b'\0'
        out=b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(b))+struct.pack('<I',len(js))+b'JSON'+js+struct.pack('<I',len(b))+b'BIN\0'+b
        open(path,'wb').write(out)
def normals(pos,idx):
    from geom import vnormals
    return vnormals(pos,np.asarray(idx))
def normals_old(pos,idx):
    n=np.zeros_like(pos)
    f=idx.reshape(-1,3)
    fn=np.cross(pos[f[:,1]]-pos[f[:,0]],pos[f[:,2]]-pos[f[:,0]])
    for k in range(3): np.add.at(n,f[:,k],fn)
    l=np.linalg.norm(n,axis=1,keepdims=True); l[l==0]=1
    return n/l
