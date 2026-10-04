import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

// _nbTestsMesures est NOUVELLE : extraite seulement si elle existe dans la
// version lue. Sur le code d'avant, aucun site ne l'appelle : son absence
// laisse les tests rouges par ASSERTION, jamais par erreur de harnais.
const optionnelle = (n) => (SRC_BIOMECA.includes('\nfunction ' + n + '(') ? fonction(n) : '');

// ═══════════════════════════════════════════════════════════════════
// #279 étape 4 — un _bilanId seul n'est ni un test ni un bilan à archiver
// ═══════════════════════════════════════════════════════════════════
//
// _bilanId est créé sans aucun test validé : par saveBilan(Silent), par la
// capture (3e) et par le brouillon de la sauvegarde automatique. Les sites de
// l'interface qui comptaient Object.keys(p.mesures) le prenaient pour un test.
// Chaque cas est accompagné d'un TÉMOIN avec un vrai test validé, qui prouve
// que la mesure sait voir un test quand il y en a un.
// finalizeBilanSport et abandonnerBilanSport : A15 (sauvegarde-auto-279).
// Synchronisation (nb_tests, ligne in_progress) : hors périmètre, #271.
// Données synthétiques.

const BROUILLON = {
  'kfppa-marche': { bilanId: 'bilan-synthetique', photos: [], frames: [], marqueursEnCours: [] },
};
const VALIDE = {
  date: 'v',
  photos: [{ label: 'Station bipodale', side: '', angle: null, angleD: 3.1, angleG: 4.2 }],
  frames: [],
};
const patientFictif = (mesures, o = {}) => ({
  id: 'patient-synthetique',
  prenom: 'Prénom',
  nom: 'Fictif',
  mesures,
  bilanData: {},
  brouillonsTests: JSON.parse(JSON.stringify(BROUILLON)),
  ...o,
});
const seulBilanId = (o) => patientFictif({ _bilanId: 'bilan-synthetique' }, o);
const avecTest = (o) => patientFictif({ _bilanId: 'bilan-synthetique', 'kfppa-marche': VALIDE }, o);

// Portée commune : les vraies fonctions, leurs appels annexes bouchonnés.
function charger(noms, p, reponses = [], extra = '') {
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  return new Function(
    'p',
    'reponses',
    `
    let patients = [p], praticiens = [], currentPatient = null, bilanData = {};
    let currentOpenedBilanIdx = null, currentOpenedBilanPosturoIdx = null, _intentionalReduction = false;
    let _dataLoaded = false, _loadedFromFallback = false;
    const _questions = [], _alertes = [], _el = { innerHTML: '' };
    const window = {};
    const document = { getElementById: (id) => (id === 'pt-list-el' ? _el : null) };
    const console = { log() {}, warn() {}, error() {} };
    function confirm(m) { _questions.push(m); return reponses.length ? reponses.shift() : false; }
    function alert(m) { _alertes.push(m); }
    function savePatients() {} function _syncPatientToNormalizedTables() {}
    function selectPatient(x) { currentPatient = x; } function nav() {}
    function renderPatientList() {} function renderPratList() {} function populatePratSelect() {}
    function showAccessRestrictedModal() {}
    function _aboMeta() { return { modules: ['podo_sport'] }; }
    ${extra}
    ${optionnelle('_nbTestsMesures')}
    ${['_escHtml', 'hasBilanDataContent', ...noms].map(fonction).join('\n')}
    return { ${noms.join(', ')}, questions: () => _questions, alertes: () => _alertes, html: () => _el.innerHTML, patients: () => patients };
  `
  )(p, reponses);
}

describe('#279 étape 4 — liste des patients (:5815)', () => {
  const liste = (p) => {
    const env = charger(['renderPatientList'], p);
    env.renderPatientList.call(null);
    return env.html().replace(/\s+/g, ' ');
  };
  it('N1. _bilanId seul + brouillon, bilan démarré : « aucune donnée encore saisie », jamais « test(s) saisi(s) »', () => {
    const h = liste(seulBilanId({ currentBilanSportSousType: 'initial' }));
    expect(h, 'carte du bilan en cours présente').toContain('Bilan sport en cours');
    expect(h).toContain('aucune donnée encore saisie');
    expect(h).not.toContain('test(s) saisi(s)');
  });
  it('N1-témoin. Un vrai test validé : la liste affiche « N test(s) saisi(s) »', () => {
    expect(liste(avecTest({ currentBilanSportSousType: 'initial' }))).toMatch(
      /\d+ test\(s\) saisi\(s\)/
    );
  });
  it('N1b. Un test validé + _bilanId : compte EXACT, « 1 test(s) saisi(s) »', () => {
    const h = liste(avecTest({ currentBilanSportSousType: 'initial' }));
    expect(h.match(/(\d+) test\(s\) saisi\(s\)/)?.[1]).toBe('1');
  });
});

describe('#279 étape 4 — creerBilanSport (:6412)', () => {
  it('N2. _bilanId seul + brouillon : aucune question « bilan en cours », aucune archive vide', () => {
    const p = seulBilanId({ currentBilanSportSousType: 'initial' });
    const env = charger(['creerBilanSport'], p);
    env.creerBilanSport(0, 'controle');
    expect(env.questions(), 'aucune question').toEqual([]);
    expect(p.bilansSport, 'aucune archive vide').toBeUndefined();
    expect(p.currentBilanSportSousType, 'nouveau bilan démarré').toBe('controle');
  });
  it('N2-témoin. Un vrai test validé : la question « bilan en cours » est posée', () => {
    const p = avecTest({ currentBilanSportSousType: 'initial' });
    const env = charger(['creerBilanSport'], p, [false]);
    env.creerBilanSport(0, 'controle');
    expect(env.questions()[0] || '').toMatch(/bilan en cours avec \d+ test\(s\) saisi\(s\)/);
  });
  it('N2b. Un test validé + _bilanId : compte EXACT dans la question, « 1 test(s) saisi(s) »', () => {
    const p = avecTest({ currentBilanSportSousType: 'initial' });
    const env = charger(['creerBilanSport'], p, [false]);
    env.creerBilanSport(0, 'controle');
    expect((env.questions()[0] || '').match(/(\d+) test\(s\) saisi\(s\)/)?.[1]).toBe('1');
  });
});

describe('#279 étape 4 — ouvrirBilanSport (:6484)', () => {
  const archive = [
    {
      label: 'Sportif Initial',
      type: 'initial',
      date: '',
      mesures: { _bilanId: 'ancien' },
      bilanData: {},
    },
  ];
  it('N3. _bilanId seul + brouillon : ouvrir une archive ne prévient pas d’une perte de données', () => {
    const p = seulBilanId({
      currentBilanSportSousType: 'controle',
      bilansSport: JSON.parse(JSON.stringify(archive)),
    });
    const env = charger(['ouvrirBilanSport'], p);
    env.ouvrirBilanSport(0, 0);
    expect(env.questions(), 'aucune question').toEqual([]);
  });
  it('N3-témoin. Un vrai test validé : la question de perte est posée', () => {
    const p = avecTest({
      currentBilanSportSousType: 'controle',
      bilansSport: JSON.parse(JSON.stringify(archive)),
    });
    const env = charger(['ouvrirBilanSport'], p, [false]);
    env.ouvrirBilanSport(0, 0);
    expect(env.questions()[0] || '').toContain('perdra vos données actuelles');
  });
});

describe('#279 étape 4 — migration héritée au chargement (:794)', () => {
  const charge = async (p) => {
    const extra = `
      let pwaUser = { id: 'utilisateur-synthetique', token: 'jeton-synthetique' };
      const supa = {
        async loadData() { return [{ user_id: 'utilisateur-synthetique', data: { patients: [p], praticiens: [] } }]; },
        async getUser() { return { user_metadata: {}, app_metadata: {} }; },
      };`;
    const env = charger(['migrateBilanFlags', 'loadSupabaseData'], p, [], extra);
    await env.loadSupabaseData();
    return env.patients()[0];
  };
  it('N4. Patient sans bilan démarré, _bilanId seul + brouillon : aucun « Sportif Initial » fantôme', async () => {
    const m = await charge(seulBilanId());
    expect(m.bilansSport, 'aucune archive créée').toBeUndefined();
  });
  it('N4-témoin. Un vrai test hérité : la migration crée « Sportif Initial »', async () => {
    const m = await charge(avecTest());
    expect((m.bilansSport || []).map((b) => b.label)).toEqual(['Sportif Initial']);
  });
});
