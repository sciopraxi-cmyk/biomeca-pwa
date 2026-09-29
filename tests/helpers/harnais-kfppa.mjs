// ═══════════════════════════════════════════════════════════════════
// Harnais d'exécution des fonctions KFPPA de js/biomeca.js (#275)
// ═══════════════════════════════════════════════════════════════════
//
// Les fonctions sont EXTRAITES de js/biomeca.js — la copie qui s'exécute dans
// le navigateur — et exécutées ensemble dans une même portée, avec les
// globales qu'elles lisent (currentTestId, photoSlots, vidMarkers) et un DOM
// réduit à des bouchons minimaux.

import { fonction, objet, ligneConst } from './extraire-biomeca.mjs';
import { extraireBloc } from './mirror-diff.mjs';

// #275-C — bloc des normes et de la grille, extrait entre ses marqueurs
// (usage « rendre testable » ; son miroir est js/calc.mjs, comparé par
// exécution dans tests/kfppa-grille-275c.test.mjs).
// #275-D — bloc de l'affichage (textes signés, Δ, couleurs, phrases), même
// principe : extrait entre ses marqueurs, comparé à js/calc.mjs par exécution.
export const BLOC_275D = extraireBloc(
  'js/biomeca.js',
  '// #275-D — KFPPA : textes signés, Δ, couleurs, phrases du rapport',
  '// ─── #275-D — FIN ───'
);
export const BLOC_275C = extraireBloc(
  'js/biomeca.js',
  '// #275-C — KFPPA : normes, grille de U, classement de S',
  '// ─── #275-C — FIN ───'
);

export const FONCTIONS = [
  '_coord',
  '_isPlacedPt',
  '_normPt',
  'calcAngle3',
  'calcAngleSign',
  'computeCorrectedAngle',
  '_kfppaSigneCalcule',
  '_poserKfppaSigne',
  '_mkrTypeTest',
  'calcBilateral',
  'kfppaLabel',
  'clrKfppa',
  'clrGenou',
  'clrGen',
  'interpretKfppa',
  'interpretGen',
  'rp_cssColor',
  'rp_badgeCls',
  'rp_badgeTxt',
  'sectionTitle',
  '_kfppaBipodalTexte',
  '_kfppaEtatBipodal',
  '_kfppaMessageBipodal',
  'ouvrirVignette',
  'vidPhotoSlotHTML',
  'captureVidPhotoSlot',
  'updateResults',
  '_collectTestAlerts',
  'buildSidePreview',
  'buildGaugeMini',
  'buildPhotoMini',
  'buildPrintSection',
  'buildPrintSide',
  'buildPrintPhotos',
  '_serialiserMarqueurs',
  '_serialiserPhoto',
  '_kfppaBlocGrilleHTML',
  '_kfppaGenou',
  '_kfppaTexteU',
  '_kfppaMagnitude',
  '_kfppaNormeDetail',
  '_kfppaPhotoBipodaleHTML',
  '_photoNonRechargeeHTML',
  '_kfppaPrintSideHTML',
  '_kfppaAlertes',
  '_escHtml',
  '_kfppaNormePourBilan',
];

// Chaque chargement rend un environnement NEUF : aucun état ne passe d'un
// test à l'autre, sauf ce que le code de biomeca.js laisserait fuir lui-même.
export function charger() {
  const code = `
    let currentTestId = null;
    let photoSlots = [];
    let vidMarkers = [];
    let _elements = {};
    let _vigEchap = null;
    let currentPatient = null;
    // #275-D — ESPIONS D'ÉCRITURE. Chacun se note PUIS lève : un rapport ou
    // un panneau ne doit jamais sauvegarder (CLAUDE.md, incident du 25/07).
    const _espions = [];
    const _espion = (nom) => () => { _espions.push(nom); throw new Error('écriture interdite : ' + nom); };
    const saveBilanSilent = _espion('saveBilanSilent');
    const saveBilan = _espion('saveBilan');
    const savePatients = _espion('savePatients');
    const _stockage = (nom) => ({
      getItem: () => null,
      setItem: _espion(nom + '.setItem'),
      removeItem: _espion(nom + '.removeItem'),
      clear: _espion(nom + '.clear'),
    });
    const localStorage = _stockage('localStorage');
    const sessionStorage = _stockage('sessionStorage');
    const document = {
      getElementById: (id) => _elements[id] || null,
      addEventListener() {},
      removeEventListener() {},
      createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/jpeg;base64,QUJD',
      }),
    };
    function alert(m) { throw new Error('alert inattendue : ' + m); }
    function drawOverlay() {}
    function renderVidPhotoGrid() {}
    function quickAngleCard(side) { return '<carte-rapide ' + side + '>'; }
    ${objet('TESTS')}
    ${ligneConst('KFPPA_NON_RECALC')}
    ${ligneConst('KFPPA_BIP_MANQUANTE')}
    ${ligneConst('_KFPPA_COUL_ECRAN')}
    ${ligneConst('_KFPPA_COUL_RAPPORT')}
    ${ligneConst('_KFPPA_BADGE_RAPPORT')}
    ${objet('MEASURE_COMPUTERS')}
    ${BLOC_275C}
    ${BLOC_275D}
    ${FONCTIONS.map(fonction).join('\n')}
    return {
      TESTS, KFPPA_NON_RECALC, KFPPA_BIP_MANQUANTE, KFPPA_NORMES, KFPPA_MSG_CIVILITE, KFPPA_MSG_NORME_ND,
      kfppaSexeCivilite, kfppaNormeApplicable, kfppaClasseU, kfppaClasseS, kfppaTexteNonSigne,
      kfppaSigneTxt, kfppaDelta, kfppaTexteDelta, kfppaTexteS, kfppaCouleurClasse,
      kfppaNormeBilan, kfppaTexteNorme, kfppaAnalyseGenou, kfppaPhraseGenou, kfppaPhraseAsymetrie,
      kfppaTexteUnipodal,
      ${FONCTIONS.join(', ')},
      poser(o) {
        if ('test' in o) currentTestId = o.test;
        if ('slots' in o) photoSlots = o.slots;
        if ('marqueurs' in o) vidMarkers = o.marqueurs;
        if ('elements' in o) _elements = o.elements;
        if ('patient' in o) currentPatient = o.patient;
      },
      slots: () => photoSlots,
      espions: () => _espions.slice(),
      saveBilanSilent,
      savePatients,
      localStorage,
    };
  `;
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  return new Function(code)();
}

// Capture de démonstration du praticien — aucune donnée patient.
// Image affichée à 1368 px de large ; ordre EIAS → Rotule → Tarse.
// Référence : genou D +14,8°, genou G −7,9°.
export const MARQUEURS_DEMO = [
  { name: 'EIAS D', side: 'D', x: 732, y: 139 },
  { name: 'Rotule D', side: 'D', x: 766, y: 382 },
  { name: 'Tarse D', side: 'D', x: 736, y: 632 },
  { name: 'EIAS G', side: 'G', x: 957, y: 145 },
  { name: 'Rotule G', side: 'G', x: 983, y: 392 },
  { name: 'Tarse G', side: 'G', x: 975, y: 637 },
];

// Prépare une capture vidéo : test courant, créneaux, marqueurs et DOM.
// Rend l'élément des résultats, pour lire ce qu'updateResults y a écrit.
export function envCapture(env, test, slots, marqueurs = MARQUEURS_DEMO) {
  const res = { innerHTML: '' };
  env.poser({
    test,
    slots,
    marqueurs: JSON.parse(JSON.stringify(marqueurs)),
    elements: {
      'vid-el': {},
      'vid-canvas': { width: 1368, height: 770 },
      'cap-results': res,
    },
  });
  return res;
}

export const slotsVierges = (t) =>
  t.photoLabels.map((l, i) => ({
    label: l,
    side: t.photoSides[i] || '',
    dataUrl: null,
    angle: null,
    path: null,
  }));
