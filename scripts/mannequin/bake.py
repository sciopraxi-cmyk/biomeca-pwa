import sys, time; sys.path.insert(0,'/root/outils/mannequin/build')
import numpy as np, zlib
from geom import vnormals, smooth
import ecorche as E
from scipy.ndimage import gaussian_filter, binary_dilation

def rasterize(P, N, uvs, tri, R):
    """texels (x, y) de l'image (y vers le bas, V inversé) → position, normale. Renvoie idx_valides (indices plats), Q, NQ"""
    Q = np.zeros((R * R, 3), np.float32); NQ = np.zeros((R * R, 3), np.float32); ok = np.zeros(R * R, bool)
    T = tri.reshape(-1, 3)
    uv = np.stack([uvs[:, 0] * R, (1 - uvs[:, 1]) * R], 1)
    for a, b, c in T:
        t = uv[[a, b, c]]
        x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
        x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, R); y1 = min(y1, R)
        if x1 <= x0 or y1 <= y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
        px = xs + 0.5; py = ys + 0.5
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12: continue
        l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d; l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d; l3 = 1 - l1 - l2
        m = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
        if not m.any(): continue
        flat = (ys[m] * R + xs[m]); A, B, C = l1[m][:, None], l2[m][:, None], l3[m][:, None]
        Q[flat] = A * P[a] + B * P[b] + C * P[c]
        nn = A * N[a] + B * N[b] + C * N[c]; NQ[flat] = nn / (np.linalg.norm(nn, axis=1, keepdims=True) + 1e-9)
        ok[flat] = True
    return np.nonzero(ok)[0], Q, NQ

def bake(Pv_cm, Nv, uvs, tri, Wd, bones, bp, Hcm, sx, R=2048, debug=False):
    t0 = time.time()
    idx, Q, NQ = rasterize(Pv_cm, Nv, uvs, tri, R)
    print('  rastérisation', R, len(idx), 'texels', round(time.time() - t0), 's', flush=True)
    Qv = Q[idx].astype(np.float64); Nq = NQ[idx].astype(np.float64)
    S = E.build_territories(Qv, Nq, Wd, bones, bp, Hcm, sx, Pv=Pv_cm)
    print('  territoires', len(S.names), round(time.time() - t0), 's', flush=True)
    own = np.full(R * R, -1, np.int16); own[idx] = S.owner
    fib = np.zeros(R * R, np.float32); fib[idx] = S.fib
    flag = np.full(R * R, -1.0, np.float32); flag[idx] = S.flag
    wq = np.zeros(R * R, np.float32); wq[idx] = S.w
    valid = np.zeros(R * R, bool); valid[idx] = True
    own = own.reshape(R, R); fib = fib.reshape(R, R); flag = flag.reshape(R, R); wq = wq.reshape(R, R); valid = valid.reshape(R, R)
    # palette
    import colorsys
    pal = np.zeros((len(S.names) + 1, 3), np.float32); pal[-1] = E.FOND; ph = np.zeros(len(S.names) + 1, np.float32)
    kinds = np.zeros(len(S.names) + 1)
    for k, nm in enumerate(S.names):
        h = (zlib.crc32(nm.split('.')[0].encode()) % 1000) / 1000.0
        ph[k] = h * 6.28
        pal[k] = colorsys.hsv_to_rgb((k * 0.618) % 1, 0.75, 0.95) if debug else E.MUSCLE_RED * (0.80 + 0.34 * h)
    for name, kind, col in (('tendon', 1.0, E.TENDON), ('fascia', 0.5, E.FASCIA), ('bone', 2.0, E.BONE)):
        pass
    # comblement des petits interstices : un muscle voisin prolonge sa couleur (< ~1,2 cm), les grandes zones restent « fond »
    from scipy.ndimage import distance_transform_edt
    hole = valid & (own < 0)
    if hole.any():
        dist, (iy, ix) = distance_transform_edt(own < 0, return_indices=True)
        near = hole & (dist <= 13)
        own = np.where(near, own[iy, ix], own); fib = np.where(near, fib[iy, ix], fib); flag = np.where(near, flag[iy, ix], flag); wq = np.where(near, 0.5, wq)
    img = pal[own]                                     # (R,R,3) ; own=-1 → dernier = FOND
    if not debug:
        for fl, col in ((1.0, E.TENDON), (0.5, E.FASCIA), (2.0, E.BONE)):
            m = flag == fl; img[m] = col
    # coutures (changement de territoire entre texels voisins)
    edge = np.zeros((R, R), bool)
    for dx, dy in ((1, 0), (0, 1)):
        a = own[:R - dy, :R - dx]; b = own[dy:, dx:]
        d = (a != b) & valid[:R - dy, :R - dx] & valid[dy:, dx:]
        edge[:R - dy, :R - dx] |= d; edge[dy:, dx:] |= d
    seam = gaussian_filter(edge.astype(np.float32), 1.1); seam = np.clip(seam * 3.2, 0, 1)
    if not debug:
        k = (flag == 0.0)
        stripe = 0.5 + 0.5 * np.sin(fib * (2 * np.pi / 0.30) + ph[np.clip(own, 0, None)]) * (0.75 + 0.25 * np.sin(fib * 1.3))
        stripe2 = 0.5 + 0.5 * np.sin(fib * (2 * np.pi / 1.7) + 1.3 * ph[np.clip(own, 0, None)])
        mod = np.where(k, 0.80 + 0.16 * stripe + 0.08 * stripe2, np.where(flag == 1.0, 0.94 + 0.06 * stripe, 1.0))
        edgedark = 0.80 + 0.20 * smooth(0.45, 0.9, wq)
        img = img * (mod * edgedark)[..., None]
    img = img * (1 - 0.40 * seam)[..., None]
    # remplissage des bords (padding) : évite les liserés aux coutures UV
    filled = valid.copy()
    for _ in range(6):
        grown = binary_dilation(filled)
        new = grown & ~filled
        if not new.any(): break
        acc = np.zeros_like(img); cnt = np.zeros((R, R), np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(filled, dy, 0), dx, 1); im = np.roll(np.roll(img, dy, 0), dx, 1)
            acc += im * sh[..., None]; cnt += sh
        img[new] = (acc / np.maximum(cnt, 1)[..., None])[new]; filled = grown
    img[~filled] = E.FOND
    # relief : ventre bombé, rainures aux coutures, ondulation des fibres → carte de normales
    from scipy.ndimage import distance_transform_edt as edt
    dist = edt(~edge)
    amp = np.where(flag == 0.0, 1.0, np.where(flag == 1.0, 0.35, np.where(flag == 2.0, 0.15, 0.6)))
    h = amp * smooth(0, 9, dist)
    if not debug:
        h = h + np.where(flag == 0.0, 0.10 * stripe, 0.0)
    h = gaussian_filter(h.astype(np.float32), 0.8)
    gy, gx = np.gradient(h)
    k = 9.0
    nx, ny = -gx * k, gy * k
    nz = np.ones_like(nx); ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
    nrm[~filled] = (0.5, 0.5, 1.0)
    return (np.clip(img, 0, 1) * 255).astype(np.uint8), (nrm * 255).astype(np.uint8), S.names, own
