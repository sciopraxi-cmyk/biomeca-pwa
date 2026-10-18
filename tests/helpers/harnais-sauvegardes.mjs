// ═══════════════════════════════════════════════════════════════════
// #277 — Harnais : génération des rapports et sauvegardes des bilans
// ═══════════════════════════════════════════════════════════════════
//
// Les fonctions demandées sont EXTRAITES de js/biomeca.js (et migratePhotoEntry
// de js/storage.js) puis exécutées ensemble. Tout autre identifiant répond par
// un bouchon NOMMÉ, qui note son appel : un test peut ainsi prouver que le
// chemin exécuté est allé jusqu'au bout (témoin), et pas seulement qu'il n'a
// rien écrit.
//
// Chaque fonction d'ÉCRITURE non demandée est un espion qui note son appel ;
// alert / confirm / prompt sont notés comme dialogues. Réseau, Storage et
// localStorage sont simulés en mémoire : rien ne sort du processus.
// Données FICTIVES uniquement.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './mirror-diff.mjs';
import { fonction, ligneConst, tableau, SRC_BIOMECA } from './extraire-biomeca.mjs';
import { ECRITURES } from './fermeture-appels.mjs';

// Fonctions NOUVELLES de #277 : absentes de main, remplacées par `undefined`
// quand la version lue ne les a pas — leur absence reste un échec
// d'ASSERTION, jamais une erreur de harnais.
export const NOUVELLES = [
  '_balayerBilanSport',
  '_balayerBilanPosturo',
  '_capturerBilanSportEnMemoire',
  '_capturerBilanPosturoEnMemoire',
  '_ouvrirFenetreSauvegarde',
  '_attendreSauvegardesEnCours',
  '_mentionEnvoiEnCoursHTML',
];
const CONST_NOUVELLES = [
  '_sauvegardesEnCours',
  'DELAI_MAX_ATTENTE_SAUVEGARDE_MS',
  '_captureExpiree',
];

const presente = (n) =>
  SRC_BIOMECA.includes('\nfunction ' + n + '(') ||
  SRC_BIOMECA.includes('\nasync function ' + n + '(');
const constPresente = (n) => SRC_BIOMECA.includes('\nconst ' + n + ' = ');

// migratePhotoEntry vit dans js/storage.js : même extraction (nom unique,
// fin au premier « \n}\n »).
const SRC_STORAGE = readFileSync(join(RACINE, 'js/storage.js'), 'utf8');
function fonctionStorage(nom) {
  const tete = `\nasync function ${nom}(`;
  const n = SRC_STORAGE.split(tete).length - 1;
  if (n !== 1) throw new Error(`${nom} : ${n} définitions dans js/storage.js, 1 attendue`);
  const i = SRC_STORAGE.indexOf(tete) + 1;
  return SRC_STORAGE.slice(i, SRC_STORAGE.indexOf('\n}\n', i) + 2);
}

const BOUCHON = new Proxy(function () {}, {
  get: (_t, k) =>
    k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : BOUCHON,
  apply: () => BOUCHON,
});

// Élément de DOM neutre : valeur vide, case décochée, canevas jamais dessiné.
export function element(champs = {}) {
  const base = {
    value: '',
    checked: false,
    _userDirty: false,
    width: 0,
    height: 0,
    src: '',
    naturalWidth: 0,
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    children: [],
    options: [],
    parentElement: null,
    type: 'text',
    getAttribute: () => '',
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: (e) => e,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    ...champs,
  };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : BOUCHON),
  });
}

/**
 * Monte un environnement NEUF.
 *   reelles  : fonctions de js/biomeca.js à exécuter réellement (les écritures
 *              qui n'y figurent pas restent des espions)
 *   page     : id de la page active (.page.active)
 *   dom      : { id: élément } ; tout autre id rend un élément neutre
 *   champs   : éléments rendus par querySelectorAll('.bilan-field')
 *   selecteurs : { sélecteur: [éléments] } pour les autres querySelectorAll
 *   envois   : file de réponses de l'envoi Storage : 'ok' | 'echec' | 'attente'
 *              ('attente' : promesse tenue par liberer())
 *   globales : valeurs initiales (currentPatient, bilanData, patients…)
 */
export function monter(o = {}) {
  const journal = [];
  const noter = (type, nom) => journal.push({ type, nom });
  const espion = (nom, rendu) =>
    function () {
      noter('ecriture', nom);
      return rendu === undefined ? Promise.resolve() : rendu;
    };
  const nomme = new Map();
  const documents = []; // HTML écrit dans les iframes créés (rapport Posturo)
  const bouchonNomme = (k) => {
    if (!nomme.has(k))
      nomme.set(
        k,
        new Proxy(function () {}, {
          get: (_t, p) =>
            p === Symbol.toPrimitive ? () => '' : p === 'then' ? undefined : BOUCHON,
          apply: () => (noter('appel', k), BOUCHON),
        })
      );
    return nomme.get(k);
  };

  const dom = o.dom || {};
  const document = {
    querySelector: (sel) =>
      sel === '.page.active' ? (o.page ? element({ id: o.page }) : null) : null,
    querySelectorAll: (sel) =>
      sel === '.bilan-field' ? o.champs || [] : (o.selecteurs || {})[sel] || [],
    getElementById: (id) => (id in dom ? dom[id] : element({ id })),
    // Témoins de fin de chemin : clic du lien mailto, impression d'un iframe.
    createElement: (tag) =>
      element({
        tag,
        click: () => noter('appel', tag + '.click'),
        contentDocument: { open() {}, write: (html) => documents.push(String(html)), close() {} },
        contentWindow: { focus() {}, print: () => noter('appel', tag + '.print') },
      }),
    addEventListener() {},
    body: element(),
  };
  const window = new Proxy(
    { _accessLevel: 'full', devicePixelRatio: 1, scrollTo() {}, print() {}, addEventListener() {} },
    { get: (t, k) => (k in t ? t[k] : BOUCHON) }
  );
  const stockage = (nom, ecrit) => ({
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: ecrit ? espion(nom + '.setItem', undefined) : () => noter('appel', nom + '.setItem'),
    removeItem: ecrit ? espion(nom + '.removeItem', undefined) : () => {},
    clear: ecrit ? espion(nom + '.clear', undefined) : () => {},
  });

  // Envoi Storage simulé : réponses en file, envois en attente libérés à la main.
  const reponses = [...(o.envois || [])];
  const enAttente = [];
  const envois = [];
  async function uploadPhotoBase64(_dataUrl, path) {
    const r = reponses.length ? reponses.shift() : 'ok';
    envois.push(path);
    if (r === 'attente') await new Promise((ok) => enAttente.push(ok));
    return r === 'echec' ? { ok: false, error: 'réseau simulé' } : { ok: true, path };
  }

  const connus = {
    document,
    window,
    localStorage: stockage('localStorage', true),
    sessionStorage: stockage('sessionStorage', false),
    console: { log() {}, warn() {}, error() {}, info() {} },
    Math,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Promise,
    Set,
    Map,
    Error,
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
    alert: (m) => noter('dialogue', 'alert: ' + String(m).split('\n')[0]),
    confirm: (m) => (noter('dialogue', 'confirm: ' + String(m).split('\n')[0]), false),
    prompt: (m) => (noter('dialogue', 'prompt: ' + String(m).split('\n')[0]), null),
    crypto: { randomUUID: () => 'uuid-fictif' },
    pwaUser: { id: 'utilisateur-fictif' },
    ensureSession: async () => {},
    buildPhotoPath: (...p) => p.join('/'),
    uploadPhotoBase64,
    currentPatient: null,
    bilanData: {},
    patients: [],
    praticiens: [],
    ...(o.globales || {}),
  };
  const reelles = new Set(o.reelles || []);
  // Une écriture fournie par le test (globales) n'est pas remplacée.
  for (const n of ECRITURES)
    if (!reelles.has(n) && n !== 'uploadPhotoBase64' && !(n in (o.globales || {})))
      connus[n] = espion(
        n,
        n === 'savePatients' ? true : n.startsWith('migrate') ? Promise.resolve({}) : undefined
      );

  const env = new Proxy(connus, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : bouchonNomme(k)),
    set: (t, k, v) => ((t[k] = v), true),
  });

  const noms = [...reelles].filter((n) => n !== 'migratePhotoEntry');
  const extraites = noms.filter((n) => !NOUVELLES.includes(n) || presente(n));
  const absentes = noms.filter((n) => NOUVELLES.includes(n) && !presente(n));
  const code = [
    ...CONST_NOUVELLES.filter(constPresente).map(ligneConst),
    ...(o.tableaux || []).map(tableau),
    ...extraites.map(fonction),
    ...(reelles.has('migratePhotoEntry') ? [fonctionStorage('migratePhotoEntry')] : []),
    ...absentes.map((n) => `const ${n} = undefined;`),
    `return { ${[...noms, ...(reelles.has('migratePhotoEntry') ? ['migratePhotoEntry'] : [])].join(', ')} };`,
  ].join('\n');
  // with : seul moyen de répondre « bouchon nommé » à tout identifiant libre
  // sans en dresser la liste — le code exécuté est celui du dépôt.
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  const f = new Function('env', `with (env) { ${code} }`)(env);

  return {
    f,
    env: connus,
    journal,
    ecritures: () => journal.filter((e) => e.type === 'ecriture').map((e) => e.nom),
    dialogues: () => journal.filter((e) => e.type === 'dialogue').map((e) => e.nom),
    appels: () => journal.filter((e) => e.type === 'appel').map((e) => e.nom),
    envois: () => envois.slice(),
    documents: () => documents.slice(),
    liberer: () => enAttente.splice(0).forEach((ok) => ok()),
  };
}

// Laisse s'écouler les tâches en attente (promesses chaînées, minuteries à 0).
export const laisserFiler = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((ok) => globalThis.setTimeout(ok, 0));
};
