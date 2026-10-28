"""Définition des muscles (voir anat.py). Chaque fonction ajoute des territoires dans une liste `T`."""
import numpy as np
from anat import Limb, limb_member, signed_dist_poly, thick_line
from geom import smooth

MUSCLE_RED = np.array([0.88, 0.47, 0.47]); TENDON = np.array([0.93, 0.88, 0.78]); BONE = np.array([0.90, 0.86, 0.77])
FASCIA = np.array([0.88, 0.78, 0.70]); FOND = np.array([0.62, 0.34, 0.34])

ENFANT = None  # (ymap, sxh) pour un corps d'enfant (voir build_skin.build) ; None = adulte

class Sink:
    """Résolution incrémentale des territoires (mémoire bornée) : le plus prioritaire gagne."""
    FLAG = {'muscle': 0.0, 'tendon': 1.0, 'fascia': 0.5, 'bone': 2.0}
    def __init__(s, n):
        s.owner = np.full(n, -1, np.int16); s.w = np.zeros(n, np.float32); s.p = np.full(n, -99, np.int8)
        s.fib = np.zeros(n, np.float32); s.flag = np.full(n, -1.0, np.float32); s.names = []
    def add(s, name, idx, w, fib, kind, prio):
        k = len(s.names); s.names.append(name)
        cand = w > 0.45
        if not cand.any(): return
        i = idx[cand]; wc = w[cand]
        better = (prio > s.p[i]) | ((prio == s.p[i]) & (wc > s.w[i]))
        i = i[better]
        s.owner[i] = k; s.w[i] = wc[better]; s.p[i] = prio; s.fib[i] = fib[cand][better]; s.flag[i] = s.FLAG[kind]

class Terr:
    def __init__(s, name, w, fib, kind='muscle', prio=0, tone=1.0):
        s.name, s.w, s.fib, s.kind, s.prio, s.tone = name, w, fib, kind, prio, tone

def build_territories(Pcm, N, Wd, bones, bp, H, sx, Pv=None, ymap=None, sxh=None):
    """Pcm, N : points d'évaluation (cm, pose de liaison) et normales ; Pv, Wd : sommets de la peau et poids (repères de membres)."""
    Pv = Pcm if Pv is None else Pv
    if ymap is None and ENFANT is not None: ymap, sxh = ENFANT
    sy = H / 175.0
    n = len(Pcm); T = Sink(n)
    x = Pcm[:, 0]; y = Pcm[:, 1]; z = Pcm[:, 2]
    ax = np.abs(x)
    # Corps d'enfant : on ramène les coordonnées dans l'espace « adulte » des polygones (repères anatomiques mis en
    # correspondance par morceaux : sol, cheville, genou, hanche, taille, épaule, cou, tête) et la largeur de tête a sa propre échelle.
    if ymap is not None:
        yadu = np.interp(y, ymap[0], ymap[1])
        t = np.clip((y - (ymap[2] - 2.0)) / 4.0, 0, 1); t = t * t * (3 - 2 * t)
        sxl = sx + (sxh - sx) * t
        if len(ymap) > 3:   # largeur du bassin : de la taille (spine03) vers les hanches, l'échelle suit la largeur du bassin
            yh, yw = ymap[0][3], ymap[0][4]
            t2 = np.clip((yw - y) / max(yw - yh, 1e-6), 0, 1); t2 = t2 * t2 * (3 - 2 * t2)
            sxl = sxl + (ymap[3] - sx) * t2 * (1 - t)
    else:
        yadu = y / sy; sxl = sx
    idx = lambda names: [bones.index(b) for b in names if b in bones]

    # ---------- projection tronc / tête ----------
    def proj(view):
        return (ax / sxl, yadu, N[:, 2] if view == 'f' else -N[:, 2])
    def sub_idx(U, V, pts, pad):
        pts = np.asarray(pts, float)
        return np.nonzero((U >= pts[:, 0].min() - pad) & (U <= pts[:, 0].max() + pad) & (V >= pts[:, 1].min() - pad) & (V <= pts[:, 1].max() + pad))[0]
    def fibc(U, V, fib):
        if fib[0] == 'dir':
            a = np.radians(fib[1]); return -np.sin(a) * U + np.cos(a) * V
        return np.arctan2(V - fib[2], U - fib[1]) * 18.0
    def poly(name, pts, view, prio=0, fib=('dir', 0.0), feather=0.6, nthr=0.0, kind='muscle', tone=1.0):
        U, V, nz = proj(view)
        i = sub_idx(U, V, pts, feather + 0.5)
        sd = signed_dist_poly(U[i], V[i], pts)
        w = smooth(0, feather, sd) * smooth(nthr, nthr + 0.5, nz[i])
        T.add(name, i, w, fibc(U[i], V[i], fib), kind, prio)
    def line(name, pts, width, view, prio=0, fib=('dir', 90.0), nthr=0.0, kind='muscle', tone=1.0, feather=0.5):
        U, V, nz = proj(view)
        p = np.asarray(pts, float); pad = width / 2 + feather + 0.5
        i = np.nonzero((U >= p[:, 0].min() - pad) & (U <= p[:, 0].max() + pad) & (V >= p[:, 1].min() - pad) & (V <= p[:, 1].max() + pad))[0]
        sd = thick_line(U[i], V[i], pts, width)
        w = smooth(0, feather, sd) * smooth(nthr, nthr + 0.5, nz[i])
        T.add(name, i, w, fibc(U[i], V[i], fib), kind, prio)

    # ---------- TRONC, face ----------
    poly('pectoral_claviculaire', [(1.6, 146.0), (9.5, 145.4), (15, 143.8), (19.2, 139.0), (16.6, 136.0), (10.5, 138.6), (4.2, 140.6), (1.8, 141.4)], 'f', prio=7, fib=('fan', 21.5, 134.0), nthr=-0.2)
    poly('pectoral_sternocostal', [(0.7, 141.2), (4.2, 140.4), (10.5, 138.4), (16.8, 135.8), (20.3, 134.6), (21.2, 131.2), (16.8, 127.2), (12, 124.3), (7, 122.3), (2, 121.2), (0.7, 121)], 'f', prio=6, fib=('fan', 21.5, 133.0), nthr=-0.2)
    poly('sternum', [(0.0, 146.5), (0.45, 146.0), (0.45, 121.5), (0.0, 121)], 'f', prio=5, kind='tendon', feather=0.25)
    line('dentele_dig0', [(21.2, 130.2), (15.4, 127.2)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig1', [(21.1, 128.0), (15.4, 125.0)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig2', [(21.0, 125.9), (15.4, 122.9)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig3', [(20.8, 123.7), (15.4, 120.8)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig4', [(20.7, 121.6), (15.4, 118.6)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig5', [(20.6, 119.4), (15.4, 116.5)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig6', [(20.5, 117.3), (15.4, 114.3)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    line('dentele_dig7', [(20.4, 115.1), (15.4, 112.2)], 1.35, 'f', prio=5, fib=('dir', 62), nthr=-0.6)
    poly('oblique_ext', [(8.8, 121.6), (14.2, 122.0), (17.4, 118.6), (18.3, 113), (17.6, 107), (16.0, 103.2), (13.2, 103.6), (11.6, 110), (10, 116)], 'f', prio=3, fib=('dir', -55), nthr=-0.6)
    poly('oblique_apo', [(7.0, 114.0), (8.3, 113.4), (9.6, 108), (11.0, 103.8), (10.0, 101.0), (8.2, 100.4), (7.0, 102.0), (6.9, 108)], 'f', prio=3, kind='fascia', fib=('dir', 90), nthr=-0.2)
    poly('droit_abdo', [(0.7, 123.5), (8.3, 122.8), (7.2, 115), (6.9, 105), (5.7, 97), (4.5, 92.0), (0.7, 92.0)], 'f', prio=4, fib=('dir', 90), nthr=-0.2)
    for i, yy in enumerate((119.0, 113.2, 107.4, 101.8)):
        poly('inscription%d' % i, [(0.7, yy + 0.45), (7.9 - i * 0.4, yy + 0.45), (7.9 - i * 0.4, yy - 0.45), (0.7, yy - 0.45)], 'f', prio=5, kind='tendon', feather=0.25, nthr=-0.2)
    poly('ligne_blanche', [(0.0, 121), (0.45, 121), (0.45, 91), (0.0, 91)], 'f', prio=5, kind='tendon', feather=0.3, nthr=-0.2)
    line('ligament_inguinal', [(14.6, 101.8), (9, 96.4), (3.5, 91.8)], 0.8, 'f', prio=5, kind='tendon', fib=('dir', -35), nthr=-0.2)
    line('sterno_cleido', [(2.4, 146.8), (4.2, 150.8), (6.0, 155.8), (7.3, 160.2)], 3.0, 'f', prio=7, fib=('dir', 62), nthr=-0.4)
    line('sterno_hyoidien', [(0.35, 146.2), (0.35, 151.4)], 1.3, 'f', prio=6, fib=('dir', 90), nthr=-0.2)
    poly('trapeze_sup_face_cou', [(4.8, 150.6), (7.6, 156.4), (9.6, 153.2), (8.0, 149.6)], 'f', prio=3, fib=('dir', 70), nthr=-0.9)
    poly('deltoide_ant_projection', [(15, 144.5), (23.8, 142.6), (25.5, 138), (21.5, 134), (19.5, 139)], 'f', prio=2, fib=('dir', -50), nthr=0.1)

    poly('trapeze_sup_face', [(5.4, 152.5), (11, 149.2), (16, 146.6), (22.2, 144.2), (21, 142.4), (15, 144.8), (8.5, 147.8), (4.8, 150.6)], 'f', prio=2, fib=('dir', -20), nthr=-0.95)
    # ---------- TRONC, dos ----------
    poly('trapeze_sup', [(0.6, 158.2), (4, 156), (6, 152), (10.5, 149.5), (15.5, 147), (21.5, 144.2), (21, 142.2), (14, 142.2), (0.6, 144)], 'b', prio=5, fib=('dir', -20), nthr=-0.2)
    poly('trapeze_moy', [(0.6, 144), (14, 142.2), (20.2, 141.6), (14.5, 139.6), (8.2, 137.6), (0.6, 138)], 'b', prio=5, fib=('dir', 0), nthr=-0.2)
    poly('trapeze_inf', [(0.6, 138), (8.2, 137.6), (6.5, 133), (4, 126), (1.0, 119), (0.6, 119)], 'b', prio=5, fib=('dir', 55), nthr=-0.2)
    poly('sous_epineux', [(8.3, 137.2), (13, 139.5), (19, 140.2), (20, 136), (17.5, 132.5), (12, 131), (8.8, 130.5)], 'b', prio=4, fib=('dir', 15))
    poly('petit_rond', [(15.3, 133.2), (20.4, 136.6), (21.2, 134.2), (17.2, 130.2)], 'b', prio=4, fib=('dir', 30))
    poly('grand_rond', [(9.5, 130.0), (16.5, 129.9), (21.6, 131.4), (21.3, 128.5), (17, 126.4), (10, 127)], 'b', prio=4, fib=('dir', 20))
    poly('grand_dorsal', [(3.2, 127.5), (9, 128.2), (16.5, 129.4), (20.5, 131), (19.5, 125), (18, 118), (17.3, 110), (16, 105.5), (12.5, 107.5), (8.5, 112), (5.2, 118), (3.5, 123)], 'b', prio=3, fib=('dir', 40), nthr=-0.4)
    poly('fascia_thoraco_lombaire', [(5.8, 100), (8.5, 101), (12.5, 107.5), (8.5, 112), (5.2, 118), (6.0, 120), (6.6, 110)], 'b', prio=3, kind='fascia', fib=('dir', 90))
    poly('erecteur_rachis', [(0.9, 100), (5.8, 100), (6.6, 110), (6.0, 120), (4.6, 127), (0.9, 127)], 'b', prio=2, fib=('dir', 90))
    poly('fessier_max', [(0.8, 98.5), (7, 100.5), (14, 99.8), (17.2, 95), (17.4, 90), (15.2, 84.5), (10, 81.5), (3, 86), (0.8, 88)], 'b', prio=3, fib=('dir', 35), nthr=-0.3)
    poly('fessier_moy', [(7.5, 104.5), (16.2, 104.8), (18.6, 99.2), (17.2, 95.2), (12, 97), (8, 99.8)], 'b', prio=4, fib=('dir', -50), nthr=-0.3)
    poly('sacrum_fascia', [(0.0, 101), (3.2, 100.2), (1.8, 90), (0.0, 89)], 'b', prio=4, kind='fascia', feather=0.4)
    poly('rhombe_epine', [(0.0, 150), (0.5, 150), (0.5, 119), (0.0, 119)], 'b', prio=6, kind='fascia', feather=0.3)

    # ---------- TÊTE (projection de face) ----------
    poly('galea_face', [(0.0, 174.6), (7.4, 173.6), (8.8, 169.0), (0.0, 169.0)], 'f', prio=1, kind='fascia', feather=0.5, nthr=-0.2)
    poly('galea_dos', [(0.0, 175.5), (7.8, 172.8), (9.2, 164.5), (7.0, 160.6), (0.0, 160.0)], 'b', prio=1, kind='fascia', feather=0.5, nthr=-0.3)
    poly('occipital', [(0.4, 164.0), (5.4, 163.0), (6.2, 159.6), (0.4, 159.8)], 'b', prio=2, fib=('dir', 90))
    poly('sterno_cleido_dos', [(4.8, 160.0), (8.0, 159.0), (7.2, 152.6), (4.6, 153.4)], 'b', prio=2, fib=('dir', 60), nthr=-0.2)
    poly('frontal', [(0.4, 173.6), (7.8, 172.2), (8.4, 168.9), (4.2, 169.6), (0.4, 169.6)], 'f', prio=3, fib=('dir', 90))
    poly('orbiculaire_oeil', [(1.3, 168.4), (3.2, 169.4), (5.2, 168.6), (5.4, 166.6), (3.4, 165.6), (1.5, 166.4)], 'f', prio=4, fib=('dir', 0))
    poly('masseter', [(6.6, 160.0), (8.6, 160.6), (8.9, 155.5), (6.8, 154.0), (5.6, 156.8)], 'f', prio=3, fib=('dir', 80), nthr=-0.5)
    poly('orbiculaire_bouche', [(0.0, 159.6), (2.8, 159.0), (3.4, 157.2), (2.0, 155.6), (0.0, 155.4)], 'f', prio=4, fib=('dir', 0))
    poly('mentonnier', [(0.0, 154.6), (2.2, 154.8), (2.6, 152.4), (0.0, 151.8)], 'f', prio=3, fib=('dir', 90))
    poly('temporal', [(5.6, 172.0), (9.0, 169.0), (9.4, 164.6), (7.6, 164.4), (6.6, 168.2)], 'f', prio=2, fib=('fan', 7.6, 164.0), nthr=-0.8)

    # ---------- MEMBRES (cartes déroulées) ----------
    def bpos(n): return np.array(bp[n][0]) * 10.0   # dm → cm
    def mk_limb(side, kind):
        sd = 'L' if side > 0 else 'R'
        FRONT = (0, 0, 1); LAT = (side, 0, 0); MED = (-side, 0, 0)
        if kind == 'leg':
            J = [bpos('upperleg01.' + sd), bpos('lowerleg01.' + sd), bpos('foot.' + sd)]
            names = ['upperleg01.' + sd, 'upperleg02.' + sd, 'lowerleg01.' + sd, 'lowerleg02.' + sd]
            return Limb(Pv, Wd, bones, names, J, FRONT, LAT)
        if kind == 'arm':
            J = [bpos('upperarm01.' + sd), bpos('lowerarm01.' + sd), bpos('wrist.' + sd)]
            lim = Limb(Pv, Wd, bones, ['upperarm01.' + sd, 'upperarm02.' + sd], J[:2], FRONT, LAT)
            fore = Limb(Pv, Wd, bones, ['lowerarm01.' + sd, 'lowerarm02.' + sd], J[1:], MED, FRONT)
            return lim, fore
        if kind == 'hand':
            hb = ['wrist.' + sd] + ['metacarpal%d.%s' % (i, sd) for i in range(1, 5)] + ['finger%d-%d.%s' % (i, j, sd) for i in range(1, 6) for j in range(1, 4)]
            J = [bpos('wrist.' + sd), np.array(bp['finger3-3.' + sd][1]) * 10.0]
            return Limb(Pv, Wd, bones, hb, J, MED, FRONT, gate=(Pv[:, 0] * side > J[0][0] * side - 6.8 * sx) & (Pv[:, 1] < J[0][1] + 0.3 * sx))
    Rm = {'thigh': 7.5, 'shank': 5.2, 'arm': 4.3, 'fore': 3.4, 'hand': 3.3}
    cache = {}
    def lm(name, limb, seg, pts, key, prio=0, kind='muscle', fibsc=1.0, feather=0.55, tone=1.0, gate=None):
        ck = (id(limb), seg, id(gate))
        if ck not in cache:
            g = np.nonzero(gate)[0] if gate is not None else np.arange(n)
            s_, th_, r_ = limb.coords(Pcm[g], seg)
            ok = (s_ > -0.5) & (s_ < 1.5) & (r_ < 16)
            cache[ck] = (g[ok], s_[ok], th_[ok], limb, gate)
        g, s_, th_ = cache[ck][:3]
        L = limb.seg_len[seg]; poly_ = np.array(pts, float); Rk = Rm[key]
        pu = np.stack([poly_[:, 0] * L, np.radians(poly_[:, 1]) * Rk], 1)
        pad = feather + 0.6
        inb = (s_ * L >= pu[:, 0].min() - pad) & (s_ * L <= pu[:, 0].max() + pad)
        sel = np.nonzero(inb)[0]
        best = np.full(len(sel), -1e9)
        for shift in (0, 360, -360):
            sd = signed_dist_poly(s_[sel] * L, np.radians(th_[sel] + shift) * Rk, pu)
            best = np.maximum(best, sd)
        w = smooth(0.0, feather, best)
        T.add(name, g[sel], w, np.radians(th_[sel]) * Rk * fibsc, kind, prio)
    for side in (1, -1):
        sd = 'L' if side > 0 else 'R'
        leg = mk_limb(side, 'leg')
        gl = (np.abs(x) > 0.5) & ((x * side) > 0)          # côté du membre
        # --- cuisse : face antérieure
        lm('droit_femoral.' + sd, leg, 0, [(.10, -6), (.2, -14), (.45, -21), (.62, -19), (.8, -11), (.9, -6), (.9, 6), (.8, 11), (.62, 19), (.45, 21), (.2, 14), (.10, 6)], 'thigh', 5, gate=gl)
        lm('vaste_lat.' + sd, leg, 0, [(.20, 24), (.45, 23), (.7, 15), (.93, 13), (.98, 40), (.95, 85), (.7, 104), (.45, 108), (.2, 98)], 'thigh', 4, gate=gl)
        lm('vaste_med.' + sd, leg, 0, [(.40, -24), (.6, -24), (.8, -12), (.97, -9), (1.0, -30), (.92, -60), (.77, -80), (.57, -77), (.42, -52)], 'thigh', 4, gate=gl)
        lm('tendon_quadriceps.' + sd, leg, 0, [(.88, -8), (1.02, -9), (1.04, 9), (.88, 8)], 'thigh', 6, kind='tendon', gate=gl)
        lm('sartorius.' + sd, leg, 0, [(0.0, 32), (.0, 38), (.25, 14), (.5, -20), (.72, -58), (.93, -96), (.93, -106), (.72, -68), (.5, -30), (.25, 4)], 'thigh', 7, gate=gl)
        lm('fascia_lata.' + sd, leg, 0, [(.18, 76), (.45, 84), (1.02, 87), (1.02, 95), (.45, 97), (.2, 90)], 'thigh', 6, kind='tendon', gate=gl)
        lm('tfl.' + sd, leg, 0, [(-0.02, 42), (.04, 78), (.17, 80), (.25, 55), (.12, 40)], 'thigh', 6, gate=gl)
        lm('gracile.' + sd, leg, 0, [(.04, -108), (.5, -110), (.95, -112), (.95, -122), (.5, -121), (.04, -118)], 'thigh', 6, gate=gl)
        lm('adducteur_long.' + sd, leg, 0, [(.04, -52), (.3, -62), (.5, -90), (.3, -100), (.08, -86)], 'thigh', 5, gate=gl)
        lm('pectine.' + sd, leg, 0, [(0.0, -30), (.2, -44), (.2, -66), (0.02, -56)], 'thigh', 5, gate=gl)
        lm('grand_adducteur.' + sd, leg, 0, [(.15, -120), (.5, -128), (.93, -126), (.93, -165), (.5, -170), (.15, -160)], 'thigh', 4, gate=gl)
        # --- cuisse : face postérieure
        lm('biceps_femoral.' + sd, leg, 0, [(.12, 126), (.5, 118), (.93, 108), (1.0, 120), (.93, 150), (.5, 165), (.15, 172)], 'thigh', 4, gate=gl)
        lm('semi_tendineux.' + sd, leg, 0, [(.12, -150), (.5, -146), (.93, -135), (1.0, -142), (.93, -168), (.5, -176), (.15, -178)], 'thigh', 4, gate=gl)
        lm('semi_membraneux.' + sd, leg, 0, [(.12, -128), (.5, -118), (.85, -112), (.93, -130), (.5, -142), (.15, -145)], 'thigh', 3, gate=gl)
        # --- jambe
        lm('tibial_ant.' + sd, leg, 1, [(.07, -2), (.25, 8), (.55, 18), (.7, 18), (.7, 52), (.5, 50), (.25, 46), (.07, 32)], 'shank', 5, gate=gl)
        lm('tendon_tibial_ant.' + sd, leg, 1, [(.68, 4), (.95, -20), (1.0, -24), (1.0, -8), (.7, 28)], 'shank', 6, kind='tendon', gate=gl)
        lm('ext_commun_orteils.' + sd, leg, 1, [(.12, 52), (.3, 58), (.62, 62), (.62, 82), (.3, 84), (.12, 78)], 'shank', 5, gate=gl)
        lm('peroniers.' + sd, leg, 1, [(.08, 86), (.3, 90), (.65, 98), (.65, 135), (.3, 132), (.08, 120)], 'shank', 5, gate=gl)
        lm('tibia_crete.' + sd, leg, 1, [(.08, -36), (.3, -28), (.7, -20), (.97, -22), (.97, -9), (.7, -4), (.3, -10), (.08, -20)], 'shank', 3, kind='bone', gate=gl)
        lm('gastroc_med.' + sd, leg, 1, [(-0.03, -108), (.1, -102), (.3, -108), (.44, -128), (.5, -176), (.38, -182), (.15, -182), (-0.03, -176)], 'shank', 6, gate=gl)
        lm('gastroc_lat.' + sd, leg, 1, [(-0.03, 108), (.1, 102), (.28, 106), (.4, 124), (.46, 176), (.35, 182), (.15, 182), (-0.03, 176)], 'shank', 6, gate=gl)
        lm('soleaire.' + sd, leg, 1, [(.28, 96), (.55, 100), (.7, 118), (.55, 150), (.4, 142), (.3, 120)], 'shank', 4, gate=gl)
        lm('soleaire_med.' + sd, leg, 1, [(.3, -100), (.55, -104), (.72, -120), (.6, -150), (.42, -146), (.32, -124)], 'shank', 4, gate=gl)
        lm('tendon_achille.' + sd, leg, 1, [(.46, 184), (.7, 192), (1.0, 190), (1.0, 170), (.7, 168), (.46, 176)], 'shank', 7, kind='tendon', gate=gl)
        lm('tendon_rotulien.' + sd, leg, 1, [(-0.06, -9), (0.0, -9), (.11, -6), (.11, 6), (0.0, 9), (-0.06, 9)], 'shank', 7, kind='tendon', gate=gl)
        lm('rotule.' + sd, leg, 0, [(.97, -14), (1.04, -12), (1.06, 0), (1.04, 12), (.97, 14), (.95, 0)], 'thigh', 7, kind='bone', gate=gl)
        # --- bras
        arm, fore = mk_limb(side, 'arm')
        hand = mk_limb(side, 'hand')
        ga = ((x * side) > 8.0)
        lm('deltoide_ant.' + sd, arm, 0, [(-.30, -12), (-.05, -22), (.20, -4), (.42, 36), (.40, 52), (.15, 48), (-.05, 38), (-.30, 24)], 'arm', 5, gate=ga)
        lm('deltoide_moy.' + sd, arm, 0, [(-.32, 40), (-.05, 38), (.15, 50), (.42, 52), (.44, 94), (.40, 120), (.15, 130), (-.05, 128), (-.32, 118)], 'arm', 5, gate=ga)
        lm('deltoide_post.' + sd, arm, 0, [(-.30, 118), (-.05, 128), (.15, 130), (.40, 120), (.38, 158), (.18, 176), (-.05, 192), (-.30, 196)], 'arm', 5, gate=ga)
        lm('biceps.' + sd, arm, 0, [(.30, -12), (.42, -32), (.62, -35), (.82, -25), (.92, -12), (.92, 4), (.82, 14), (.62, 24), (.42, 16), (.32, 0)], 'arm', 5, gate=ga)
        lm('tendon_biceps.' + sd, arm, 0, [(.86, -5), (1.02, -6), (1.04, 3), (.88, 6)], 'arm', 6, kind='tendon', gate=ga)
        lm('coraco_brachial.' + sd, arm, 0, [(.1, -50), (.28, -44), (.45, -46), (.45, -62), (.28, -64), (.1, -70)], 'arm', 4, gate=ga)
        lm('brachial.' + sd, arm, 0, [(.46, 22), (.7, 28), (.96, 36), (.96, 76), (.7, 74), (.5, 58)], 'arm', 4, gate=ga)
        lm('triceps_longue.' + sd, arm, 0, [(.08, -100), (.35, -112), (.62, -130), (.8, -160), (.8, -182), (.5, -182), (.2, -168), (.08, -140)], 'arm', 4, gate=ga)
        lm('triceps_lat.' + sd, arm, 0, [(.30, 100), (.5, 108), (.75, 130), (.8, 168), (.55, 182), (.3, 170), (.28, 128)], 'arm', 4, gate=ga)
        lm('triceps_med.' + sd, arm, 0, [(.55, -150), (.8, -140), (.92, -150), (.92, -182), (.62, -182)], 'arm', 3, gate=ga)
        lm('tendon_triceps.' + sd, arm, 0, [(.80, 160), (1.0, 168), (1.0, 192), (.80, 200)], 'arm', 6, kind='tendon', gate=ga)
        # --- avant-bras (θ = 0 : face palmaire ; + : côté radial ; 180 : dos)
        lm('brachio_radial.' + sd, fore, 0, [(.0, 76), (.25, 84), (.5, 92), (.6, 98), (.55, 118), (.25, 112), (.0, 106)], 'fore', 5, gate=ga)
        lm('rond_pronateur.' + sd, fore, 0, [(0.0, 12), (.15, 24), (.4, 54), (.4, 70), (.15, 56), (0.0, 36)], 'fore', 5, gate=ga)
        lm('flechisseurs_radial.' + sd, fore, 0, [(0.0, -12), (.2, -6), (.55, 14), (.55, 28), (.2, 10), (0.0, 4)], 'fore', 5, gate=ga)
        lm('flechisseurs_superf.' + sd, fore, 0, [(.0, -48), (.25, -34), (.58, -14), (.58, -4), (.25, -18), (.0, -30)], 'fore', 4, gate=ga)
        lm('flechisseur_ulnaire.' + sd, fore, 0, [(.0, -80), (.25, -74), (.6, -62), (.6, -42), (.25, -52), (.0, -52)], 'fore', 5, gate=ga)
        lm('extenseurs_radiaux.' + sd, fore, 0, [(.0, 110), (.25, 118), (.55, 130), (.55, 150), (.25, 140), (.0, 132)], 'fore', 5, gate=ga)
        lm('extenseur_commun.' + sd, fore, 0, [(.0, 138), (.3, 152), (.6, 162), (.6, 180), (.3, 184), (.0, 195)], 'fore', 5, gate=ga)
        lm('extenseur_ulnaire.' + sd, fore, 0, [(.0, -148), (.3, -136), (.6, -116), (.6, -96), (.3, -108), (.0, -126)], 'fore', 5, gate=ga)
        lm('tendons_avant_bras_palmaire.' + sd, fore, 0, [(.60, -16), (1.04, -9), (1.04, 8), (.60, 12)], 'fore', 6, kind='tendon', gate=ga)
        lm('tendons_avant_bras_dorsal.' + sd, fore, 0, [(.62, 166), (1.04, 172), (1.04, 188), (.62, 194)], 'fore', 6, kind='tendon', gate=ga)

    # ---------- MAINS (limb « hand » : θ = 0 face palmaire, +90 radial / pouce, 180 dorsal) ----------
    for side in (1, -1):
        sd = 'L' if side > 0 else 'R'
        hand = mk_limb(side, 'hand'); wr = bpos('wrist.' + sd); gh = ((x * side) > wr[0] * side - 6.8 * sx) & (y < wr[1] + 0.3 * sx)
        H = lambda nm, seg_pts, pr=5, kind='muscle', f=0.4: lm(nm + '.' + sd, hand, 0, seg_pts, 'hand', pr, kind=kind, feather=f, gate=gh)
        H('doigts', [(.44, -180), (1.2, -180), (1.2, 180), (.44, 180)], 1, 'tendon')
        H('thenar', [(.03, 25), (.18, 18), (.34, 38), (.38, 72), (.24, 96), (.06, 84)], 6)
        H('hypothenar', [(.06, -30), (.22, -26), (.36, -52), (.34, -86), (.18, -92), (.06, -70)], 6)
        H('aponevrose_palmaire', [(.04, -24), (.42, -24), (.46, 18), (.04, 22)], 5, 'fascia')
        H('tendons_flechisseurs_doigts', [(.42, -14), (1.2, -10), (1.2, 10), (.42, 14)], 7, 'tendon', 0.3)
        H('retinaculum_extenseurs', [(-.10, 112), (.10, 112), (.10, 248), (-.10, 248)], 6, 'fascia')
        for k, c in enumerate((138, 164, 196, 222)):
            H('tendon_extenseur_doigt%d' % k, [(.10, c - 6), (1.2, c - 9), (1.2, c + 9), (.10, c + 6)], 7, 'tendon', 0.3)
        for k, (c1, c2) in enumerate(((138, 164), (164, 196), (196, 222))):
            H('interosseux_dorsal%d' % k, [(.12, c1 + 7), (.42, c1 + 9), (.42, c2 - 9), (.12, c2 - 7)], 5)
        H('interosseux_dorsal_pouce', [(.10, 96), (.38, 100), (.38, 128), (.10, 130)], 5)
    # ---------- PIEDS (repère local : v = |x| − x cheville, latéral > 0 ; u = z) ----------
    xa = abs(bpos('foot.L')[0]); za = bpos('foot.L')[2]
    v = ax - xa; u = z - za + 1.9
    gf = np.nonzero((y < 11.5) & (ax > xa - 9) & (ax < xa + 9) & (z > -9) & (z < 28))[0]
    toes = []
    for t in range(1, 6):
        nm = [b for b in bones if b.startswith('toe%d-' % t) and b.endswith('.L')]
        last = sorted(nm)[-1]; tp = np.array(bp[last][1]) * 10.0
        toes.append((abs(tp[0]) - xa, tp[2] - za + 1.9))
    def fp(name, pts, prio=5, kind='muscle', fib=(0, 1), top=None, feather=0.35):
        pts = np.asarray(pts, float)
        V = v[gf]; U = u[gf]
        sd = signed_dist_poly(V, U, pts)
        w = smooth(0, feather, sd)
        if top is True: w = w * smooth(0.1, 0.5, N[gf, 1])
        elif top is False: w = w * smooth(-0.1, -0.5, N[gf, 1])
        T.add(name, gf, w, fib[0] * V + fib[1] * U, kind, prio)
    def fl(name, pts, wd, prio=7, kind='tendon', top=True):
        p = np.asarray(pts, float); V = v[gf]; U = u[gf]
        sd = thick_line(V, U, p, wd)
        w = smooth(0, 0.3, sd)
        if top: w = w * smooth(0.1, 0.5, N[gf, 1])
        T.add(name, gf, w, U, kind, prio)
    fp('pied_dos_fascia', [(-6, -1.5), (7, -1.5), (7, 16), (-6, 16)], 1, 'fascia', top=True)
    fp('orteils', [(-7, 15.4), (9, 15.4), (9, 28), (-7, 28)], 2, 'tendon')
    fp('retinaculum_cheville', [(-3.8, 0), (3.8, 0), (3.6, 4.8), (-3.6, 4.8)], 4, 'fascia', top=True)
    fl('tendon_tibial_ant_pied', [(-1.6, 2.0), (-2.6, 6.0), (-3.6, 10.2)], 1.1)
    fl('tendon_ext_hallux', [(-0.5, 2.0), (-1.4, 8.0), toes[0]], 0.9)
    for k in range(1, 5):
        fl('tendon_ext_orteil%d' % (k + 1), [(0.9, 2.0), (0.9 + 0.2 * k, 7.0), toes[k]], 0.65)
    fp('court_extenseur_orteils', [(1.3, 4.6), (4.2, 6.4), (3.6, 11.8), (1.1, 10.2)], 5, top=True)
    fp('abducteur_hallux', [(-5.2, 3.0), (-2.2, 3.0), (-2.0, 13.5), (-5.0, 13.5)], 5, top=None)
    fp('abducteur_petit_orteil', [(2.6, 3.2), (6.2, 3.2), (6.0, 14.2), (2.8, 14.2)], 5, top=None)
    fp('fascia_plantaire', [(-2.8, 2.0), (3.0, 2.0), (3.2, 15.0), (-3.0, 15.0)], 4, 'fascia', top=False)
    # ---------- VISAGE, COU (complément) ----------
    poly('procerus', [(0.0, 169.2), (0.9, 169.0), (0.9, 166.0), (0.0, 166.0)], 'f', prio=5, fib=('dir', 90), feather=0.3)
    line('corrugateur', [(1.0, 168.0), (3.4, 169.0)], 0.9, 'f', prio=5, fib=('dir', 20), nthr=0.2)
    poly('nasalis', [(1.0, 163.4), (2.9, 163.6), (3.1, 161.4), (1.2, 160.9)], 'f', prio=5, fib=('dir', 20), nthr=0.1)
    line('releveur_levre_sup', [(2.7, 165.2), (2.5, 160.8)], 1.2, 'f', prio=5, fib=('dir', 90), nthr=0.1)
    line('zygomatique_majeur', [(7.0, 163.6), (3.9, 158.4)], 1.5, 'f', prio=6, fib=('dir', 55), nthr=-0.1)
    line('zygomatique_mineur', [(5.8, 164.4), (3.2, 160.0)], 1.0, 'f', prio=5, fib=('dir', 55), nthr=-0.1)
    line('risorius', [(6.8, 157.8), (4.2, 157.6)], 0.9, 'f', prio=5, fib=('dir', 0), nthr=-0.2)
    poly('abaisseur_angle_bouche', [(3.6, 157.0), (5.2, 157.0), (4.4, 153.4), (3.4, 154.4)], 'f', prio=5, fib=('dir', 90), nthr=-0.1)
    poly('abaisseur_levre_inf', [(0.7, 155.2), (3.0, 155.2), (3.2, 153.0), (0.7, 152.8)], 'f', prio=4, fib=('dir', 80), nthr=0.0)
    poly('buccinateur', [(4.3, 160.0), (6.6, 160.2), (6.4, 156.6), (4.4, 157.4)], 'f', prio=4, fib=('dir', 0), nthr=-0.2)
    poly('platysma', [(0.6, 152.0), (8.6, 151.8), (11.0, 146.2), (6.4, 146.6), (0.6, 147.0)], 'f', prio=2, fib=('dir', 62), nthr=-0.2)
    poly('globe_oculaire', [(1.9, 167.8), (4.6, 167.6), (4.8, 166.2), (4.0, 165.5), (2.2, 165.7)], 'f', prio=8, kind='bone', feather=0.25, nthr=0.2)
    poly('pavillon_oreille', [(8.0, 166.4), (9.8, 165.6), (10.0, 160.6), (8.4, 159.6)], 'f', prio=2, kind='fascia', feather=0.3, nthr=-0.7)

    return T
