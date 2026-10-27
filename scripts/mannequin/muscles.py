"""Couche musculaire écorchée, générée à partir du maillage de peau (aucun modèle tiers).
Chaque muscle = une région pondérée sur la peau (tube autour d'un axe ou polygone sur le tronc)."""
import numpy as np
from geom import smooth

def seg_closest(P, a, b):
    ab = b - a; L2 = (ab ** 2).sum() + 1e-9
    u = np.clip(((P - a) @ ab) / L2, 0, 1)
    return u, a + u[:, None] * ab

def tube_w(P, N, pts, radii, facing=-0.1):
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); cum = np.r_[0, np.cumsum(seg)]; tot = cum[-1]
    best_d = np.full(len(P), 1e9); best_u = np.zeros(len(P)); best_r = np.ones(len(P)); best_c = np.zeros_like(P)
    for i in range(len(pts) - 1):
        u, c = seg_closest(P, pts[i], pts[i + 1])
        d = np.linalg.norm(P - c, axis=1)
        m = d < best_d
        best_d[m] = d[m]; best_u[m] = ((cum[i] + u * seg[i]) / tot)[m]
        best_r[m] = (radii[i] + u * (radii[i + 1] - radii[i]))[m]; best_c[m] = c[m]
    rel = P - best_c; rl = np.linalg.norm(rel, axis=1, keepdims=True) + 1e-9
    f = smooth(facing, facing + 0.5, (N * rel / rl).sum(1))
    w = smooth(1.0, 0.45, best_d / np.maximum(best_r, 1e-3)) * f
    return w, best_u

def poly_w(P, N, poly, side, feather=1.2, nthr=0.0):
    x = np.abs(P[:, 0]); y = P[:, 1]
    poly = np.array(poly); k = len(poly)
    inside = np.zeros(len(P), bool); dist = np.full(len(P), 1e9)
    for i in range(k):
        a = poly[i]; b = poly[(i + 1) % k]
        cond = ((a[1] > y) != (b[1] > y)) & (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] + 1e-12) + a[0])
        inside ^= cond
        ab = b - a; ap = np.stack([x - a[0], y - a[1]], 1)
        t = np.clip((ap @ ab) / ((ab ** 2).sum() + 1e-9), 0, 1)
        d = np.linalg.norm(ap - t[:, None] * ab, axis=1); dist = np.minimum(dist, d)
    sd = np.where(inside, dist, -dist)
    nz = N[:, 2] if side == 'f' else -N[:, 2]
    return smooth(0, feather, sd) * smooth(nthr, nthr + 0.5, nz)

def build_specs(L, s, shift=None):
    def lm(name, side):
        p = np.array(L[name], float).copy()
        if side == 'R': p[0] = -p[0]
        return p
    def pt(side, a, b, t, d=(0, 0, 0)):
        sign = 1 if side == 'L' else -1
        base = lm(a, side) * (1 - t) + lm(b, side) * t
        if shift is not None: base = base + shift(side, a, b, t)
        return base + s * np.array([d[0] * sign, d[1], d[2]])
    M = []
    def tube(name, side, defs, radii, tend=(0.0, 1.0), col=1.0, facing=-0.1):
        pts = np.array([pt(side, *dd) for dd in defs]); r = np.array(radii) * s
        M.append(dict(kind='tube', name=name + '.' + side, pts=pts, r=r, tend=tend, col=col, facing=facing))
    def poly(name, p, side, feather=1.2, nthr=0.0, col=1.0):
        M.append(dict(kind='poly', name=name, poly=[(x * s, y * s) for x, y in p], side=side, feather=feather * s, nthr=nthr, col=col))
    for sd in ('L', 'R'):
        tube('deltoide_ant', sd, [('Sh', 'Sh', 0, (-1.5, 2.5, 3.0)), ('Sh', 'Sh', 0, (3.0, -6.0, 2.8))], [2.3, 3.0])
        tube('deltoide_lat', sd, [('Sh', 'Sh', 0, (1.5, 3.5, 0.0)), ('Sh', 'Sh', 0, (4.5, -6.5, 0.0))], [2.6, 3.4])
        tube('deltoide_post', sd, [('Sh', 'Sh', 0, (-1.0, 3.0, -3.2)), ('Sh', 'Sh', 0, (3.5, -6.0, -3.0))], [2.3, 3.0])
        tube('biceps', sd, [('Sh', 'El', .18, (-.5, 0, 2.6)), ('Sh', 'El', .55, (-.3, 0, 3.2)), ('El', 'El', 0, (-.3, 1.0, 1.8))], [1.0, 2.9, 1.0], tend=(0.12, 0.88))
        tube('brachial', sd, [('Sh', 'El', .55, (1.8, 0, 2.2)), ('El', 'El', 0, (1.0, 0.5, 1.8))], [1.5, 1.2])
        tube('triceps_longue', sd, [('Sh', 'El', .1, (-0.5, 0, -2.4)), ('Sh', 'El', .6, (-0.8, 0, -3.3)), ('El', 'El', 0, (0, 2.5, -2.4))], [1.5, 2.8, 1.2], tend=(0.0, 0.9))
        tube('triceps_lat', sd, [('Sh', 'El', .22, (2.8, 0, -1.6)), ('Sh', 'El', .6, (2.4, 0, -2.2)), ('El', 'El', 0, (0.5, 2.5, -2.4))], [1.3, 2.3, 1.1])
        tube('rond_grand', sd, [('Sh', 'Sh', 0, (-3.5, -1.0, -3.2)), ('Sh', 'Sh', 0, (2.0, -5.5, -2.8))], [2.0, 1.7])
        tube('brachio_radial', sd, [('El', 'El', 0, (1.5, 1.0, 2.2)), ('El', 'Wr', .35, (1.8, 0, 2.6)), ('El', 'Wr', .85, (1.4, 0, 1.4))], [1.7, 1.6, 0.8], tend=(0, .62))
        tube('flechisseurs', sd, [('El', 'El', 0, (-1.5, 1.2, 2.2)), ('El', 'Wr', .4, (-0.8, 0, 2.8)), ('El', 'Wr', .9, (-0.5, 0, 1.8))], [2.0, 2.2, 1.0], tend=(0, .65))
        tube('extenseurs', sd, [('El', 'El', 0, (1.0, 0.5, -2.2)), ('El', 'Wr', .4, (0.6, 0, -2.6)), ('El', 'Wr', .9, (0.4, 0, -1.6))], [2.0, 2.0, 0.9], tend=(0, .66))
        tube('sterno_cleido', sd, [('NeckB', 'NeckB', 0, (1.5, -7.0, 5.5)), ('NeckB', 'NeckB', 0, (3.5, 0, 4.0)), ('HeadB', 'HeadB', 0, (5.0, -2.0, -1.5))], [1.4, 1.5, 1.0], tend=(.08, .9), facing=-0.2)
        tube('masseter', sd, [('HeadB', 'HeadB', 0, (6.5, 4.0, 3.4)), ('HeadB', 'HeadB', 0, (5.5, -1.2, 5.0))], [1.8, 1.4], facing=-0.2)
        tube('temporal', sd, [('HeadB', 'HeadB', 0, (5.5, 11.0, 2.5)), ('HeadB', 'HeadB', 0, (6.5, 5.5, 3.0))], [3.6, 2.2], facing=-0.2)
        tube('droit_femoral', sd, [('Hip', 'Kn', .08, (0.6, 0, 6.0)), ('Hip', 'Kn', .5, (0.3, 0, 7.5)), ('Hip', 'Kn', .9, (0.2, 0, 5.0))], [1.4, 3.4, 1.1], tend=(.05, .86))
        tube('vaste_lat', sd, [('Hip', 'Kn', .22, (5.8, 0, 3.0)), ('Hip', 'Kn', .6, (5.5, 0, 3.8)), ('Hip', 'Kn', .93, (2.6, 0, 4.4))], [2.6, 4.2, 1.6], tend=(0, .9))
        tube('vaste_med', sd, [('Hip', 'Kn', .45, (-3.2, 0, 4.8)), ('Hip', 'Kn', .85, (-2.9, 0, 4.4)), ('Hip', 'Kn', 1.0, (-2.0, -1, 3.6))], [1.8, 3.3, 1.8], tend=(0, .95))
        tube('sartorius', sd, [('Hip', 'Hip', 0, (5.8, 4.0, 6.0)), ('Hip', 'Kn', .35, (0.5, 0, 6.2)), ('Hip', 'Kn', .75, (-3.5, 0, 3.8)), ('Kn', 'Kn', 0, (-4.2, 2.5, 0.5))], [1.0, 1.3, 1.2, 0.8], tend=(.05, .95))
        tube('adducteurs', sd, [('Hip', 'Kn', .06, (-2.2, 0, 3.5)), ('Hip', 'Kn', .4, (-5.0, 0, 1.6)), ('Hip', 'Kn', .75, (-4.2, 0, 0.5))], [2.0, 3.6, 2.4], tend=(0, .95))
        tube('tfl_bandelette', sd, [('Hip', 'Hip', 0, (7.5, 3.0, 2.0)), ('Hip', 'Kn', .5, (7.8, 0, 0.8)), ('Kn', 'Kn', 0, (5.2, 2.0, 1.8))], [2.0, 1.6, 1.3], tend=(.25, 1.0), col=0.45)
        tube('biceps_femoral', sd, [('Hip', 'Kn', .2, (2.8, 0, -5.0)), ('Hip', 'Kn', .6, (2.8, 0, -5.8)), ('Hip', 'Kn', 1.0, (2.4, 0, -3.5))], [2.2, 3.0, 1.0], tend=(0, .92))
        tube('semi_tendineux', sd, [('Hip', 'Kn', .2, (-1.0, 0, -5.2)), ('Hip', 'Kn', .6, (-2.2, 0, -5.4)), ('Hip', 'Kn', 1.0, (-2.4, 0, -3.5))], [2.0, 2.8, 1.0], tend=(0, .9))
        tube('gastroc_med', sd, [('Kn', 'An', 0.0, (-1.8, 2.5, -4.0)), ('Kn', 'An', .22, (-1.8, 0, -4.6)), ('Kn', 'An', .5, (-0.8, 0, -3.5))], [2.2, 3.2, 1.0], tend=(0, .72))
        tube('gastroc_lat', sd, [('Kn', 'An', 0.0, (2.2, 2.5, -4.0)), ('Kn', 'An', .22, (2.2, 0, -4.4)), ('Kn', 'An', .5, (1.0, 0, -3.5))], [2.0, 3.0, 1.0], tend=(0, .72))
        tube('tendon_calcan', sd, [('Kn', 'An', .5, (0.2, 0, -3.2)), ('Kn', 'An', .95, (0.2, 0, -2.4))], [1.3, 1.1], tend=(0, 0), col=0.0)
        tube('soleaire', sd, [('Kn', 'An', .3, (3.0, 0, -2.0)), ('Kn', 'An', .55, (2.8, 0, -3.0))], [2.0, 2.0])
        tube('tibial_ant', sd, [('Kn', 'An', .06, (1.9, 0, 3.3)), ('Kn', 'An', .5, (1.4, 0, 3.0)), ('Kn', 'An', .92, (0.0, 0, 3.0))], [1.5, 2.0, 0.7], tend=(0, .72))
        tube('peroniers', sd, [('Kn', 'An', .1, (4.0, 0, 0.5)), ('Kn', 'An', .6, (3.3, 0, -0.5)), ('Kn', 'An', .95, (3.0, 0, -0.6))], [1.4, 1.6, 0.8], tend=(0, .7))
        tube('ext_orteils', sd, [('Kn', 'An', .2, (2.4, 0, 3.2)), ('Kn', 'An', .8, (1.0, 0, 3.3))], [1.2, 0.9], tend=(0, .5))
    poly('grand_pectoral', [(1, 141), (9, 142), (17, 140), (21, 135), (20, 130), (14, 125), (8, 119), (3, 118), (1, 123)], 'f')
    poly('petit_dentele', [(13, 129), (19, 128), (19.5, 120), (16, 114), (13, 117)], 'f', nthr=-0.3)
    poly('obl_ext', [(8, 110), (14, 108), (16, 100), (13, 94), (8, 97)], 'f', nthr=-0.3)
    poly('obl_ext2', [(8, 120), (14, 118), (14.5, 109), (8, 110)], 'f', nthr=-0.2)
    for i, (y0, y1) in enumerate(((99.5, 105.5), (106, 112), (112.5, 118), (118.5, 123))):
        poly('droit_abdo%d' % i, [(0.8, y0), (6.0, y0), (6.6, (y0 + y1) / 2), (6.0, y1), (0.8, y1)], 'f', feather=0.8)
    poly('trapeze', [(0, 160), (6, 153), (14, 148), (19, 141.5), (13, 133), (6, 125), (0, 117)], 'b')
    poly('rhomboide', [(1, 140), (6.5, 140), (6.5, 128), (1, 128)], 'b')
    poly('sous_epineux', [(8, 141), (18, 140), (19, 132), (13, 127), (8, 131)], 'b')
    poly('grand_dorsal', [(3, 114), (6, 121), (14, 124), (20, 123), (20, 112), (17, 102), (12, 96), (3, 98)], 'b', nthr=-0.2)
    poly('erecteur', [(1.2, 98), (7, 99), (7.5, 112), (6, 124), (1.2, 125)], 'b')
    poly('glut_max', [(1.2, 96), (12, 96), (17, 91), (16, 82), (9, 79), (1.2, 83)], 'b')
    poly('glut_moyen', [(11, 99), (19, 96), (19, 90), (13, 91)], 'b', nthr=-0.2)
    poly('frontal', [(0.5, 172), (8, 171), (9, 167), (0.5, 167)], 'f')
    return M
