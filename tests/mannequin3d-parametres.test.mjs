// #265 — Mannequin postural 3D : fonctions pures (aucun WebGL). Les données ne contiennent aucun patient réel.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  CURSEURS,
  PAR_ID,
  TABLEAUX,
  GROUPES,
  POSE_NEUTRE,
  poseDepuisValeurs,
  nettoyerValeurs,
  decrire,
  qAxe,
  qMul,
  qInv,
} from '../js/mannequin3d/parametres.js';

const proche = (a, b, e = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < e);

describe('quaternions', () => {
  it('q · q⁻¹ = identité', () => {
    const q = qMul(qAxe('x', 20), qMul(qAxe('y', -35), qAxe('z', 12)));
    expect(proche(qMul(q, qInv(q)), [0, 0, 0, 1])).toBe(true);
  });
  it('rotation de +90° autour de z envoie +y vers -x (haut → droite du patient)', () => {
    const [x, y, z, w] = qAxe('z', 90);
    // v' = q v q⁻¹ pour v = (0,1,0)
    const t = [2 * (y * 0 - z * 1), 2 * (z * 0 - x * 0), 2 * (x * 1 - y * 0)];
    const v = [
      0 + w * t[0] + (y * t[2] - z * t[1]),
      1 + w * t[1] + (z * t[0] - x * t[2]),
      0 + w * t[2] + (x * t[1] - y * t[0]),
    ];
    expect(Math.round(v[0])).toBe(-1);
    expect(Math.round(v[1])).toBe(0);
  });
});

describe('curseurs', () => {
  it('identifiants uniques, bornes cohérentes, groupes connus', () => {
    const ids = new Set();
    for (const c of CURSEURS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.min).toBeLessThan(c.max);
      expect(c.min <= 0 && c.max >= 0).toBe(true);
      expect(GROUPES.map((g) => g[0])).toContain(c.groupe);
      expect(c.fin).toHaveLength(2);
    }
    expect(CURSEURS.length).toBeGreaterThanOrEqual(40);
  });
  it('chaque curseur latéralisé D a son jumeau G (même plage, même libellé de fin)', () => {
    for (const c of CURSEURS.filter((x) => x.cote === 'D')) {
      const g = PAR_ID[c.id.slice(0, -1) + 'G'];
      expect(g, c.id).toBeTruthy();
      expect([g.min, g.max, g.unite]).toEqual([c.min, c.max, c.unite]);
      expect(g.fin).toEqual(c.fin);
    }
  });
  it('les opérations ne visent que des os du squelette livré', () => {
    const OS_OK =
      /^(root|spine0[1-5]|neck0[1-3]|clavicle\.[LR]|upperarm01\.[LR]|lowerarm0[12]\.[LR]|lowerarm01\.[LR]|upperleg01\.[LR]|lowerleg01\.[LR]|foot\.[LR]|pelvis\.[LR])$/;
    for (const c of CURSEURS)
      for (const o of c.ops(c.max)) {
        if (o.os) expect(o.os, c.id).toMatch(OS_OK);
      }
  });
  it('tableaux types : seuls des curseurs existants, dans leurs bornes', () => {
    for (const k in TABLEAUX)
      for (const [id, v] of Object.entries(TABLEAUX[k].valeurs)) {
        expect(PAR_ID[id], k + '/' + id).toBeTruthy();
        expect(v).toBeGreaterThanOrEqual(PAR_ID[id].min);
        expect(v).toBeLessThanOrEqual(PAR_ID[id].max);
      }
  });
});

describe('pose', () => {
  it('neutre : seulement la pose « bras le long du corps », bassin = identité', () => {
    const P = poseDepuisValeurs({});
    expect(proche(P.bassin, [0, 0, 0, 1])).toBe(true);
    for (const o of POSE_NEUTRE) expect(P.rot[o.os]).toBeTruthy();
    expect(Object.keys(P.pos)).toHaveLength(0);
  });
  it('inclinaison de la tête répartie sur 3 vertèbres cervicales (somme = valeur)', () => {
    const P = poseDepuisValeurs({ tete_incl: 15 });
    let ang = 0;
    for (const n of ['neck01', 'neck02', 'neck03'])
      ang += (2 * Math.asin(P.rot[n][2]) * 180) / Math.PI;
    expect(Math.round(ang)).toBe(15);
  });
  it('bascule du bassin : les jambes reçoivent la rotation inverse (jambes verticales)', () => {
    const P = poseDepuisValeurs({ bassin_bascule: 8, bassin_antev: 10 });
    expect(proche(qMul(P.rot.root, P.rot['pelvis.L']), [0, 0, 0, 1], 1e-9)).toBe(true);
    expect(proche(qMul(P.rot.root, P.rot['pelvis.R']), [0, 0, 0, 1], 1e-9)).toBe(true);
  });
  it('inégalité de 22 mm sur 220 mm de large ≈ 5,7° de bascule', () => {
    const P = poseDepuisValeurs({ bassin_inegalite: 22 });
    expect(Math.round(((2 * Math.asin(P.bassin[2]) * 180) / Math.PI) * 10) / 10).toBe(5.7);
  });
  it('lordose : courbe sans bascule globale (somme des flexions = 0 sur le rachis)', () => {
    const P = poseDepuisValeurs({ tronc_lordose: 20 });
    let s = 0;
    for (const n of ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'])
      s += (2 * Math.asin(P.rot[n][0]) * 180) / Math.PI;
    expect(Math.abs(s)).toBeLessThan(1e-6);
  });
  it('côtés du patient : abduction identique D/G = mouvement symétrique (z opposés)', () => {
    const P = poseDepuisValeurs({ bras_abd_D: 20, bras_abd_G: 20 });
    const l = P.rot['upperarm01.L'],
      r = P.rot['upperarm01.R'];
    expect(Math.sign(l[2])).toBe(-Math.sign(r[2]));
  });
  it('translations en mètres (cm saisis)', () => {
    const P = poseDepuisValeurs({ tete_antep: 6 });
    expect(P.pos.neck02[2]).toBeCloseTo(0.06, 9);
  });
});

describe('enregistrement', () => {
  it('nettoyerValeurs borne, arrondit et retire les zéros et valeurs inconnues', () => {
    const v = nettoyerValeurs({
      tete_incl: 99,
      tronc_incl: 0,
      bassin_bascule: -3.14159,
      inconnu: 5,
      genou_flex_D: 'abc',
    });
    expect(v).toEqual({ tete_incl: 20, bassin_bascule: -3.1 });
  });
  it('compte rendu : une ligne par valeur non nulle, libellés du côté du patient', () => {
    const l = decrire({ tete_incl: -5, genou_valgus_D: 9 });
    expect(l).toEqual(['Inclinaison de la tête : G 5 °', 'Valgus / varus du genou D : valgus 9 °']);
    expect(decrire({})).toEqual([]);
  });
});

describe('isolation du module (règle CLAUDE.md : import dynamique, hors précache)', () => {
  const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  it('index.html ne charge ni Three.js ni le module ; biomeca.js n’importe qu’en dynamique', () => {
    expect(lire('index.html')).not.toMatch(/mannequin3d|vendor\/three/);
    const b = lire('js/biomeca.js');
    expect(b).not.toMatch(/^import .*mannequin3d/m);
    expect(b.match(/import\('\.\/mannequin3d\/index\.js'\)/g)).toHaveLength(2);
  });
  it('le service worker ne précache ni Three.js ni les modèles 3D', () => {
    const sw = lire('service-worker.js');
    const pre = sw.slice(sw.indexOf('PRECACHE_URLS'), sw.indexOf(']', sw.indexOf('PRECACHE_URLS')));
    expect(pre).not.toMatch(/three|mannequin/);
  });
  it('modèles livrés, compressés, et licence de Three.js jointe', () => {
    for (const f of ['homme', 'femme'])
      expect(
        statSync(new URL('../assets/mannequin/' + f + '.glb.gz', import.meta.url)).size
      ).toBeGreaterThan(1e6);
    expect(lire('assets/vendor/three/LICENSE')).toMatch(/MIT License/);
    expect(lire('assets/vendor/three/GLTFLoader.js')).not.toMatch(/from 'three'/);
  });
  it('les deux modèles sont de vrais GLB : squelette + peau + muscles', async () => {
    const { gunzipSync } = await import('node:zlib');
    for (const f of ['homme', 'femme']) {
      const b = gunzipSync(
        readFileSync(new URL('../assets/mannequin/' + f + '.glb.gz', import.meta.url))
      );
      expect(b.toString('latin1', 0, 4)).toBe('glTF');
      const n = b.readUInt32LE(12);
      const j = JSON.parse(b.toString('utf8', 20, 20 + n));
      const noms = j.nodes.map((x) => x.name);
      expect(noms).toEqual(
        expect.arrayContaining(['Corps', 'Muscles', 'root', 'upperarm01.L', 'foot.R', 'neck03'])
      );
      expect(j.skins[0].joints.length).toBeGreaterThan(90);
    }
  });
});
