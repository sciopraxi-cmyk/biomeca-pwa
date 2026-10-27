"""Relief géométrique de l'écorché : ventres musculaires bombés, sillons entre muscles, tendons et fascias aplatis.
La profondeur de chaque sommet vient de sa distance (en cm, le long de la surface) à la frontière de son territoire."""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from geom import weld, smooth

BIG = ('pectoral', 'droit_femoral', 'vaste', 'fessier', 'deltoide', 'grand_dorsal', 'gastroc', 'biceps', 'triceps',
       'trapeze', 'erecteur', 'biceps_femoral', 'semi_', 'soleaire', 'droit_abdo', 'sartorius')

def vertex_relief(owner, flag, names, P_cm, tri, amp_cm=0.62, lc_cm=2.2):
    n = len(P_cm)
    inv = weld(P_cm); m = inv.max() + 1
    f = tri.reshape(-1, 3)
    E = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    a, b = inv[E[:, 0]], inv[E[:, 1]]
    keep = a != b
    a, b = a[keep], b[keep]
    d = np.linalg.norm(P_cm[E[keep, 0]] - P_cm[E[keep, 1]], axis=1)
    G = coo_matrix((np.r_[d, d], (np.r_[a, b], np.r_[b, a])), shape=(m, m)).tocsr()
    own_w = np.full(m, -9, np.int32); own_w[inv] = owner
    diff = own_w[a] != own_w[b]
    src = np.unique(np.r_[a[diff], b[diff]])
    dist = dijkstra(G, indices=src, min_only=True)[inv] if len(src) else np.full(n, 99.0)
    prof = smooth(0.0, lc_cm, dist)
    scale = np.ones(n)
    for k, nm in enumerate(names):
        if nm.startswith(BIG): scale[owner == k] = 1.35
    depth = np.full(n, -0.95)                                    # fond (couche profonde sombre)
    mus = flag == 0.0
    depth[mus] = (-0.12 - amp_cm * (1 - prof[mus])) * 1.0 + 0.18 * (scale[mus] - 1) * prof[mus]
    depth[flag == 1.0] = -0.30                                   # tendons : plats, légèrement en retrait
    depth[flag == 0.5] = -0.38                                   # fascias
    depth[flag == 2.0] = -0.05                                   # os affleurant (crête tibiale, rotule, sternum...)
    # lissage léger pour éviter les marches
    Eb = np.unique(np.stack([a, b], 1), axis=0)
    deg = np.bincount(np.r_[Eb[:, 0], Eb[:, 1]], minlength=m).astype(float); deg[deg == 0] = 1
    dw = np.zeros(m); dw[inv] = depth
    for _ in range(2):
        s = np.bincount(Eb[:, 0], weights=dw[Eb[:, 1]], minlength=m) + np.bincount(Eb[:, 1], weights=dw[Eb[:, 0]], minlength=m)
        dw = 0.5 * dw + 0.5 * s / deg
    return dw[inv], dist
