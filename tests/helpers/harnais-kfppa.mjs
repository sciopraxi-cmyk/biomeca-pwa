// ═══════════════════════════════════════════════════════════════════
// Harnais d'exécution des fonctions KFPPA de js/biomeca.js (#275)
// ═══════════════════════════════════════════════════════════════════
//
// Les fonctions sont EXTRAITES de js/biomeca.js — la copie qui s'exécute dans
// le navigateur — et exécutées ensemble dans une même portée, avec les
// globales qu'elles lisent (currentTestId, photoSlots, vidMarkers) et un DOM
// réduit à des bouchons minimaux.

import { fonction, objet, ligneConst, tableau, bloc } from './extraire-biomeca.mjs';

// #275-C — bloc des normes et de la grille, extrait entre ses marqueurs
// (usage « rendre testable » ; son miroir est js/calc.mjs, comparé par
// exécution dans tests/kfppa-grille-275c.test.mjs).
// #275-D — bloc de l'affichage (textes signés, Δ, couleurs, phrases), même
// principe : extrait entre ses marqueurs, comparé à js/calc.mjs par exécution.
// #279 étape 3f — lus par `bloc`, dans la même source que les fonctions
// (BIOMECA_SRC compris), et non plus par extraireBloc sur le fichier de travail.
export const BLOC_275D = bloc(
  '// #275-D — KFPPA : textes signés, Δ, couleurs, phrases du rapport',
  '// ─── #275-D — FIN ───'
);
export const BLOC_275C = bloc(
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
  '_kfppaMessageBipodalHorsPointsKo', // #279 étape 3f
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
  '_kfppaExcluHTML', // #279 étape 3f
  '_kfppaTexteU',
  '_kfppaMagnitude',
  '_kfppaNormeDetail',
  '_kfppaPhotoBipodaleHTML',
  '_photoNonRechargeeHTML',
  '_kfppaPrintSideHTML',
  '_kfppaAlertes',
  'validateAndSave',
  'capturePhotoSlot',
  'deletePhotoSlot',
  '_dessinCapture',
  '_relireImageBrute',
  'launchTest',
  '_stripDataURLsForPersist',
  '_galleryDynKeys',
  '_pedicurieDynKeys',
  'cloneMarkers',
  '_relireMarqueurs',
  'photoSlotHTML',
  'getAngleColor',
  '_pointsCaptureLisibles',
  '_calqueCapture',
  '_imgRapportAvecCalque',
  '_vigCalqueHTML',
  '_pointsIndisponiblesHTML',
  '_envoyerCaptureStorage',
  '_photoNonEnvoyeeHTML',
  '_nonEnvoyeeCourtHTML',
  '_nonRechargeeCourtHTML', // #279 étape 3f — garde capture
  '_fluxVideoPret', // #279 étape 3f — garde capture
  'captureFrame', // #279 étape 3f — garde capture
  '_entreesNonEnvoyees',
  '_messageNonEnvoyees',
  '_messageSansPhoto',
  'buildPrintSingleSide',
  '_construireResultatTest',
  '_escHtml',
  '_kfppaNormePourBilan',
];

// Chaque chargement rend un environnement NEUF : aucun état ne passe d'un
// test à l'autre, sauf ce que le code de biomeca.js laisserait fuir lui-même.
// Option `persistance` (#279) : laisse validateAndSave aller à son terme —
// savePatients et alert sont NOTÉS sans lever, Storage et navigation bouchonnés.
// Sans cette option, toute écriture lève (garde du rapport, #275-D).
export function charger(opts = {}) {
  // `exclure` : noms à NE PAS extraire — seulement pour produire une référence
  // avec une version antérieure du fichier (BIOMECA_SRC), où ils n'existent pas.
  // #279 étape 3f — BIOMECA_EXCLURE (outillage, avec BIOMECA_SRC seulement) :
  // noms EXPLICITES absents de la version lue, pour un passage « rouge sur
  // HEAD » ; jamais défini dans la suite de tests normale.
  // Garde : sans BIOMECA_SRC, elle masquerait une fonction manquante dans la
  // suite normale ou la CI — erreur explicite.
  if (process.env.BIOMECA_EXCLURE && !process.env.BIOMECA_SRC) {
    throw new Error("BIOMECA_EXCLURE n'est permis qu'avec BIOMECA_SRC");
  }
  const exclusEnv = (process.env.BIOMECA_EXCLURE || '').split(',').filter(Boolean);
  const noms = FONCTIONS.filter((n) => !(opts.exclure || []).includes(n) && !exclusEnv.includes(n));
  const code = `
    const _persist = !!(opts && opts.persistance);
    let currentTestId = null;
    let capturedFrames = [];
    let selectedFrameIdx = -1;
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
    const _enregistrements = [];
    // #279 étape 3e — ce que savePatients ÉCRIRAIT : le vrai filtre
    // _stripDataURLsForPersist appliqué, le JSON noté, puis la restauration
    // en mémoire, exactement comme le vrai savePatients.
    const _ecrits = [];
    const savePatients = _persist
      ? () => {
          _enregistrements.push('savePatients');
          if (opts.envoiReel) {
            const stash = _stripDataURLsForPersist([currentPatient]);
            try { _ecrits.push(JSON.stringify(currentPatient)); }
            finally { stash.forEach(({ obj, key, dataUrl }) => { obj[key] = dataUrl; }); }
          }
          return true;
        }
      : _espion('savePatients');
    // Faux Storage : file de réponses 'ok' | 'echec' (défaut 'ok'), envois notés.
    const pwaUser = { id: 'utilisateur-synthetique' };
    const _envois = [];
    const _reponsesEnvoi = [...((opts && opts.envois) || [])];
    function buildPhotoPath(u, p, type, b, f) { return [u, p, type, b, f].join('/'); }
    async function uploadPhotoBase64(dataUrl, path) {
      // Réponse 'ok' | 'echec', ou { r, delai } pour un envoi qui finit plus tard.
      const rep = _reponsesEnvoi.length ? _reponsesEnvoi.shift() : 'ok';
      const r = typeof rep === 'string' ? rep : rep.r;
      _envois.push({ path, r });
      if (rep && rep.delai) await new Promise((ok) => setTimeout(ok, rep.delai));
      return r === 'ok' ? { ok: true, path } : { ok: false, error: 'réseau indisponible' };
    }
    // Réponses du praticien aux confirm, messages notés.
    const _questions = [];
    const _reponsesConfirm = [...((opts && opts.reponses) || [])];
    function confirm(m) {
      _questions.push(m);
      if (!_reponsesConfirm.length) throw new Error('confirm inattendu : ' + m);
      return _reponsesConfirm.shift();
    }
    function syncOpenedBilanToHistory() {}
    function nav(id) { _enregistrements.push('nav:' + id); }
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
      // #279 étape 3b — le faux canevas NOTE si des points y ont été dessinés
      // (drawOverlay ci-dessous) : sa dataURL le dit, BRUTE ou AVECPOINTS.
      createElement: () => ({
        width: 0, height: 0, _points: false,
        getContext: () => ({ drawImage() {} }),
        toDataURL(type) {
          // Calque (PNG) : encode ce que drawOverlay a reçu — vue, points, options.
          if (type === 'image/png') return 'data:image/png;base64,CALQUE' + encodeURIComponent(JSON.stringify(this._trace || null));
          return 'data:image/jpeg;base64,' + (this._points ? 'AVECPOINTS' : 'BRUTE');
        },
      }),
    };
    function alert(m) { if (_persist) { _enregistrements.push('alert'); return; } throw new Error('alert inattendue : ' + m); }
    let _nbDessins = 0; // #279 étape 3c — nombre d'appels au dessin des points
    function drawOverlay(_ctx, canvas, markers, _sel, view, opts) {
      _nbDessins++;
      if (canvas) { canvas._points = true; canvas._trace = { view, n: (markers || []).length, w: canvas.width, h: canvas.height, opts: opts || null }; }
    }
    function renderPhotoGrid() {}
    let markerSizeFactor = 0.7;
    let markerOpacity = 0.4;
    let camStream = null;
    // #279 étape 3b — de quoi exécuter le vrai launchTest (réouverture d'un test).
    let testMode = null, selectedMkrIdx = -1, isDragging = false, selectedVidMkrIdx = -1, isVidDragging = false;
    function renderMkrList() {}
    function renderFrameStrip() {}
    function _applyCapView() {}
    function enumerateCameras() {}
    async function prefetchSportPhotos() {}
    let liveMarkers = [];
    function renderVidPhotoGrid() {}
    function quickAngleCard(side) { return '<carte-rapide ' + side + '>'; }
    ${objet('TESTS')}
    ${ligneConst('KFPPA_NON_RECALC')}
    ${ligneConst('KFPPA_BIP_MANQUANTE')}
    ${ligneConst('_KFPPA_COUL_ECRAN')}
    ${ligneConst('_KFPPA_COUL_RAPPORT')}
    ${ligneConst('_KFPPA_BADGE_RAPPORT')}
    ${ligneConst('_CALQUES_CAPTURE')}
    ${objet('MEASURE_COMPUTERS')}
    ${objet('MARKER_TEMPLATES')}
    ${tableau('POSTURO_PHOTO_KEYS')}
    ${tableau('PODOPEDIATRIE_PHOTO_KEYS')}
    ${tableau('SPORT_BILAN_PHOTO_KEYS')}
    ${tableau('PEDICURIE_GALLERY_DEFS')}
    ${BLOC_275C}
    ${BLOC_275D}
    ${noms.map(fonction).join('\n')}
    ${opts.envoiReel ? ['migrateSportPhotos', 'restoreSportPhotosStash'].map(fonction).join('\n') : 'async function migrateSportPhotos() { return []; }\n    function restoreSportPhotosStash() {}'}
    return {
      TESTS, KFPPA_NON_RECALC, KFPPA_BIP_MANQUANTE, KFPPA_NORMES, KFPPA_MSG_CIVILITE, KFPPA_MSG_NORME_ND,
      kfppaSexeCivilite, kfppaNormeApplicable, kfppaClasseU, kfppaClasseS, kfppaTexteNonSigne,
      kfppaSigneTxt, kfppaDelta, kfppaTexteDelta, kfppaTexteS, kfppaCouleurClasse,
      kfppaNormeBilan, kfppaTexteNorme, kfppaAnalyseGenou, kfppaPhraseGenou, kfppaPhraseAsymetrie,
      kfppaTexteUnipodal, kfppaMotifDelta,
      ${noms.join(', ')},
      poser(o) {
        if ('test' in o) currentTestId = o.test;
        if ('slots' in o) photoSlots = o.slots;
        if ('marqueurs' in o) vidMarkers = o.marqueurs;
        if ('elements' in o) _elements = o.elements;
        if ('patient' in o) currentPatient = o.patient;
        if ('frames' in o) capturedFrames = o.frames;
        if ('live' in o) liveMarkers = o.live;
        if ('camera' in o) camStream = o.camera;
        if ('taille' in o) markerSizeFactor = o.taille;
        if ('opacite' in o) markerOpacity = o.opacite;
      },
      slots: () => photoSlots,
      frames: () => capturedFrames, // #279 étape 3f
      espions: () => _espions.slice(),
      ecrits: () => _ecrits.slice(),
      envois: () => _envois.slice(),
      questions: () => _questions.slice(),
      nbDessins: () => _nbDessins,
      enregistrements: () => _enregistrements.slice(),
      patient: () => currentPatient,
      saveBilanSilent,
      savePatients,
      localStorage,
    };
  `;
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  return new Function('opts', code)(opts);
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
      // #279 étape 3f — caméra ACTIVE : la garde de capture exige une image.
      'vid-el': { readyState: 4, videoWidth: 1368 },
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
