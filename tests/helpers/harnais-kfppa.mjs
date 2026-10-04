// ═══════════════════════════════════════════════════════════════════
// Harnais d'exécution des fonctions KFPPA de js/biomeca.js (#275)
// ═══════════════════════════════════════════════════════════════════
//
// Les fonctions sont EXTRAITES de js/biomeca.js — la copie qui s'exécute dans
// le navigateur — et exécutées ensemble dans une même portée, avec les
// globales qu'elles lisent (currentTestId, photoSlots, vidMarkers) et un DOM
// réduit à des bouchons minimaux.

import { fonction, objet, ligneConst, tableau, bloc, SRC_BIOMECA } from './extraire-biomeca.mjs';

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
  'amProCard', // #279 1b — panneau de l'amorti
  'mlaCard', // #279 1b — panneau MLA du mode photo (non-régression)
  'badgeGen', // #279 1b — appelé par mlaCard
  'detectMarkersAuto', // #279 1c
  '_getMarkerPriorPositions', // #279 1c
  '_detectReflectiveBlobs', // #279 1c
  '_capContrastPixels', // #279 1c
  '_blobSizeMaxFor', // #279 1c
  'snapMarkersToReflectiveBlobs', // #279 1c
  'setupVidCanvas', // #279 1c
  'setupPhotoCanvas', // #279 1c
  'findMarkerAt', // #279 1c
  'clearMkr', // #279 1c
  'resetAllMarkers', // #279 1c
  'canvasXY', // #279 1c
  '_valeurPhoto', // #279 1b
  '_pointsNonAjustes', // #279 1c
  '_pointsNonAjustesHTML', // #279 1c
  '_retirerDerivesEcartes', // #279 1c
  '_motifs', // #279 1b
  '_mesureMla', // #279 1b
  '_mesureVerrou', // #279 1b
  '_mesureMob', // #279 1b
  '_mesureAmorti', // #279 1b
  '_txtValeurExclue', // #279 1b
  '_txtNonCalcule', // #279 1b
  '_pointsCaptureLisibles',
  '_calqueCapture',
  '_imgRapportAvecCalque',
  '_imgRapportAvecCalqueSeule', // #279 1c
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
  '_lockSession', // #279 étape 4 — écriture immédiate au verrouillage
  '_buildSportRapportContentHTML', // #279 étape 4 — mentions des brouillons au rapport
];

// #279 étape 4 — fonctions NOUVELLES de la sauvegarde automatique : extraites
// SEULEMENT si elles existent dans la version lue. Leur absence (code d'avant)
// donne `undefined`, et chaque test vérifie d'abord `typeof … === 'function'` :
// une absence reste un échec d'ASSERTION, jamais une erreur de harnais.
export const FONCTIONS_OPTIONNELLES = [
  '_installerSauvegardeTests',
  'abandonnerCaptureEnCours',
  '_badgeBrouillonTest',
  '_planifierBrouillon',
  '_ecrireBrouillonMaintenant',
  '_construireBrouillon',
  '_appliquerBrouillon',
  '_lignesBrouillonsRapport',
  '_stockageAutoSuspendu',
  '_entreeBrouillon',
  '_brouillonApplicable',
  '_majEtatSauvegardeAuto',
  '_majBoutonAbandon',
  '_envoyerPuisPlanifier',
  '_rafraichirBadgesTests',
];
// Appels DIRECTS du vrai nav, bouchonnés (option navReelle).
const BOUCHONS_NAV = [
  '_appliquerTheme',
  '_drawMorphoCanvasesFromSource',
  '_fichePrefillApply',
  '_renderPostureThresholdsPanel',
  '_runBackfillDryRun',
  'buildRapport',
  'clearBilanFields',
  'drawPiedsTemplate',
  'initAgendaPage',
  'initMorphoCanvas',
  'injectBilanPosturoPage',
  'loadBilan',
  'populatePratSelect',
  'renderParamsPratList',
  'renderPatientList',
  'renderPratList',
  'savePedicurieBilan',
  'savePodopediatrieBilan',
  'savePosturoBilan',
  'showPedicurieSection',
  'showPodopediatrieSection',
  'showPosturoSection',
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
  const presente = (n) =>
    SRC_BIOMECA.includes('\nfunction ' + n + '(') ||
    SRC_BIOMECA.includes('\nasync function ' + n + '(');
  const optionnelles = FONCTIONS_OPTIONNELLES.map((n) =>
    presente(n) ? fonction(n) : `const ${n} = undefined;`
  ).join('\n');
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
    let patients = []; // #279 étape 4 — le brouillon va au patient retrouvé PAR SON ID
    // #279 étape 4 — page active (nav, _lockSession), écouteurs, stockage simulé.
    let _pageActive = null, _octetsStockage = 0, _visibilite = 'visible';
    const _ecouteurs = [];
    // #279 étape 4 — état de la sauvegarde automatique (déclaré au niveau du
    // script dans biomeca.js, donc non extrait).
    let _brouillonAttente = null, _sessionCapture = null, _ecritureBrouillonEnCours = false, _sauvegardeTestsInstallee = false;
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
          // #279 étape 4 — MODÈLE du vrai savePatients en stockage critique :
          // alerte puis refus. Sans lui, « aucune alerte » ne prouverait rien.
          if (_octetsStockage / STORAGE_QUOTA_BYTES >= STORAGE_CRITICAL_THRESHOLD) { alert('ESPACE DE STOCKAGE CRITIQUE'); return false; }
          if (opts.envoiReel) {
            // #279 étape 4 — tous les patients s'ils sont posés, sinon le courant.
            const cibles = patients.length ? patients : [currentPatient];
            const stash = _stripDataURLsForPersist(cibles);
            try { _ecrits.push(JSON.stringify(patients.length ? patients : currentPatient)); }
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
    ${opts.navReelle ? fonction('nav') + BOUCHONS_NAV.map((n) => `function ${n}() { _enregistrements.push('${n}'); }`).join('\n') : "function nav(id) { _enregistrements.push('nav:' + id); }"}
    function _stopIdleLock() {}
    // #279 étape 4 — suppressions Storage (js/storage.js) NOTÉES : l'abandon
    // d'une capture ne doit jamais en appeler aucune.
    async function deletePhotos() { _enregistrements.push('deletePhotos'); }
    async function _deleteFolderRecursive() { _enregistrements.push('_deleteFolderRecursive'); }
    async function deletePatientFolder() { _enregistrements.push('deletePatientFolder'); }
    async function deleteSportBilanFolder() { _enregistrements.push('deleteSportBilanFolder'); }
    async function pwaLogout() { _enregistrements.push('pwaLogout'); }
    function buildBilanPrintSection() { return ''; }
    function _buildFichesFailHTML() { return ''; }
    function getBioMecaStorageBytes() { return _octetsStockage; }
    ${ligneConst('STORAGE_QUOTA_BYTES')}
    ${ligneConst('STORAGE_CRITICAL_THRESHOLD')}
    const window = {
      scrollTo() {},
      addEventListener: (type, f) => { _ecouteurs.push({ cible: 'window', type, f }); },
      removeEventListener() {},
    };
    const _stockage = (nom) => ({
      getItem: () => null,
      // #279 étape 4 — persistance : _lockSession pose ses drapeaux de session
      // (noté, sans lever) ; le localStorage reste un espion qui lève.
      setItem: _persist && nom === 'sessionStorage' ? (k) => { _enregistrements.push('sessionStorage.setItem:' + k); } : _espion(nom + '.setItem'),
      removeItem: _espion(nom + '.removeItem'),
      clear: _espion(nom + '.clear'),
    });
    const localStorage = _stockage('localStorage');
    const sessionStorage = _stockage('sessionStorage');
    const document = {
      getElementById: (id) => _elements[id] || null,
      // #279 étape 4 — écouteurs NOTÉS (visibilitychange…), page active simulée.
      addEventListener: (type, f) => { _ecouteurs.push({ cible: 'document', type, f }); },
      removeEventListener() {},
      get visibilityState() { return _visibilite; },
      querySelector: (sel) => (sel === '.page.active' && _pageActive ? { id: _pageActive } : null),
      querySelectorAll: () => [],
      // #279 étape 3b — le faux canevas NOTE si des points y ont été dessinés
      // (drawOverlay ci-dessous) : sa dataURL le dit, BRUTE ou AVECPOINTS.
      createElement: () => ({
        width: 0, height: 0, _points: false,
        // #279 1c — image synthétique fournie par le test (calage sur pastilles).
        getContext: () => ({ drawImage() {}, getImageData: (_x, _y, w, h) => ({ data: _image ? Uint8ClampedArray.from(_image.data) : new Uint8ClampedArray(w * h * 4) }) }),
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
    // #279 1c — état lu par le placement à la main et le calage sur pastilles.
    let _image = null, sensThr = 200, capContrast = 1, vidSnapZone = null, vidZoneMode = false, _vidZoneDrag = null, vAutoDetect = true, autoLive = false;
    function updateAngleOverlay() {}
    function _drawSnapZoneRect() {}
    function _setVidZoneMode() {}
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
    ${optionnelles}
    ${opts.envoiReel ? ['migrateSportPhotos', 'restoreSportPhotosStash'].map(fonction).join('\n') : 'async function migrateSportPhotos() { return []; }\n    function restoreSportPhotosStash() {}'}
    return {
      TESTS, MEASURE_COMPUTERS, KFPPA_NON_RECALC, KFPPA_BIP_MANQUANTE, KFPPA_NORMES, KFPPA_MSG_CIVILITE, KFPPA_MSG_NORME_ND,
      kfppaSexeCivilite, kfppaNormeApplicable, kfppaClasseU, kfppaClasseS, kfppaTexteNonSigne,
      kfppaSigneTxt, kfppaDelta, kfppaTexteDelta, kfppaTexteS, kfppaCouleurClasse,
      kfppaNormeBilan, kfppaTexteNorme, kfppaAnalyseGenou, kfppaPhraseGenou, kfppaPhraseAsymetrie,
      kfppaTexteUnipodal, kfppaMotifDelta,
      ${noms.join(', ')},
      ${FONCTIONS_OPTIONNELLES.join(', ')},
      ${opts.navReelle ? 'nav,' : ''}
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
        if ('image' in o) _image = o.image; // #279 1c
        // #279 étape 4
        if ('patients' in o) patients = o.patients;
        if ('pageActive' in o) _pageActive = o.pageActive;
        if ('octetsStockage' in o) _octetsStockage = o.octetsStockage;
        if ('visibilite' in o) _visibilite = o.visibilite;
      },
      // #279 étape 4 — déclenche les écouteurs notés d'un type d'événement.
      declencher(type) { _ecouteurs.filter((e) => e.type === type).forEach((e) => e.f({ type })); },
      ecouteurs: () => _ecouteurs.map((e) => e.cible + ':' + e.type),
      patientsListe: () => patients,
      slots: () => photoSlots,
      vid: () => vidMarkers, // #279 1c
      live: () => liveMarkers, // #279 1c
      poserMode(m) { testMode = m; }, // #279 1c
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
