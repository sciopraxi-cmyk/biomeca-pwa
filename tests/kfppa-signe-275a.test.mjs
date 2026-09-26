import { describe, it, expect } from 'vitest';
import { computeCorrectedAngle as ccaCalc, calcAngle3 as angCalc } from '../js/calc.mjs';
import { charger, envCapture, slotsVierges, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// #275-A — signe du KFPPA : valgus positif, varus négatif
// ═══════════════════════════════════════════════════════════════════
//
// DÉCISION CLINIQUE (praticien) : le signe n'est calculé qu'en vue de face
// AVEC points. Sans points, ou dans une autre vue, la valeur rendue est la
// magnitude NON SIGNÉE — jamais un signe inventé. Une capture dont le signe a
// réellement été calculé porte kfppaSigne:true ; les autres n'ont pas le champ.
//
// DEUX COPIES : computeCorrectedAngle vit dans js/calc.mjs (importée ici) et
// dans js/biomeca.js (celle du navigateur, extraite et exécutée). Chaque
// attente est vérifiée sur les deux.
//
// Chaque test a été vu ROUGE sur un sabotage ciblé, puis vert après
// restauration vérifiée par cmp.

const P = (x, y) => ({ x, y });
const bio = () => charger();

// Capture de démonstration du praticien — aucune donnée patient.
// Image affichée à 1368 px ; attendu D +14,8°, G −7,9°.
const REF_D = [P(732, 139), P(766, 382), P(736, 632)];
const REF_G = [P(957, 145), P(983, 392), P(975, 637)];

// Les deux copies, sous une même signature (rawAng calculé par chacune).
const COPIES = () => {
  const b = bio();
  return [
    ['calc.mjs', (pts, side, view, pSigne) => ccaCalc(angCalc(pts), side, view, 'kfppa', pSigne)],
    [
      'biomeca.js',
      (pts, side, view, pSigne) =>
        b.computeCorrectedAngle(b.calcAngle3(pts), side, view, 'kfppa', pSigne),
    ],
  ];
};

describe('#275-A — computeCorrectedAngle, KFPPA', () => {
  it('A1. Cas de référence du praticien : D +14.8, G −7.9 (deux copies)', () => {
    let n = 0;
    for (const [nom, f] of COPIES()) {
      expect(f(REF_D, 'D', 'face', REF_D).toFixed(1), `${nom} D`).toBe('14.8');
      expect(f(REF_G, 'G', 'face', REF_G).toFixed(1), `${nom} G`).toBe('-7.9');
      // Mêmes points exprimés dans le repère de la SOURCE (1920 px) : l'angle
      // et son signe ne dépendent pas de l'échelle d'affichage.
      const k = 1920 / 1368;
      const D2 = REF_D.map((p) => P(p.x * k, p.y * k));
      const G2 = REF_G.map((p) => P(p.x * k, p.y * k));
      expect(f(D2, 'D', 'face', D2)).toBeCloseTo(f(REF_D, 'D', 'face', REF_D), 9);
      expect(f(G2, 'G', 'face', G2)).toBeCloseTo(f(REF_G, 'G', 'face', REF_G), 9);
      n++;
    }
    expect(n).toBe(2);
  });

  it('A2. Genou sans points : magnitude non signée, jamais un signe inventé', () => {
    for (const [nom, f] of COPIES()) {
      // G est un varus à −7,9 avec points ; sans points, +7,9 — jamais −.
      expect(f(REF_G, 'G', 'face', undefined).toFixed(1), `${nom} G`).toBe('7.9');
      expect(f(REF_D, 'D', 'face', undefined).toFixed(1), `${nom} D`).toBe('14.8');
      expect(f(REF_G, 'G', 'face', null).toFixed(1), `${nom} G null`).toBe('7.9');
    }
  });

  it('A2b. Une CHAÎNE à la place des points (#248) : pas de levée, pas de signe', () => {
    for (const [nom, f] of COPIES()) {
      expect(() => f(REF_G, 'G', 'face', 'kfppa'), nom).not.toThrow();
      expect(f(REF_G, 'G', 'face', 'kfppa').toFixed(1), nom).toBe('7.9');
    }
  });

  it('A3. KFPPA en vue de dos, AVEC points : aucun signe', () => {
    for (const [nom, f] of COPIES()) {
      for (const [pts, side, attendu] of [
        [REF_D, 'D', '14.8'],
        [REF_G, 'G', '7.9'],
        [REF_D, 'G', '14.8'],
        [REF_G, 'D', '7.9'],
      ]) {
        expect(f(pts, side, 'dos', pts).toFixed(1), `${nom} ${side}`).toBe(attendu);
      }
    }
  });

  it('A9. Les deux copies rendent EXACTEMENT les mêmes nombres sur le KFPPA', () => {
    const [[, fc], [, fb]] = COPIES();
    let n = 0;
    for (const pts of [REF_D, REF_G, [P(0, 0), P(-5, 5), P(0, 10)]]) {
      for (const side of ['D', 'G', '']) {
        for (const view of ['face', 'dos', '']) {
          for (const pSigne of [pts, undefined, 'kfppa']) {
            expect(fb(pts, side, view, pSigne)).toBe(fc(pts, side, view, pSigne));
            n++;
          }
        }
      }
    }
    expect(n).toBe(81);
  });
});

describe('#275-A — calcBilateral (#248)', () => {
  it('A4. Reçoit les points et le type KFPPA : angles live signés', () => {
    const env = bio();
    env.poser({ test: 'kfppa-marche' });
    const mk = MARQUEURS_DEMO.map((m) => ({ ...m }));
    expect(env.calcBilateral(mk, 'face', 'D').toFixed(1)).toBe('14.8');
    expect(env.calcBilateral(mk, 'face', 'G').toFixed(1)).toBe('-7.9');
  });
});

describe('#275-A — capture et marqueur kfppaSigne', () => {
  it('A5. Unipodale, vue de face avec points → angle signé, kfppaSigne true', () => {
    const env = bio();
    const t = env.TESTS['kfppa-marche'];
    envCapture(env, 'kfppa-marche', slotsVierges(t));
    env.captureVidPhotoSlot(1); // unipodal G
    env.captureVidPhotoSlot(2); // unipodal D
    const [, g, d] = env.slots();
    expect(g.angle.toFixed(1)).toBe('-7.9');
    expect(d.angle.toFixed(1)).toBe('14.8');
    expect(g.kfppaSigne).toBe(true);
    expect(d.kfppaSigne).toBe(true);
  });

  it('A6. Bipodale → angleD/angleG signés, kfppaSigne true', () => {
    const env = bio();
    const t = env.TESTS['kfppa-marche'];
    envCapture(env, 'kfppa-marche', slotsVierges(t));
    env.captureVidPhotoSlot(0);
    const b = env.slots()[0];
    expect(b.angle).toBeNull();
    expect(b.angleD.toFixed(1)).toBe('14.8');
    expect(b.angleG.toFixed(1)).toBe('-7.9');
    expect(b.kfppaSigne).toBe(true);
  });

  // Marqueurs non placés : aucune mesure, donc aucun signe.
  const NON_PLACES = MARQUEURS_DEMO.map((m) => ({ ...m, x: null, y: null }));

  it('A7a. Capture sans points → kfppaSigne ABSENT', () => {
    const env = bio();
    const t = env.TESTS['kfppa-marche'];
    envCapture(env, 'kfppa-marche', slotsVierges(t), NON_PLACES);
    for (const i of [0, 1, 2]) env.captureVidPhotoSlot(i);
    for (const s of env.slots()) {
      expect(s.angle).toBeNull();
      expect('kfppaSigne' in s, s.label).toBe(false);
    }
  });

  it('A7b. Capture sans points qui REMPLACE une capture signée → marqueur retiré', () => {
    const env = bio();
    const t = env.TESTS['kfppa-marche'];
    const slots = slotsVierges(t).map((s) => ({ ...s, kfppaSigne: true }));
    envCapture(env, 'kfppa-marche', slots, NON_PLACES);
    for (const i of [0, 1, 2]) env.captureVidPhotoSlot(i);
    for (const s of env.slots()) expect('kfppaSigne' in s, s.label).toBe(false);
  });
});

describe('#275-A — enregistrement (_serialiserPhoto)', () => {
  // RÉFÉRENCE : le map tel qu'il était écrit dans validateAndSave avant
  // #275-A, recopié à l'identique. L'objet enregistré doit en être la copie
  // exacte — mêmes champs, même ordre — plus kfppaSigne quand il est posé.
  const ancien = (env, s) => ({
    label: s.label,
    side: s.side,
    dataUrl: s.dataUrl,
    angle: s.angle,
    angleD: s.angleD,
    angleG: s.angleG,
    path: s.path,
    ...env._serialiserMarqueurs(s),
  });

  const SLOTS = [
    {
      label: 'Station bipodale',
      side: '',
      dataUrl: 'data:a',
      angle: null,
      angleD: 14.8,
      angleG: -7.9,
      path: null,
    },
    {
      label: 'Unipodal G',
      side: 'G',
      dataUrl: null,
      angle: -7.9,
      path: 'u/g.jpg',
      markersConnus: true,
      markers: [P(1, 2), P(null, null)],
      dims: { w: 1920, h: 1080 },
    },
    {
      label: 'Unipodal D',
      side: 'D',
      dataUrl: 'data:d',
      angle: 14.8,
      path: null,
      markersConnus: false,
    },
  ];

  it('A8a. Sans marqueur : exactement les champs d’avant, dans le même ordre', () => {
    const env = bio();
    for (const s of SLOTS) {
      const o = env._serialiserPhoto(s);
      expect(o).toStrictEqual(ancien(env, s));
      expect(Object.keys(o)).toEqual(Object.keys(ancien(env, s)));
      expect('kfppaSigne' in o).toBe(false);
    }
    // kfppaSigne:false n'est jamais écrit : son absence porte le sens.
    expect('kfppaSigne' in env._serialiserPhoto({ ...SLOTS[2], kfppaSigne: false })).toBe(false);
  });

  it('A8b. Avec marqueur : les champs d’avant, plus kfppaSigne:true', () => {
    const env = bio();
    for (const s of SLOTS) {
      const o = env._serialiserPhoto({ ...s, kfppaSigne: true });
      expect(o).toStrictEqual({ ...ancien(env, s), kfppaSigne: true });
      expect(Object.keys(o).sort()).toEqual([...Object.keys(ancien(env, s)), 'kfppaSigne'].sort());
    }
  });
});

describe('#275-A — la condition écrite deux fois reste d’accord', () => {
  // _kfppaSigneCalcule recopie la condition de la branche signée de
  // computeCorrectedAngle. On ne compare pas leurs TEXTES : on OBSERVE si un
  // signe a été calculé. Un signe calculé s'inverse quand on reflète les
  // points (x → −x) ; une magnitude non signée, ou un signe posé sur le seul
  // côté, ne bouge pas.
  const signeObserve = (env, type, vue, cote, pts) => {
    const brut = env.calcAngle3(REF_D);
    const miroir = Array.isArray(pts) ? pts.map((p) => P(-p.x, p.y)) : pts;
    let a, b;
    try {
      a = env.computeCorrectedAngle(brut, cote, vue, type, pts);
      b = env.computeCorrectedAngle(brut, cote, vue, type, miroir);
    } catch (_e) {
      // Une levée n'est pas un signe calculé. Elle est comptée à part, et la
      // liste des cas qui lèvent est elle-même vérifiée plus bas.
      return { valeur: null, signe: false, leve: true };
    }
    return {
      valeur: a,
      signe: a !== null && a !== 0 && Math.sign(a) === -Math.sign(b),
      leve: false,
    };
  };
  const GRILLE = [];
  for (const type of ['kfppa', 'mla', ''])
    for (const vue of ['face', 'dos', ''])
      for (const cote of ['D', 'G', ''])
        for (const pts of [REF_D, undefined, 'chaine']) GRILLE.push([type, vue, cote, pts]);

  it('A10. _kfppaSigneCalcule ⇔ signe KFPPA réellement calculé, sur toute la grille', () => {
    const env = bio();
    const desaccordsLitteraux = [];
    const levees = [];
    let n = 0;
    for (const [type, vue, cote, pts] of GRILLE) {
      const { valeur, signe, leve } = signeObserve(env, type, vue, cote, pts);
      const dit = env._kfppaSigneCalcule(type, vue, cote, pts, valeur);
      const cas = `${type || "''"}/${vue || "''"}/${cote || "''"}/${Array.isArray(pts) ? 'pts' : String(pts)}`;
      if (leve) levees.push(cas);
      // Le marqueur ne concerne que le KFPPA : les branches génériques signent
      // AUSSI le type '' (arrière-pied en dos, frames en face), et ce signe-là
      // n'est pas un signe valgus/varus de KFPPA.
      expect(dit, cas).toBe(type === 'kfppa' && signe);
      if (dit !== signe) desaccordsLitteraux.push(cas);
      n++;
    }
    expect(n).toBe(81);
    // La restriction au KFPPA n'écarte QUE les signes génériques du type '' :
    // exactement ces quatre cas, pas un de plus. Sans cette ligne, la
    // restriction pourrait masquer n'importe quelle dérive.
    expect(desaccordsLitteraux.sort()).toEqual(
      ["''/dos/D/pts", "''/dos/G/pts", "''/face/D/pts", "''/face/G/pts"].sort()
    );
    // DANGER #248 RÉSIDUEL, hors KFPPA : les branches génériques lèvent encore
    // sur une chaîne passée à la place des points. Aucun appelant ne le fait
    // plus depuis la correction de calcBilateral ; le KFPPA, lui, ne lève
    // jamais (A2b). Liste figée pour qu'une extension se voie.
    expect(levees.sort()).toEqual(
      [
        "''/dos/''/chaine",
        "''/dos/D/chaine",
        "''/dos/G/chaine",
        "''/face/''/chaine",
        "''/face/D/chaine",
        "''/face/G/chaine",
      ].sort()
    );
  });

  it('A10b. Valeur nulle → jamais de marqueur', () => {
    const env = bio();
    expect(env._kfppaSigneCalcule('kfppa', 'face', 'D', REF_D, null)).toBe(false);
    expect(env.computeCorrectedAngle(null, 'D', 'face', 'kfppa', REF_D)).toBeNull();
  });
});
