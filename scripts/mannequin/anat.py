"""Écorché v2 : territoires musculaires anatomiques tracés sur l'enveloppe de la peau.
Coordonnées d'auteur : homme de 175 cm, pose du modèle (bras à 40°), en cm ; symétrie G/D par |x|.
- tronc/tête : polygones en projection (face 'f' / dos 'b'), repères relevés sur la peau (grille) et sur les planches de Gray ;
- membres : carte « déroulée » du cylindre (s = fraction le long du segment, θ = angle autour de l'axe, 0 = devant).
"""
import numpy as np
from geom import smooth

# ---------- géométrie de base ----------
def signed_dist_poly(U, V, poly):
    """distance signée (>0 dedans) de points (U,V) à un polygone ; poly (k,2)"""
    poly = np.asarray(poly, float); k = len(poly)
    inside = np.zeros(len(U), bool); dist = np.full(len(U), 1e9)
    for i in range(k):
        a = poly[i]; b = poly[(i + 1) % k]
        den = (b[1] - a[1])
        if abs(den) > 1e-12:
            cond = ((a[1] > V) != (b[1] > V)) & (U < (b[0] - a[0]) * (V - a[1]) / den + a[0])
            inside ^= cond
        ab = b - a; ap = np.stack([U - a[0], V - a[1]], 1)
        t = np.clip((ap @ ab) / ((ab ** 2).sum() + 1e-12), 0, 1)
        dist = np.minimum(dist, np.linalg.norm(ap - t[:, None] * ab, axis=1))
    return np.where(inside, dist, -dist)

def thick_line(U, V, pts, width):
    """distance signée à une polyligne épaisse (width en cm) -> >0 dedans"""
    pts = np.asarray(pts, float); best = np.full(len(U), 1e9)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a
        ap = np.stack([U - a[0], V - a[1]], 1)
        t = np.clip((ap @ ab) / ((ab ** 2).sum() + 1e-12), 0, 1)
        best = np.minimum(best, np.linalg.norm(ap - t[:, None] * ab, axis=1))
    return width / 2 - best

# ---------- repères de membres ----------
class Limb:
    """Segment(s) en chaîne ; centres de coupe recalés sur la peau (barycentre des sommets du segment)."""
    def __init__(self, P, Wd, bones, names, joints, anterior, lateral_sign, ref_dir=None):
        self.joints = [np.asarray(j, float) for j in joints]
        self.seg_len = [np.linalg.norm(self.joints[i + 1] - self.joints[i]) for i in range(len(joints) - 1)]
        idx = [bones.index(n) for n in names]
        m = Wd[:, idx].sum(1) > 0.5
        self.centres = []
        V = P[m]
        for i in range(len(joints) - 1):
            A, B = self.joints[i], self.joints[i + 1]; ab = B - A; L = np.linalg.norm(ab)
            u = ((V - A) @ ab) / L ** 2
            cs = []
            for t in np.linspace(0, 1, 11):
                sel = np.abs(u - t) * L < 1.4
                cs.append(V[sel].mean(0) if sel.sum() > 4 else A + t * ab)
            self.centres.append(np.array(cs))
        self.anterior = np.asarray(anterior, float); self.lat = lateral_sign
        self.mask = m

    def coords(self, P, seg):
        """pour le segment seg : s (0..1), theta (deg, 0 = devant, +90 = côté latéral), rayon (cm)"""
        A, B = self.joints[seg], self.joints[seg + 1]; ab = B - A; L = np.linalg.norm(ab); a = ab / L
        s = ((P - A) @ ab) / L ** 2
        cs = self.centres[seg]; ts = np.linspace(0, 1, len(cs))
        c = np.stack([np.interp(np.clip(s, 0, 1), ts, cs[:, k]) for k in range(3)], 1) + (np.clip(s, -1, 2) - np.clip(s, 0, 1))[:, None] * ab
        f = self.anterior - (self.anterior @ a) * a; f /= np.linalg.norm(f)
        l = np.cross(a, f) * self.lat
        # l doit pointer vers l'extérieur du corps
        d = P - c
        th = np.degrees(np.arctan2(d @ l, d @ f))
        r = np.linalg.norm(d - (d @ a)[:, None] * a, axis=1)
        return s, th, r

def limb_member(Pcm, limb, seg, poly_s_theta, Rm, feather=0.5, wrap=True):
    """appartenance (0..1) à un polygone (s, θ°) : distance signée en cm (u = s·L, v = θ·Rm)."""
    s, th, r = limb.coords(Pcm, seg); L = limb.seg_len[seg]
    poly = np.array(poly_s_theta, float)
    pu = np.stack([poly[:, 0] * L, np.radians(poly[:, 1]) * Rm], 1)
    best = np.full(len(Pcm), -1e9)
    for shift in ((0, 360, -360) if wrap else (0,)):
        sd = signed_dist_poly(s * L, np.radians(th + shift) * Rm, pu)
        best = np.maximum(best, sd)
    return smooth(0.0, feather, best), s, th
