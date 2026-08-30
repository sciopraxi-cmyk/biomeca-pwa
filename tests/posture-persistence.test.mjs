import { describe, it, expect } from 'vitest';
import { extraireBloc, fabriquerAvecDependances } from './helpers/mirror-diff.mjs';

// ═══════════════════════════════════════════════════════════════════
// #243 / #246 — persistance posturale : ne jamais faire passer un
//               ACCIDENT pour un CHOIX du praticien
// ═══════════════════════════════════════════════════════════════════
//
// Les fonctions couvertes ici vivent dans js/biomeca.js, qui n'est PAS un
// module ES. Elles sont extraites entre marqueurs — le même mécanisme que
// #47, mais une finalité différente : ces blocs n'ont AUCUN miroir, les
// marqueurs servent uniquement à les rendre testables.
//
// Trois blocs sont concaténés parce qu'ils dépendent les uns des autres :
// POSTURE et CLASSIFY appellent _coord et _isPlacedPt, qui vivent dans COORD.
//
// Règle de fond, tranchée par le praticien :
//   'absent'    aucune coordonnée écrite → CHOIX → la vue n'apparaît pas
//   'endommage' des coordonnées écrites mais inexploitables → ACCIDENT →
//               la vue apparaît, avec « mesure incomplète » visible
//   'intact'    tout ce qui a été écrit est exploitable
// Une mesure absente se voit ; une mesure fausse se croit.

const BLOC_COORD = extraireBloc('js/biomeca.js', '#243 COORD — DÉBUT', '#243 COORD — FIN');
const BLOC_POSTURE = extraireBloc('js/biomeca.js', '#243 POSTURE — DÉBUT', '#243 POSTURE — FIN');
const BLOC_CLASSIFY = extraireBloc('js/biomeca.js', '#243 CLASSIFY — DÉBUT', '#243 CLASSIFY — FIN');

const NOMS = [
  '_coord',
  '_isPlacedPt',
  '_estDemiEtatPersiste',
  '_estPointCalibValide',
  '_calibDenorm',
  '_serialiserMarqueurPosture',
  '_classifyPostureAnalysis',
];

const rt = fabriquerAvecDependances([BLOC_COORD, BLOC_POSTURE, BLOC_CLASSIFY], NOMS);

// ═══════════════════════════════════════════════════════════════════
// 0. GARDE PREMIÈRE — l'extraction a-t-elle ramené du code ?
// ═══════════════════════════════════════════════════════════════════

describe('#243 extraction des blocs runtime', () => {
  it("0. Les cinq fonctions attendues sortent de l'extraction", () => {
    // Si l'une manque, l'extraction a coupé au mauvais endroit et TOUS les
    // tests suivants seraient vides de sens. fabriquerAvecDependances lève
    // déjà en nommant le manquant ; on le revérifie ici explicitement pour
    // que l'échec soit lisible dès le premier test du fichier.
    for (const nom of NOMS) {
      expect(typeof rt[nom], `fonction ${nom}`).toBe('function');
    }
    expect(NOMS.length).toBeGreaterThan(6);
  });

  it('1. Les trois blocs sont substantiels et contiennent bien leur code', () => {
    expect(BLOC_COORD).toContain('function _coord');
    expect(BLOC_POSTURE).toContain('function _serialiserMarqueurPosture');
    expect(BLOC_CLASSIFY).toContain('function _classifyPostureAnalysis');
  });

  it("2. L'extraction ÉCHOUE bruyamment si un marqueur manque", () => {
    // Vérifie que la garde mord réellement : sans elle, une extraction ratée
    // passerait pour une comparaison réussie.
    expect(() =>
      extraireBloc('js/biomeca.js', '#243 MARQUEUR-INEXISTANT', '#243 POSTURE — FIN')
    ).toThrow(/marqueurs attendus une seule fois/);
    expect(() => fabriquerAvecDependances([BLOC_COORD], ['_fonctionInexistante'])).toThrow(
      /échec d’évaluation du code extrait/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 1. _classifyPostureAnalysis — distinguer un CHOIX d'un ACCIDENT
// ═══════════════════════════════════════════════════════════════════

const mk = (nom, nx, ny) => ({ name: nom, side: '', nx, ny });

describe('#243 _classifyPostureAnalysis', () => {
  it("3. Aucune coordonnée écrite → 'absent' (choix du praticien, silence)", () => {
    expect(
      rt._classifyPostureAnalysis({ markers: [mk('A', null, null), mk('B', null, null)] })
    ).toBe('absent');
    expect(rt._classifyPostureAnalysis({ markers: [] })).toBe('absent');
  });

  it("4. Une seule coordonnée inexploitable → 'endommage' (accident, visible)", () => {
    // Le cas (c) : rechargement partiel. C'est lui qui a motivé le chantier.
    expect(rt._classifyPostureAnalysis({ markers: [mk('A', 0.4, 0.3), mk('B', 0.6, null)] })).toBe(
      'endommage'
    );
    // Y COMPRIS quand TOUS les marqueurs sont en demi-état : la vue doit
    // encore être rendue, pas disparaître comme un choix.
    expect(rt._classifyPostureAnalysis({ markers: [mk('A', 0.4, null), mk('B', null, 0.3)] })).toBe(
      'endommage'
    );
  });

  it("5. Tout exploitable → 'intact', y compris les marqueurs jamais posés", () => {
    expect(rt._classifyPostureAnalysis({ markers: [mk('A', 0.4, 0.3), mk('B', null, null)] })).toBe(
      'intact'
    );
    expect(rt._classifyPostureAnalysis({ markers: [mk('A', '0.4', '0.3')] })).toBe('intact');
  });

  it("6. Valeurs coercibles → 'endommage', jamais 'intact'", () => {
    let executes = 0;
    for (const mauvais of ['', ' ', false, [], NaN, Infinity, '0.4px']) {
      expect(
        rt._classifyPostureAnalysis({ markers: [mk('A', 0.4, mauvais)] }),
        `ny = ${JSON.stringify(mauvais) ?? String(mauvais)}`
      ).toBe('endommage');
      executes++;
    }
    expect(executes).toBe(7);
  });

  it("7. Entrée malformée → 'absent', sans lever", () => {
    expect(rt._classifyPostureAnalysis(null)).toBe('absent');
    expect(rt._classifyPostureAnalysis(undefined)).toBe('absent');
    expect(rt._classifyPostureAnalysis({})).toBe('absent');
    expect(rt._classifyPostureAnalysis({ markers: 'pas un tableau' })).toBe('absent');
    expect(rt._classifyPostureAnalysis({ markers: [null, undefined] })).toBe('absent');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. _estDemiEtatPersiste — ce qu'on préserve, et ce qu'on n'préserve pas
// ═══════════════════════════════════════════════════════════════════

describe('#243 _estDemiEtatPersiste', () => {
  it('8. Vrai UNIQUEMENT pour un demi-état', () => {
    expect(rt._estDemiEtatPersiste({ nx: 0.5, ny: null })).toBe(true);
    expect(rt._estDemiEtatPersiste({ nx: null, ny: 0.5 })).toBe(true);
    expect(rt._estDemiEtatPersiste({ nx: 0.5 })).toBe(true);
  });

  it('9. Faux pour {null,null} — point jamais posé, qui doit rester écrasable', () => {
    expect(rt._estDemiEtatPersiste({ nx: null, ny: null })).toBe(false);
    expect(rt._estDemiEtatPersiste({})).toBe(false);
  });

  it('10. Faux pour une entrée complète, absente ou malformée', () => {
    expect(rt._estDemiEtatPersiste({ nx: 0.4, ny: 0.6 })).toBe(false);
    expect(rt._estDemiEtatPersiste(undefined)).toBe(false);
    expect(rt._estDemiEtatPersiste(null)).toBe(false);
    expect(rt._estDemiEtatPersiste('texte')).toBe(false);
  });

  it("11. S'appuie sur _coord : les valeurs coercibles comptent comme inexploitables", () => {
    // Sans _coord, {nx:0.5, ny:''} passerait pour une entrée complète, car
    // '' != null en comparaison souple.
    expect(rt._estDemiEtatPersiste({ nx: 0.5, ny: '' })).toBe(true);
    expect(rt._estDemiEtatPersiste({ nx: 0.5, ny: ' ' })).toBe(true);
    expect(rt._estDemiEtatPersiste({ nx: 0.5, ny: false })).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. _serialiserMarqueurPosture — symétrie ET préservation de la preuve
// ═══════════════════════════════════════════════════════════════════

describe('#243 _serialiserMarqueurPosture — symétrie', () => {
  const W = 1000,
    H = 800;

  it('12. Marqueur placé → coordonnées normalisées', () => {
    const r = rt._serialiserMarqueurPosture(
      { name: 'A', side: 'D', x: 400, y: 200 },
      undefined,
      W,
      H
    );
    expect(r).toEqual({ name: 'A', side: 'D', nx: 0.4, ny: 0.25 });
  });

  it('13. Marqueur NON placé, rien de persisté → {nx:null, ny:null}, JAMAIS un demi-état', () => {
    // C'est le site qui pouvait CRÉER un demi-état : l'ancienne écriture
    // testait m.x pour nx et m.y pour ny indépendamment.
    const r = rt._serialiserMarqueurPosture(
      { name: 'A', side: 'G', x: 400, y: null },
      undefined,
      W,
      H
    );
    expect(r).toEqual({ name: 'A', side: 'G', nx: null, ny: null });
    expect(rt._estDemiEtatPersiste(r)).toBe(false);
  });

  it('14. W ou H nuls → {null,null}, jamais Infinity', () => {
    // Sans la garde, _coord(m.x) / 0 vaut Infinity — une valeur qui
    // REMPLACERAIT une coordonnée valide dans les données persistées.
    for (const [w, h] of [
      [0, H],
      [W, 0],
      [0, 0],
    ]) {
      const r = rt._serialiserMarqueurPosture(
        { name: 'A', side: '', x: 400, y: 200 },
        undefined,
        w,
        h
      );
      expect(r.nx, `W=${w} H=${h}`).toBeNull();
      expect(r.ny, `W=${w} H=${h}`).toBeNull();
    }
  });

  it('15. Coordonnées en chaîne → normalisées, pas rejetées', () => {
    const r = rt._serialiserMarqueurPosture(
      { name: 'A', side: '', x: '400', y: '200' },
      undefined,
      W,
      H
    );
    expect(r.nx).toBe(0.4);
    expect(r.ny).toBe(0.25);
  });
});

describe('#243 _serialiserMarqueurPosture — préservation de la preuve', () => {
  const W = 1000,
    H = 800;

  it("16. Non placé + persisté en DEMI-ÉTAT → l'entrée persistée est CONSERVÉE telle quelle", () => {
    // Ce demi-état est la seule preuve qu'un rechargement a échoué : la garde
    // de :11432 l'a écarté, le marqueur est donc vide en mémoire. L'écraser
    // par {null,null} ferait passer l'accident pour un choix du praticien.
    // On ne fabrique aucune coordonnée : on refuse seulement d'effacer.
    const avant = { name: 'A', side: 'D', nx: 0.5, ny: null };
    const r = rt._serialiserMarqueurPosture(
      { name: 'A', side: 'D', x: null, y: null },
      avant,
      W,
      H
    );
    expect(r).toBe(avant); // la MÊME entrée, pas une copie reconstruite
  });

  it('17. Non placé + persisté SAIN → écrasé par {null,null}', () => {
    // Une entrée complète ne peut pas coexister avec un marqueur non placé
    // (elle franchirait la garde du rechargement), mais si le cas survenait,
    // on ne doit pas la préserver : rien ne prouve un accident.
    const avant = { name: 'A', side: 'D', nx: 0.5, ny: 0.6 };
    const r = rt._serialiserMarqueurPosture(
      { name: 'A', side: 'D', x: null, y: null },
      avant,
      W,
      H
    );
    expect(r).toEqual({ name: 'A', side: 'D', nx: null, ny: null });
  });

  it('18. Marqueur PLACÉ → la valeur en mémoire prime sur le persisté', () => {
    const avant = { name: 'A', side: 'D', nx: 0.9, ny: null };
    const r = rt._serialiserMarqueurPosture({ name: 'A', side: 'D', x: 400, y: 200 }, avant, W, H);
    expect(r.nx).toBe(0.4);
    expect(r.ny).toBe(0.25);
  });

  it('19. Non placé + persisté {null,null} → écrasé, pas préservé', () => {
    const avant = { name: 'A', side: '', nx: null, ny: null };
    const r = rt._serialiserMarqueurPosture({ name: 'A', side: '', x: null, y: null }, avant, W, H);
    expect(r).toEqual({ name: 'A', side: '', nx: null, ny: null });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. #246 — calibration : une garde asymétrique fausse TOUS les millimètres
// ═══════════════════════════════════════════════════════════════════

describe('#246 _calibDenorm', () => {
  const W = 1000,
    H = 800;

  it('20. Les deux coordonnées exploitables → point dénormalisé', () => {
    expect(rt._calibDenorm({ nx: 0.4, ny: 0.25 }, W, H)).toEqual({ x: 400, y: 200 });
    expect(rt._calibDenorm({ nx: '0.4', ny: '0.25' }, W, H)).toEqual({ x: 400, y: 200 });
  });

  it('21. Une seule coordonnée exploitable → null', () => {
    // L'ancienne écriture testait p1.nx puis lisait p1.ny SANS garde :
    // null * hauteur vaut 0, donc une calibration à moitié persistée revenait
    // avec y = 0 — une valeur finie, indétectable en aval.
    expect(rt._calibDenorm({ nx: 0.4, ny: null }, W, H)).toBeNull();
    expect(rt._calibDenorm({ nx: null, ny: 0.25 }, W, H)).toBeNull();
    expect(rt._calibDenorm({ nx: 0.4 }, W, H)).toBeNull();
    expect(rt._calibDenorm({ nx: 0.4, ny: '' }, W, H)).toBeNull();
  });

  it('22. W ou H nuls → null, jamais Infinity', () => {
    let executes = 0;
    for (const [w, h] of [
      [0, H],
      [W, 0],
      [0, 0],
      [-1, H],
    ]) {
      expect(rt._calibDenorm({ nx: 0.4, ny: 0.25 }, w, h), `W=${w} H=${h}`).toBeNull();
      executes++;
    }
    expect(executes).toBe(4);
  });

  it('23. Point absent ou malformé → null, sans lever', () => {
    expect(rt._calibDenorm(null, W, H)).toBeNull();
    expect(rt._calibDenorm(undefined, W, H)).toBeNull();
    expect(rt._calibDenorm({}, W, H)).toBeNull();
  });

  it('24. _estPointCalibValide — symétrique sur les deux coordonnées et les deux dimensions', () => {
    expect(rt._estPointCalibValide({ x: 400, y: 200 }, W, H)).toBe(true);
    expect(rt._estPointCalibValide({ x: 400, y: null }, W, H)).toBe(false);
    expect(rt._estPointCalibValide({ x: null, y: 200 }, W, H)).toBe(false);
    expect(rt._estPointCalibValide({ x: 400, y: 200 }, 0, H)).toBe(false);
    expect(rt._estPointCalibValide({ x: 400, y: 200 }, W, 0)).toBe(false);
    expect(rt._estPointCalibValide(null, W, H)).toBe(false);
  });
});
