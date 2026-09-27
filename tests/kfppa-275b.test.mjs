import { describe, it, expect } from 'vitest';
import { charger, envCapture, slotsVierges } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// #275-B — le créneau bipodal du KFPPA ne porte plus d'angle unique
// ═══════════════════════════════════════════════════════════════════
//
// CE QUI EST GARDÉ ICI
// Le créneau « Station bipodale » n'a pas de côté : l'angle unique qu'il
// portait était mesuré sur six points à cheval sur les deux jambes (relevé
// par le praticien : 124,0° jambes droites), et il entrait dans Δ et dans le
// pourcentage. Depuis #275-B :
//   - la vignette affiche « D x° · G y° », jamais l'angle unique ;
//   - Δ se calcule depuis angleD/angleG, sans repli sur data.deltaD/pctD ;
//   - un bilan antérieur sans angleD/angleG le dit, dans cinq sites :
//     écran de résultats, alertes, aperçu, lignes du rapport, jauge du rapport.
//
// MÉTHODE
// Les fonctions sont EXTRAITES de js/biomeca.js — la copie qui s'exécute dans
// le navigateur — et exécutées, jamais comparées par texte. Le DOM est
// remplacé par des bouchons minimaux, dans tests/helpers/harnais-kfppa.mjs.
//
// Chaque test a été vu ROUGE sur un sabotage ciblé de js/biomeca.js, puis
// vert après restauration (démonstration du 26/09/2026, douze sabotages, un
// par test, restauration vérifiée par cmp) : un test qui n'a jamais échoué ne
// prouve pas qu'il sait échouer.

// ─── Jeux de données ───
//
// Les angles ci-dessous sont des valeurs construites pour ces tests, pas des
// relevés : seule leur structure (quels champs existent) compte.

// Ancien bilan : le nombre faux (124,0°) dans `angle`, les bonnes valeurs
// par jambe dans angleD/angleG, et des delta/pct enregistrés FAUX.
const photosAncienAvecDG = () => [
  {
    label: 'Station bipodale',
    side: '',
    dataUrl: 'data:a',
    angle: 124.0,
    angleD: 3.1,
    angleG: 2.4,
  },
  { label: 'Valgum dynamique unipodal G', side: 'G', dataUrl: 'data:b', angle: 7.8 },
  { label: 'Valgum dynamique unipodal D', side: 'D', dataUrl: 'data:c', angle: 14.8 },
];
const bilanAncienAvecDG = () => ({
  photos: photosAncienAvecDG(),
  deltaD: 14.8 - 124.0,
  deltaG: 7.8 - 124.0,
  pctD: (14.8 - 124.0) / 5,
  pctG: (7.8 - 124.0) / 5,
});

// Ancien bilan SANS angleD/angleG : seul le nombre faux existe. La photo
// bipodale n'a plus de dataURL — retirée après envoi vers le stockage —
// seul `path` subsiste : c'est le cas réel le plus courant.
const bilanAncienSansDG = () => ({
  photos: [
    { label: 'Station bipodale', side: '', path: 'u/b.jpg', angle: 124.0 },
    { label: 'Valgum dynamique unipodal G', side: 'G', path: 'u/g.jpg', angle: 7.8 },
    { label: 'Valgum dynamique unipodal D', side: 'D', path: 'u/d.jpg', angle: 14.8 },
  ],
  deltaD: 14.8 - 124.0,
  deltaG: 7.8 - 124.0,
  pctD: (14.8 - 124.0) / 5,
  pctG: (7.8 - 124.0) / 5,
});

// Le même, ROUVERT dans l'écran de capture : prefetchSportPhotos a réhydraté
// les dataURLs depuis `path`. C'est l'état que voit updateResults.
//
// LIMITE CONNUE, NON COUVERTE ICI : si la réhydratation échoue, updateResults
// ne regarde que dataUrl pour décider d'afficher les cartes, et bascule sur
// « Capturez 3 photos » — le message n'apparaît alors pas. Signalé, non tranché.
const photosAncienSansDGRehydratees = () =>
  bilanAncienSansDG().photos.map((p) => ({ ...p, dataUrl: 'data:' + p.path }));

// Bilan récent : angle unique nul, mesures par jambe présentes.
const bilanNormal = () => ({
  photos: [
    {
      label: 'Station bipodale',
      side: '',
      dataUrl: 'data:a',
      angle: null,
      angleD: 2.0,
      angleG: 1.5,
    },
    { label: 'Valgum dynamique unipodal G', side: 'G', dataUrl: 'data:b', angle: 6.5 },
    { label: 'Valgum dynamique unipodal D', side: 'D', dataUrl: 'data:c', angle: 7.0 },
  ],
  deltaD: 5.0,
  deltaG: 5.0,
  pctD: 1.0,
  pctG: 1.0,
});

const nbOcc = (txt, motif) => txt.split(motif).length - 1;

// ═══════════════════════════════════════════════════════════════════
describe('#275-B — vignette du créneau bipodal', () => {
  it('B1. Ancien bilan avec le nombre faux ET D/G → D/G affichés, jamais 124', () => {
    const env = charger();
    env.poser({ test: 'kfppa-marche' });
    const html = env.vidPhotoSlotHTML(photosAncienAvecDG()[0], 0);
    expect(html).toContain('D 3.1° · G 2.4°');
    expect(html, 'le nombre faux ne doit plus être lu').not.toContain('124');
  });

  it('B2. Ancien bilan avec D/G absents → « D — · G — », sans repli sur angle', () => {
    const env = charger();
    env.poser({ test: 'kfppa-marche' });
    const slot = { label: 'Station bipodale', side: '', dataUrl: 'data:a', angle: 124.0 };
    const html = env.vidPhotoSlotHTML(slot, 0);
    expect(html).toContain('D — · G —');
    expect(html).not.toContain('124');
  });
});

describe('#275-B — nouvelle capture bipodale', () => {
  it('B3. Angle unique nul, D/G enregistrés, photo présente', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const res = envCapture(env, 'kfppa-marche', slotsVierges(t));
    env.captureVidPhotoSlot(0);
    const s = env.slots()[0];
    expect(s.angle, 'plus d’angle unique à cheval sur les deux jambes').toBeNull();
    expect(typeof s.angleD).toBe('number');
    expect(typeof s.angleG).toBe('number');
    expect(Number.isFinite(s.angleD) && Number.isFinite(s.angleG)).toBe(true);
    expect(s.dataUrl).toBeTruthy();
    // La photo existe : la vignette montre l'image, pas l'emplacement vide.
    const html = env.vidPhotoSlotHTML(s, 0);
    expect(html).toContain('<img');
    expect(html).not.toContain('vig-vide');
    expect(html).toMatch(/D -?\d+\.\d° · G -?\d+\.\d°/);
    // L'écran de résultats la voit aussi : pas de consigne « Capturez ».
    expect(res.innerHTML).toContain('Genou Droit');
    expect(res.innerHTML).not.toContain('Capturez 3 photos');
  });
});

describe('#275-B — ligne du rapport', () => {
  it('B4. Degrés et pourcentage issus de la MÊME valeur', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const html = env.buildPrintSection(t, bilanAncienAvecDG(), []);
    const lignes = [...html.matchAll(/KFPPA = (-?\d+\.\d)° \((-?\d+)%\)/g)];
    expect(lignes.length, 'une ligne par genou').toBe(2);
    for (const [, deg, pct] of lignes) {
      expect(Number(pct)).toBe(Math.round((Number(deg) / t.div) * 100));
    }
    // Et ce sont les valeurs recalculées, pas data.deltaD/G.
    expect(lignes[0][1]).toBe((14.8 - 3.1).toFixed(1));
    expect(lignes[1][1]).toBe((7.8 - 2.4).toFixed(1));
  });
});

describe('#275-B — ancien bilan sans angleD/angleG : le message, dans les cinq sites', () => {
  it('B5a. Écran de résultats (updateResults)', () => {
    const env = charger();
    const res = envCapture(env, 'kfppa-marche', photosAncienSansDGRehydratees());
    env.updateResults();
    expect(nbOcc(res.innerHTML, env.KFPPA_NON_RECALC), 'un message par genou').toBe(2);
  });

  it('B5b. Alertes (_collectTestAlerts)', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const alertes = env._collectTestAlerts(t, bilanAncienSansDG());
    expect(alertes.filter((a) => a.includes(env.KFPPA_NON_RECALC))).toHaveLength(2);
  });

  it('B5c. Aperçu (buildSidePreview)', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    for (const side of ['D', 'G']) {
      const html = env.buildSidePreview(side, t, bilanAncienSansDG());
      expect(html, side).toContain(env.KFPPA_NON_RECALC);
      // Cible le pourcentage AFFICHÉ, texte d'un élément (`>…%<`). Le HTML de
      // la jauge contient aussi top:50% et translate(-50%,-50%) : un motif
      // « nombre% » nu échouait sur eux, sans rapport avec la mesure.
      expect(html, `${side} : aucun pourcentage tiré des valeurs enregistrées`).not.toMatch(
        />-?\d+%</
      );
    }
  });

  it('B5d. Lignes du rapport (buildPrintSection)', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const html = env.buildPrintSection(t, bilanAncienSansDG(), []);
    expect(html).toContain(`<strong>Genou droit :</strong> ${env.KFPPA_NON_RECALC}`);
    expect(html).toContain(`<strong>Genou gauche :</strong> ${env.KFPPA_NON_RECALC}`);
    expect(html).not.toContain('KFPPA =');
  });

  it('B5e. Jauge du rapport (buildPrintSide)', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    for (const side of ['D', 'G']) {
      const html = env.buildPrintSide(side, t, bilanAncienSansDG());
      expect(html, side).toContain(env.KFPPA_NON_RECALC);
      expect(html, `${side} : aucun pourcentage`).not.toMatch(/rp-gauge-pct[^>]*>-?\d+%/);
    }
  });
});

describe('#275-B — un bilan normal rendu JUSTE APRÈS un ancien', () => {
  it('B6. Aucun message, aucun plantage, dans les cinq sites', () => {
    // UN SEUL environnement pour les deux rendus : c'est précisément ce qui
    // révélerait un drapeau partagé d'un rendu au suivant.
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const M = env.KFPPA_NON_RECALC;

    // Rendu de l'ancien d'abord, dans chaque site.
    const resA = envCapture(env, 'kfppa-marche', photosAncienSansDGRehydratees());
    env.updateResults();
    expect(resA.innerHTML).toContain(M);
    env._collectTestAlerts(t, bilanAncienSansDG());
    env.buildSidePreview('D', t, bilanAncienSansDG());
    env.buildSidePreview('G', t, bilanAncienSansDG());
    env.buildPrintSection(t, bilanAncienSansDG(), []);
    env.buildPrintSide('D', t, bilanAncienSansDG());
    env.buildPrintSide('G', t, bilanAncienSansDG());

    // Puis le bilan normal.
    const resN = envCapture(env, 'kfppa-marche', bilanNormal().photos);
    env.updateResults();
    const sorties = {
      resultats: resN.innerHTML,
      alertes: env._collectTestAlerts(t, bilanNormal()).join('\n'),
      apercuD: env.buildSidePreview('D', t, bilanNormal()),
      apercuG: env.buildSidePreview('G', t, bilanNormal()),
      rapport: env.buildPrintSection(t, bilanNormal(), []),
      jaugeD: env.buildPrintSide('D', t, bilanNormal()),
      jaugeG: env.buildPrintSide('G', t, bilanNormal()),
    };
    for (const [site, txt] of Object.entries(sorties)) {
      expect(txt, `${site} : message hérité du rendu précédent`).not.toContain(M);
    }
    // Et les mesures du bilan normal sont bien là.
    expect(sorties.rapport).toContain('KFPPA = 5.0° (100%)');
    expect(sorties.apercuD).toContain('5.0°');
    // TÉMOIN des motifs de B5c et B5e : ils savent trouver un pourcentage
    // affiché quand il existe. Sans cela, leur « not.toMatch » pourrait être
    // vert parce que le motif ne trouve jamais rien.
    expect(sorties.apercuD).toMatch(/>-?\d+%</);
    expect(sorties.jaugeD).toMatch(/rp-gauge-pct[^>]*>-?\d+%/);
  });
});

describe('#275-B — mobilité AP inchangée', () => {
  it('B7a. La vignette de mobilité garde son angle, sans D/G', () => {
    const env = charger();
    env.poser({ test: 'mobilite' });
    const slot = {
      label: 'Inversion forcée bipodal',
      side: '',
      dataUrl: 'data:m',
      angle: 12.3,
      angleD: 18.0,
      angleG: 16.0,
    };
    const html = env.vidPhotoSlotHTML(slot, 0);
    expect(html).toContain('12.3°');
    expect(html).not.toContain(' · G ');
  });

  it('B7b. La capture de mobilité conserve son angle unique', () => {
    const env = charger();
    const t = env.TESTS['mobilite'];
    envCapture(env, 'mobilite', slotsVierges(t));
    env.captureVidPhotoSlot(0);
    const s = env.slots()[0];
    expect(typeof s.angle, 'la mobilité garde son angle').toBe('number');
    expect(typeof s.angleD).toBe('number');
    expect(typeof s.angleG).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════
// #275-B, suite — nouvelle capture bipodale et photo bipodale manquante
// ═══════════════════════════════════════════════════════════════════

// Nouvelle capture bipodale : angle unique nul, mesures par jambe présentes.
// Valeurs de la vérification du praticien sur localhost (D +11,2°, G −3,4°).
const bipNouveau = () => ({
  label: 'Station bipodale',
  side: '',
  dataUrl: 'data:bip',
  angle: null,
  angleD: 11.2,
  angleG: -3.4,
  kfppaSigne: true,
});

describe('#275-B — vignette agrandie et miniature, nouvelle capture', () => {
  it('B8a. ouvrirVignette : pas de plantage, « D x° · G y° » affiché', () => {
    const env = charger();
    const classes = new Set();
    const ang = { textContent: '', style: {} };
    env.poser({
      test: 'kfppa-marche',
      slots: [bipNouveau()],
      elements: {
        'modal-vignette': {
          classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
        },
        'vig-modal-img': {},
        'vig-modal-lbl': { textContent: '' },
        'vig-modal-ang': ang,
      },
    });
    expect(() => env.ouvrirVignette(0)).not.toThrow();
    expect(classes.has('ouverte')).toBe(true);
    expect(ang.textContent).toBe('D 11.2° · G -3.4°');
    expect(ang.style.display).toBe('');
  });

  it('B8b. buildPhotoMini : pas de plantage, « D x° · G y° » sous la photo bipodale', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const data = {
      photos: [bipNouveau(), { label: 'U D', side: 'D', dataUrl: 'data:d', angle: 11.2 }],
    };
    let html;
    expect(() => (html = env.buildPhotoMini(data, 'D', t))).not.toThrow();
    expect(html).toContain('D 11.2° · G -3.4°');
  });

  it('B8c. buildPhotoMini : les frames gardent leur angle, pas de « D — · G — »', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const data = { photos: [], frames: [{ dataUrl: 'data:f0', angD: 4.2, angG: 1.1 }] };
    const html = env.buildPhotoMini(data, 'D', t);
    expect(html).toContain('4.2°');
    expect(html).not.toContain('D — · G —');
  });
});

// Nouveau bilan INCOMPLET : créneau bipodal jamais capturé, unipodaux présents.
const photosSansBipodal = () => [
  { label: 'Station bipodale', side: '', dataUrl: null, angle: null, path: null },
  {
    label: 'Valgum dynamique unipodal G',
    side: 'G',
    dataUrl: 'data:g',
    angle: -3.4,
    kfppaSigne: true,
  },
  {
    label: 'Valgum dynamique unipodal D',
    side: 'D',
    dataUrl: 'data:d',
    angle: 11.2,
    kfppaSigne: true,
  },
];

describe('#275-B — photo bipodale manquante : message distinct, cinq sites', () => {
  const verifier = (env, txt, site) => {
    expect(txt, site).toContain(env.KFPPA_BIP_MANQUANTE);
    expect(txt, `${site} : ce n'est pas un bilan antérieur`).not.toContain(env.KFPPA_NON_RECALC);
  };

  it('B9a. Écran de résultats', () => {
    const env = charger();
    const res = envCapture(env, 'kfppa-marche', photosSansBipodal());
    env.updateResults();
    expect(nbOcc(res.innerHTML, env.KFPPA_BIP_MANQUANTE), 'un message par genou').toBe(2);
    verifier(env, res.innerHTML, 'résultats');
  });

  it('B9b. Alertes', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const a = env._collectTestAlerts(t, { photos: photosSansBipodal() });
    expect(a.filter((x) => x.includes(env.KFPPA_BIP_MANQUANTE))).toHaveLength(2);
    verifier(env, a.join('\n'), 'alertes');
  });

  it('B9c. Aperçu', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    for (const side of ['D', 'G'])
      verifier(env, env.buildSidePreview(side, t, { photos: photosSansBipodal() }), side);
  });

  it('B9d. Lignes du rapport', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const html = env.buildPrintSection(t, { photos: photosSansBipodal() }, []);
    expect(html).toContain(`<strong>Genou droit :</strong> ${env.KFPPA_BIP_MANQUANTE}`);
    expect(html).toContain(`<strong>Genou gauche :</strong> ${env.KFPPA_BIP_MANQUANTE}`);
    verifier(env, html, 'rapport');
  });

  it('B9e. Jauge du rapport', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    for (const side of ['D', 'G'])
      verifier(env, env.buildPrintSide(side, t, { photos: photosSansBipodal() }), side);
  });

  it('B10a. _kfppaEtatBipodal : les quatre états', () => {
    const env = charger();
    const e = env._kfppaEtatBipodal;
    expect(e([bipNouveau()], 'G')).toBe('ok');
    expect(e([{ side: '', path: 'u/b.jpg', angle: 124 }], 'D')).toBe('nonRecalc');
    expect(e(photosSansBipodal(), 'D')).toBe('manquante');
    expect(
      e(
        [
          { side: '', dataUrl: null },
          { side: 'D', dataUrl: null },
        ],
        'D'
      )
    ).toBe('vide');
    expect(e(undefined, 'D')).toBe('vide');
  });

  it('B10b. Photo UNIPODALE absente, bipodale présente : un tiret, aucun des deux messages', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    const data = {
      photos: [bipNouveau(), { label: 'U G', side: 'G', dataUrl: null, angle: null }],
    };
    const html = env.buildPrintSection(t, data, []);
    expect(html).toContain('<strong>Genou gauche :</strong> —');
    expect(html).not.toContain(env.KFPPA_NON_RECALC);
    expect(html).not.toContain(env.KFPPA_BIP_MANQUANTE);
  });
});
