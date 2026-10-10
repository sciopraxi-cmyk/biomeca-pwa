import { describe, it, expect } from 'vitest';
import { charger } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// U0 — substitution d'identité au calage des capteurs (cas C)
// ═══════════════════════════════════════════════════════════════════
//
// Essai réel du praticien (KFPPA Marche, pastilles nettes) : le point EIAS G
// a été posé sur la pastille de la ROTULE G et marqué « pastille » ; la rotule
// G est restée hors de toute pastille ; l'angle G affiché valait −62,9°. Une
// valeur fausse, comptée comme mesure (la règle 1c n'écarte que « defaut »).
// Cause (lue dans le code, reproduite) : quand un côté n'a pas le compte exact,
// le repli par PROXIMITÉ attribue chaque tache au point dont la position
// actuelle est la plus proche, sans contrôle d'ordre ni d'identité.
//
// Règle U0 (décision du praticien) : pour les côtés D et G, plus de repli par
// proximité. Un côté n'est calé qu'avec compte exact, ordre vertical et écarts
// plausibles, ou par les groupes du verrou (#272-C) ; sinon REFUS du côté
// entier — aucun point déplacé ni réétiqueté — et la raison au bilan (nombre
// de taches, « identité incertaine »), sans la phrase « chaussures claires ».
// Le MLA, sans latéralité, garde la proximité.
// H5 (décision du praticien) : sur un côté refusé, les points « pastille »
// gardent leur position mais passent à « defaut » (non vérifiés sur cette
// image : valeur exclue, règle 1c) ; « main » reste intact (verrou) ;
// « defaut » reste tel quel. Le bilan le dit (« points remis en non ajustés »).
// Données synthétiques : images noires à disques blancs, coordonnées inventées
// ou reprises (affichage réduit) de la capture d'écran du praticien.

const canevas = (w, h) => ({
  width: w,
  height: h,
  style: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
});
const image = (w, h, disques) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (const [cx, cy] of disques) {
    for (let y = cy - 5; y <= cy + 5; y++)
      for (let x = cx - 5; x <= cx + 5; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 25)
          data.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 3);
  }
  return { data };
};
// Calage : positions par défaut, surcharges { index: {x, y, origine} }, image.
function caler(test, W, H, disques, surcharges = {}) {
  const env = charger({ persistance: true });
  env.poser({ test });
  const t = env.TESTS[test];
  const mk = env.cloneMarkers(t.markers);
  env.detectMarkersAuto(null, canevas(W, H), mk, t.view, null);
  for (const [i, o] of Object.entries(surcharges)) Object.assign(mk[i], o);
  const avant = JSON.parse(JSON.stringify(mk));
  env.poser({
    marqueurs: mk,
    image: image(W, H, disques),
    elements: { 'vid-el': { readyState: 4 }, 'vid-canvas': canevas(W, H) },
  });
  env.snapMarkersToReflectiveBlobs();
  return { avant, apres: env.vid(), bilan: env.alertes().join('\n') };
}
const pos = (m) => [Math.round(m.x), Math.round(m.y), m.origine];
const xy = (pts) => pts.map((m) => [m.x, m.y]);
const origines = (pts) => pts.map((m) => m.origine);
// Aucun point « pastille » hors de la pastille de SON repère : `verite` donne,
// par nom de point, la pastille réelle (ou null si elle n'est pas visible).
const substitutions = (apres, verite) =>
  apres
    .filter((m) => m.origine === 'pastille')
    .filter((m) => {
      const p = verite[m.name];
      return !p || Math.hypot(m.x - p[0], m.y - p[1]) > 6;
    })
    .map((m) => m.name);

// ─── Cas C, variante (a) — reprise de l'essai réel (affichage, x − 14) ───
// Les deux jambes à DROITE du milieu de l'image (681) : les six pastilles
// tombent du même côté de la ligne de séparation. Positions de départ côté G
// restées d'un placement précédent, l'EIAS G près de la rotule G.
const WA = 1363;
const HA = 1000;
const VERITE_A = {
  'EIAS D': [776, 402],
  'Rotule D': [773, 598],
  'Tarse D': [769, 894],
  'EIAS G': [909, 410],
  'Rotule G': [898, 600],
  'Tarse G': [881, 886],
};
const DEPART_G = {
  3: { x: 916, y: 560, origine: 'pastille' },
  4: { x: 967, y: 796, origine: 'defaut' },
  5: { x: 881, y: 880, origine: 'pastille' },
};

// ─── Cas C, variante (b) — pastille de l'EIAS G manquante ───
// Jambes de part et d'autre du milieu (640) ; côté D complet ; côté G : seules
// la rotule et le tarse sont visibles ; EIAS G partie près de la rotule G.
const WB = 1280;
const HB = 1000;
const VERITE_B = {
  'EIAS D': [400, 402],
  'Rotule D': [397, 598],
  'Tarse D': [393, 894],
  'EIAS G': null,
  'Rotule G': [898, 600],
  'Tarse G': [881, 886],
};

describe('U0 — cas C : refus plutôt que substitution', () => {
  it('U1. (a) Jambes du même côté de la séparation, 6 pastilles : positions inchangées, « pastille » → « defaut » côté G, raison au bilan', () => {
    const { avant, apres, bilan } = caler(
      'kfppa-marche',
      WA,
      HA,
      Object.values(VERITE_A),
      DEPART_G
    );
    expect(
      substitutions(apres, VERITE_A),
      'aucun point « pastille » sur le mauvais repère'
    ).toEqual([]);
    expect(xy(apres), 'aucun point déplacé').toEqual(xy(avant));
    expect(origines(apres.slice(3)), 'côté G : « pastille » remis à « defaut »').toEqual([
      'defaut',
      'defaut',
      'defaut',
    ]);
    expect(origines(apres.slice(0, 3)), 'côté D : « defaut » tel quel').toEqual(
      origines(avant.slice(0, 3))
    );
    expect(bilan).toMatch(/Côté G[^\n]*5 tache\(s\)[^\n]*identité incertaine/);
    expect(bilan).toMatch(/Côté G[^\n]*points remis en non ajustés : EIAS G, Tarse G/);
    expect(bilan).not.toContain('chaussures claires');
  });

  it('U2. (b) EIAS G manquante, départ près de la rotule : côté G refusé (positions inchangées, « pastille » → « defaut ») ; côté D calé', () => {
    const { avant, apres, bilan } = caler(
      'kfppa-marche',
      WB,
      HB,
      Object.values(VERITE_B).filter(Boolean),
      DEPART_G
    );
    expect(
      substitutions(apres, VERITE_B),
      'aucun point « pastille » sur le mauvais repère'
    ).toEqual([]);
    expect(xy(apres.slice(3)), 'côté G : positions inchangées').toEqual(xy(avant.slice(3)));
    expect(origines(apres.slice(3)), 'côté G : « pastille » remis à « defaut »').toEqual([
      'defaut',
      'defaut',
      'defaut',
    ]);
    expect(apres.slice(0, 3).map(pos), 'côté D calé dans l’ordre').toEqual([
      [400, 402, 'pastille'],
      [397, 598, 'pastille'],
      [393, 894, 'pastille'],
    ]);
    expect(bilan).toMatch(/Côté G[^\n]*2 tache\(s\) pour 3 point\(s\)[^\n]*identité incertaine/);
    expect(bilan).toMatch(/Côté G[^\n]*points remis en non ajustés : EIAS G, Tarse G/);
    expect(bilan).not.toContain('chaussures claires');
  });

  it('U3. Garde KFPPA « hanche, cheville, chaussure » (écarts 454/59), départ PROCHE des taches : côté refusé, intact', () => {
    // Compte exact mais répartition implausible : la branche par ordre refuse ;
    // le repli par proximité ne doit pas calquer quand même deux points.
    const D = [
      [400, 120],
      [398, 574],
      [396, 633],
    ];
    const depart = {
      0: { x: 405, y: 140, origine: 'defaut' },
      1: { x: 402, y: 380, origine: 'defaut' },
      2: { x: 399, y: 600, origine: 'defaut' },
    };
    const { avant, apres, bilan } = caler('kfppa-marche', 1280, 720, D, depart);
    expect(JSON.stringify(apres.slice(0, 3)), 'côté D inchangé').toBe(
      JSON.stringify(avant.slice(0, 3))
    );
    expect(bilan).toMatch(/Côté D[^\n]*identité incertaine/);
  });

  it('U4. Côté refusé contenant un point « main » : ce point reste « main », intact ; « pastille » → « defaut »', () => {
    // Rotule D verrouillée hors tache, deux taches au-dessus : refus (#272-C).
    const P = [
      [165, 80],
      [170, 185],
      [168, 290],
    ];
    const { avant, apres, bilan } = caler('kfppa-marche', 640, 360, P, {
      0: { x: 150, y: 60, origine: 'pastille' },
      1: { x: 230, y: 200, origine: 'main' },
      2: { x: 160, y: 300, origine: 'pastille' },
    });
    expect(xy(apres.slice(0, 3)), 'positions inchangées').toEqual(xy(avant.slice(0, 3)));
    expect(origines(apres.slice(0, 3))).toEqual(['defaut', 'main', 'defaut']);
    expect(bilan).toMatch(
      /Côté D : calage refusé[^\n]*points remis en non ajustés : EIAS D, Tarse D/
    );
  });

  it('U5. Côté refusé sans aucun point « pastille » au départ : rien ne change', () => {
    const depart = Object.fromEntries(
      Object.entries(DEPART_G).map(([i, o]) => [i, { ...o, origine: 'defaut' }])
    );
    const { avant, apres, bilan } = caler('kfppa-marche', WA, HA, Object.values(VERITE_A), depart);
    expect(JSON.stringify(apres), 'rien ne change').toBe(JSON.stringify(avant));
    expect(bilan).toMatch(/Côté G[^\n]*identité incertaine/);
    expect(bilan, 'aucun point à remettre').not.toContain('remis en non ajustés');
  });
});

describe('U0 — témoins (verts sur main)', () => {
  it('T1. KFPPA, compte exact et ordre correct des deux côtés : les 6 points sont calés', () => {
    const P = [
      [400, 402],
      [397, 598],
      [393, 894],
      [909, 410],
      [898, 600],
      [881, 886],
    ];
    const { apres } = caler('kfppa-marche', 1280, 1000, P);
    expect(apres.map(pos)).toEqual(P.map(([x, y]) => [x, y, 'pastille']));
  });

  it('T2. MLA (sans latéralité) : la proximité cale toujours les trois points', () => {
    const { apres } = caler('mla-marche', 640, 360, [
      [140, 230],
      [322, 110],
      [500, 236],
    ]);
    const n = (nom) => pos(apres.find((m) => m.name === nom));
    expect([n('FMHp'), n('TN'), n('CAp')]).toEqual([
      [140, 230, 'pastille'],
      [322, 110, 'pastille'],
      [500, 236, 'pastille'],
    ]);
  });

  it('T3. Garde KFPPA « hanche, cheville, chaussure », départ ÉLOIGNÉ : côté refusé, intact', () => {
    const D = [
      [560, 120],
      [558, 574],
      [556, 633],
    ];
    const { avant, apres } = caler('kfppa-marche', 1280, 720, D);
    expect(JSON.stringify(apres.slice(0, 3))).toBe(JSON.stringify(avant.slice(0, 3)));
  });

  it('T4. Verrou #272-C intact : rotule D verrouillée sur sa pastille, EIAS et tarse D calés autour', () => {
    const { apres } = caler(
      'kfppa-marche',
      640,
      360,
      [
        [165, 80],
        [170, 185],
        [168, 290],
      ],
      { 1: { x: 172, y: 187, origine: 'main' } }
    );
    expect(apres.slice(0, 3).map(pos)).toEqual([
      [165, 80, 'pastille'],
      [172, 187, 'main'],
      [168, 290, 'pastille'],
    ]);
  });
});
