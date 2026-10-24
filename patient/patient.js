// Portail patient — logique de l'interface (lot b : connexion, choix du mot de passe, accueil).
// Aucune dépendance. Les données du patient ne passent que par la fonction SQL portail_moi()
// (RLS) ; la connexion passe par l'Edge Function patient-connexion (essais limités côté serveur).
import {
  apercuDemande,
  cheminFichierValide,
  cleExo,
  cleValidation,
  dateCourte,
  debutExerciceMs,
  etatChrono,
  exosTermines,
  exerciceAffichable,
  exerciceSuivantMs,
  formaterIdentifiant,
  formaterTemps,
  grouperDocuments,
  identifiantComplet,
  indexerExos,
  indexerValidations,
  jourProgramme,
  libelleJour,
  messageErreur,
  motDePasseAcceptable,
  nombreNonLus,
  phraseChrono,
  planChrono,
  PREPARATION_S,
  seancesAbsentes,
  phraseDocuments,
  reglesMotDePasse,
  salutation,
  sessionAExpirer,
  situationJour,
} from './patient-logique.mjs';

const SUPA_URL = 'https://tzivizoacdyopwfzerrb.supabase.co';
// Clé publique (anon / publishable) : la même que l'application praticien, protégée par la RLS.
const SUPA_KEY = 'sb_publishable_aE4_BZYwz6bGGvby4XXAgw_k8ULnrYh';
const CLE_SESSION = 'verticy-patient-session';

const $ = (id) => document.getElementById(id);

// ─── Aperçu praticien (?apercu=<fiche>) : le portail vu comme le patient, en lecture seule ───
// Le jeton est celui du PRATICIEN, demandé à la fenêtre Verticy qui a ouvert cette page (même origine).
const APERCU = apercuDemande(location.search);
let apercuInfos = { prenom: '', cabinet: '' };
function demanderJetonApercu() {
  return new Promise((resolve) => {
    if (!window.opener) return resolve(null);
    const fin = (v) => {
      window.removeEventListener('message', ecoute);
      clearTimeout(minuteur);
      resolve(v);
    };
    const ecoute = (e) => {
      if (e.origin !== location.origin || e.source !== window.opener) return;
      if (!e.data || e.data.type !== 'verticy-apercu-jeton' || !e.data.token) return;
      apercuInfos = { prenom: String(e.data.prenom || ''), cabinet: String(e.data.cabinet || '') };
      fin({ access_token: String(e.data.token) });
    };
    const minuteur = setTimeout(() => fin(null), 8000);
    window.addEventListener('message', ecoute);
    window.opener.postMessage({ type: 'verticy-apercu-demande' }, location.origin);
  });
}
const ECRANS = [
  'chargement',
  'connexion',
  'mdp',
  'accueil',
  'ferme',
  'documents',
  'document',
  'exercices',
];

function montrer(nom) {
  if (nom !== 'exercices') reinitialiserChrono(null);
  for (const e of ECRANS) $('ecran-' + e).hidden = e !== nom;
  document
    .querySelector('.cadre')
    .classList.toggle('large', nom === 'document' || nom === 'exercices');
  const premier = { connexion: 'identifiant', mdp: 'mdp1' }[nom];
  if (premier) $(premier).focus();
}

function afficherErreur(id, texte) {
  const el = $(id);
  el.textContent = texte || '';
  el.hidden = !texte;
}

// ─── Session (jetons Supabase) ───
function lireSession() {
  try {
    return JSON.parse(localStorage.getItem(CLE_SESSION) || 'null');
  } catch {
    return null;
  }
}
function ecrireSession(s) {
  try {
    if (s) localStorage.setItem(CLE_SESSION, JSON.stringify(s));
    else localStorage.removeItem(CLE_SESSION);
  } catch {
    /* stockage indisponible : la session reste valable le temps de la page */
  }
}

async function appelFonction(nom, corps) {
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/${nom}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
      body: JSON.stringify(corps),
    });
    let json = null;
    try {
      json = await r.json();
    } catch {
      /* corps vide */
    }
    return { statut: r.status, corps: json };
  } catch {
    return { statut: 0, corps: null };
  }
}

async function renouveler(session) {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at,
    };
  } catch {
    return null;
  }
}

/** Session valide (renouvelée si besoin) ou null. */
async function sessionValide() {
  if (APERCU) return demanderJetonApercu();
  let s = lireSession();
  if (!s) return null;
  if (sessionAExpirer(s, Math.floor(Date.now() / 1000))) {
    s = await renouveler(s);
    ecrireSession(s);
  }
  return s;
}

async function lireMoi(session) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/portail_moi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + session.access_token,
      },
      body: '{}',
    });
    if (!r.ok) return { statut: r.status, moi: null };
    return { statut: r.status, moi: await r.json() };
  } catch {
    return { statut: 0, moi: null };
  }
}

// ─── Écrans ───
let billet = null; // billet à usage unique entre « date de naissance » et « mot de passe »

async function ouvrirAccueil() {
  if (APERCU) return ouvrirAccueilApercu();
  const s = await sessionValide();
  if (!s) return montrer('connexion');
  const { statut, moi } = await lireMoi(s);
  if (statut === 0) {
    $('texte-ferme').textContent =
      'Pas de connexion internet. Réessayez quand vous avez du réseau.';
    return montrer('ferme');
  }
  if (!moi || moi.statut !== 'actif') {
    ecrireSession(null);
    if (moi && moi.statut === 'suspendu') {
      $('texte-ferme').textContent = 'Votre accès est fermé. Contactez votre praticien.';
    } else {
      $('texte-ferme').textContent =
        'Votre accès doit être réactivé. Reconnectez-vous avec l’identifiant reçu de votre praticien.';
    }
    return montrer('ferme');
  }
  $('salut').textContent = salutation(moi.prenom);
  $('cabinet').textContent = moi.cabinet ? `Votre praticien : ${moi.cabinet}` : '';
  montrer('accueil');
  majPastilleDocuments();
  majCarteExercices();
}

async function ouvrirAccueilApercu() {
  const s = await sessionValide();
  if (!s) {
    $('texte-ferme').textContent =
      'Aperçu indisponible : rouvrez-le depuis la fiche du patient dans Verticy (gardez la fenêtre Verticy ouverte).';
    $('btn-retour').style.display = 'none';
    return montrer('ferme');
  }
  $('salut').textContent = salutation(apercuInfos.prenom);
  $('cabinet').textContent = apercuInfos.cabinet ? `Votre praticien : ${apercuInfos.cabinet}` : '';
  $('btn-deconnexion').style.display = 'none';
  montrer('accueil');
  majPastilleDocuments();
  majCarteExercices();
}

async function seConnecter(ev) {
  ev.preventDefault();
  afficherErreur('erreur-connexion', '');
  const identifiant = $('identifiant').value;
  const secret = $('secret').value;
  if (!identifiantComplet(identifiant) || !secret) {
    return afficherErreur(
      'erreur-connexion',
      'Entrez votre identifiant (8 caractères) et votre mot de passe.'
    );
  }
  const btn = $('btn-connexion');
  btn.disabled = true;
  const { statut, corps } = await appelFonction('patient-connexion', {
    action: 'connexion',
    identifiant,
    secret,
  });
  btn.disabled = false;
  if (statut === 200 && corps && corps.etape === 'choisir_mot_de_passe') {
    billet = corps.billet;
    $('secret').value = '';
    $('mdp1').value = '';
    $('mdp2').value = '';
    majRegles();
    return montrer('mdp');
  }
  if (statut === 200 && corps && corps.etape === 'ok') {
    ecrireSession(corps.session);
    $('secret').value = '';
    return ouvrirAccueil();
  }
  afficherErreur('erreur-connexion', messageErreur(statut, corps));
}

function majRegles() {
  const mdp = $('mdp1').value;
  const ul = $('regles');
  ul.textContent = '';
  for (const r of reglesMotDePasse(mdp)) {
    const li = document.createElement('li');
    li.className = r.ok ? 'ok' : '';
    li.textContent = (r.ok ? '✅ ' : '⬜ ') + r.texte;
    ul.appendChild(li);
  }
  const identique = $('mdp2').value === mdp && mdp !== '';
  const li = document.createElement('li');
  li.className = identique ? 'ok' : '';
  li.textContent = (identique ? '✅ ' : '⬜ ') + 'Les deux mots de passe sont identiques';
  ul.appendChild(li);
  $('btn-mdp').disabled = !motDePasseAcceptable(mdp, $('mdp2').value);
}

async function choisirMotDePasse(ev) {
  ev.preventDefault();
  afficherErreur('erreur-mdp', '');
  const mdp = $('mdp1').value;
  if (!motDePasseAcceptable(mdp, $('mdp2').value)) return;
  const btn = $('btn-mdp');
  btn.disabled = true;
  const { statut, corps } = await appelFonction('patient-connexion', {
    action: 'definir',
    billet,
    mot_de_passe: mdp,
  });
  if (statut === 200 && corps && corps.ok) {
    // Connexion immédiate avec le mot de passe choisi, sans le retaper.
    const identifiant = $('identifiant').value;
    const rep = await appelFonction('patient-connexion', {
      action: 'connexion',
      identifiant,
      secret: mdp,
    });
    billet = null;
    $('mdp1').value = '';
    $('mdp2').value = '';
    if (rep.statut === 200 && rep.corps && rep.corps.etape === 'ok') {
      ecrireSession(rep.corps.session);
      return ouvrirAccueil();
    }
    return montrer('connexion');
  }
  afficherErreur('erreur-mdp', messageErreur(statut, corps));
  if (corps && corps.error === 'billet_invalide') {
    billet = null;
    setTimeout(() => montrer('connexion'), 2500);
  } else {
    majRegles();
  }
}

async function deconnecter() {
  const s = lireSession();
  ecrireSession(null);
  if (s && s.access_token) {
    fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + s.access_token },
    }).catch(() => {});
  }
  $('identifiant').value = '';
  $('secret').value = '';
  afficherErreur('erreur-connexion', '');
  montrer('connexion');
}

// ─── Documents partagés (lecture seule) ───
let documents = [];

/** Valeur aléatoire à usage unique (aucune donnée personnelle). */
function nonce() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Appel authentifié (session renouvelée si besoin) ; null si pas de session ou pas de réseau. */
async function appelAuth(chemin, init) {
  const s = await sessionValide();
  if (!s) return null;
  try {
    return await fetch(SUPA_URL + chemin, {
      ...(init || {}),
      headers: {
        ...((init && init.headers) || {}),
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + s.access_token,
      },
    });
  } catch {
    return null;
  }
}

async function chargerDocuments() {
  const r = await appelAuth(
    '/rest/v1/documents_partages?select=id,type,titre,date_document,lu_at,created_at,fichier_chemin&order=created_at.desc' +
      (APERCU ? '&retire=eq.false&patient_id=eq.' + APERCU : '')
  );
  if (!r || !r.ok) return null;
  try {
    const l = await r.json();
    return Array.isArray(l) ? l : null;
  } catch {
    return null;
  }
}

function afficherPastille() {
  const n = nombreNonLus(documents);
  const p = $('pastille-documents');
  p.hidden = n === 0;
  p.textContent = String(n);
  $('phrase-documents').textContent = phraseDocuments(n);
}

async function majPastilleDocuments() {
  const l = await chargerDocuments();
  if (l) {
    documents = l;
    afficherPastille();
  }
}

function ligneDocument(d) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ligne-document' + (d.lu_at ? '' : ' nouveau');
  const texte = document.createElement('span');
  const t = document.createElement('strong');
  t.textContent = d.titre;
  texte.appendChild(t);
  const date = dateCourte(d.date_document);
  if (date) {
    const sm = document.createElement('small');
    sm.textContent = date;
    texte.appendChild(sm);
  }
  b.appendChild(texte);
  if (!d.lu_at) {
    const n = document.createElement('span');
    n.className = 'badge-nouveau';
    n.textContent = 'Nouveau';
    b.appendChild(n);
  }
  b.addEventListener('click', () => ouvrirDocument(d));
  return b;
}

function afficherListeDocuments() {
  const zone = $('liste-documents');
  zone.textContent = '';
  const groupes = grouperDocuments(documents);
  $('vide-documents').hidden = groupes.length > 0;
  for (const g of groupes) {
    const h = document.createElement('h2');
    h.className = 'groupe-documents';
    h.textContent = `${g.emoji} ${g.titre}`;
    zone.appendChild(h);
    for (const d of g.documents) zone.appendChild(ligneDocument(d));
  }
}

async function ouvrirDocuments() {
  afficherErreur('erreur-documents', '');
  montrer('documents');
  const l = await chargerDocuments();
  if (l) documents = l;
  else if (!documents.length) {
    afficherErreur(
      'erreur-documents',
      'Impossible de charger vos documents. Vérifiez votre réseau puis réessayez.'
    );
  }
  afficherListeDocuments();
}

async function ouvrirDocument(d) {
  afficherErreur('erreur-document', '');
  $('titre-document').textContent = d.titre;
  $('btn-document-imprimer').hidden = true;
  const zone = $('zone-document');
  zone.textContent = '⏳ Ouverture…';
  montrer('document');
  if (!cheminFichierValide(d.fichier_chemin)) {
    zone.textContent = '';
    return afficherErreur('erreur-document', 'Ce document est indisponible.');
  }
  // Adresse neuve à chaque ouverture : le réseau de diffusion du stockage garde en mémoire une réponse
  // par adresse sans revérifier les droits ; sans ce paramètre, un document déjà lu resterait
  // ouvrable après son retrait par le praticien.
  const r = await appelAuth(
    '/storage/v1/object/authenticated/patient-documents/' + d.fichier_chemin + '?v=' + nonce(),
    { cache: 'no-store' }
  );
  if (!r || !r.ok) {
    zone.textContent = '';
    return afficherErreur(
      'erreur-document',
      r && r.status === 400
        ? 'Ce document n’est plus disponible. Contactez votre praticien.'
        : 'Impossible d’ouvrir le document. Vérifiez votre réseau puis réessayez.'
    );
  }
  const html = await r.text();
  zone.textContent = '';
  const cadre = document.createElement('iframe');
  // Aucun script possible (l'option qui les autorise est volontairement absente) ; les deux
  // options présentes servent uniquement à lancer l'impression depuis cette page.
  cadre.setAttribute('sandbox', 'allow-same-origin allow-modals');
  cadre.setAttribute('title', d.titre);
  cadre.srcdoc = html;
  zone.appendChild(cadre);
  $('btn-document-imprimer').hidden = false;
  if (!d.lu_at && !APERCU) {
    d.lu_at = new Date().toISOString();
    appelAuth('/rest/v1/rpc/portail_document_lu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: d.id }),
    });
    afficherPastille();
  }
}

function imprimerDocument() {
  const cadre = $('zone-document').querySelector('iframe');
  if (!cadre) return;
  try {
    cadre.contentWindow.focus();
    cadre.contentWindow.print();
  } catch {
    afficherErreur('erreur-document', 'Impression impossible. Essayez depuis un ordinateur.');
  }
}

// ─── Mes exercices : programme du patient (lot e3b-2a, lecture seule) ───
let programme = null; // { contenu, publie_at } ou null
let jourCourant = 0;
let seanceCourante = 0;

const MOIS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
const JOURS_NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function dateLongue(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${JOURS_NOMS[d.getUTCDay()]} ${+m[3]} ${MOIS_COURTS[+m[2] - 1]} ${m[1]}`;
}
function aujourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function chargerProgramme() {
  const r = await appelAuth(
    '/rest/v1/programmes_patient?select=contenu,publie_at' +
      (APERCU ? '&patient_id=eq.' + APERCU : '')
  );
  if (!r || !r.ok) return undefined; // erreur réseau
  try {
    const l = await r.json();
    return Array.isArray(l) && l.length ? l[0] : null;
  } catch {
    return undefined;
  }
}

// Séances validées par le patient (jour|séance → ligne).
let validations = new Map();
async function chargerValidations() {
  const r = await appelAuth(
    '/rest/v1/programme_validations?select=jour,seance_id,commentaire,valide_at&order=jour.asc' +
      (APERCU ? '&patient_id=eq.' + APERCU : '')
  );
  if (!r || !r.ok) return undefined;
  try {
    return indexerValidations(await r.json());
  } catch {
    return undefined;
  }
}

// Exercices validés automatiquement par le chrono (jour|séance|rang).
let exosValides = new Set();
const exosEnAttente = new Map(); // envois à refaire (réseau coupé) : clé → { jour, seance, exo }
async function chargerExosValides() {
  const r = await appelAuth(
    '/rest/v1/programme_exos_valides?select=jour,seance_id,exo' +
      (APERCU ? '&patient_id=eq.' + APERCU : '')
  );
  if (!r || !r.ok) return undefined;
  try {
    return indexerExos(await r.json());
  } catch {
    return undefined;
  }
}

async function majCarteExercices() {
  const [p, v, x] = await Promise.all([
    chargerProgramme(),
    chargerValidations(),
    chargerExosValides(),
  ]);
  if (p === undefined) return;
  programme = p;
  if (v !== undefined) validations = v;
  if (x !== undefined) exosValides = x;
  const c = p && p.contenu;
  let phrase = 'Programme bientôt disponible';
  if (c && c.jours && c.jours.length) {
    const auj = jourProgramme(c, aujourdhuiISO());
    phrase = situationJour(c, auj.index, validations, aujourdhuiISO()).aJour
      ? 'Bravo, vous êtes à jour 🎉'
      : 'Votre programme du jour';
  }
  $('phrase-exercices').textContent = phrase;
}

function elt(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

// Fiche PDF : sur la même page, dans un cadre sous l'exercice (fiche livrée avec l'application ou fiche privée lue
// avec la session ; jamais un chemin libre : tout est contrôlé dans patient-logique.mjs).
// `cibleCadre` : zone pleine largeur sous les sous-exercices où s'ouvre la fiche (les colonnes sont trop étroites).
function boutonFiche(ex, cibleCadre) {
  const zone = elt('div', 'zone-fiche');
  const b = elt('button', 'btn-fiche', '📄 Fiche PDF (avec QR)');
  b.type = 'button';
  let cadre = null;
  b.addEventListener('click', async () => {
    if (cadre) {
      cadre.remove();
      cadre = null;
      b.textContent = '📄 Fiche PDF (avec QR)';
      return;
    }
    cadre = document.createElement('iframe');
    cadre.className = 'cadre-fiche';
    cadre.setAttribute('title', 'Fiche : ' + ex.nom);
    if (ex.pdfPublic) {
      cadre.src = ex.pdfPublic;
    } else {
      b.disabled = true;
      const r = await appelAuth(
        '/storage/v1/object/authenticated/exercices-pdf/' + ex.pdfPrive + '?v=' + nonce(),
        { cache: 'no-store' }
      );
      b.disabled = false;
      if (!r || !r.ok) {
        cadre = null;
        return afficherErreur('erreur-exercices', 'Impossible d’ouvrir la fiche. Réessayez.');
      }
      cadre.src = URL.createObjectURL(
        new Blob([await r.arrayBuffer()], { type: 'application/pdf' })
      );
    }
    (cibleCadre || zone).appendChild(cadre);
    b.textContent = '✖ Fermer la fiche';
  });
  zone.appendChild(b);
  if (ex.pdfPublic) {
    const a = elt('a', 'btn-fiche', '↗ Ouvrir dans un nouvel onglet');
    a.href = ex.pdfPublic;
    a.target = '_blank';
    a.rel = 'noopener';
    zone.appendChild(a);
  }
  return zone;
}

function blocSousExercice(ex, cibleCadre) {
  const bloc = elt('div', 'sous-exercice');
  bloc.appendChild(elt('h3', '', ex.nom));
  for (const url of ex.videos) {
    const f = document.createElement('iframe');
    f.className = 'video';
    f.src = url;
    f.setAttribute('title', 'Vidéo : ' + ex.nom);
    f.setAttribute('loading', 'lazy');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture');
    f.setAttribute('allowfullscreen', '');
    bloc.appendChild(f);
  }
  if (ex.texte) bloc.appendChild(elt('p', 'texte-exercice', ex.texte));
  if (ex.pdfPublic || ex.pdfPrive) bloc.appendChild(boutonFiche(ex, cibleCadre));
  return bloc;
}

// ─── Chrono d'une séance : pause, « Passer », bips du navigateur (lot e3b-2b) ───
const chrono = {
  compte: 0, // exercices déjà traités (validés ou passés) dans le passage en cours
  plan: null,
  seance: null,
  etat: 'pret',
  base: 0,
  depart: null,
  timer: null,
  index: -1,
};
let audio = null;
let verrouEcran = null;

function sonActif() {
  try {
    return localStorage.getItem('verticy-patient-son') !== '0';
  } catch {
    return true;
  }
}
// Le navigateur n'autorise le son qu'après un geste du patient : on prépare l'audio au clic.
function preparerAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}
function bip(frequence, dureeMs, delaiMs) {
  if (!sonActif() || !audio) return;
  try {
    const t0 = audio.currentTime + (delaiMs || 0) / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequence;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dureeMs / 1000);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dureeMs / 1000 + 0.05);
  } catch {
    /* le son est un plus : jamais bloquant */
  }
}
function vibrer(motif) {
  try {
    if (navigator.vibrate && sonActif()) navigator.vibrate(motif);
  } catch {
    /* sans effet */
  }
}
async function garderEcranAllume() {
  try {
    if (navigator.wakeLock && !verrouEcran) {
      verrouEcran = await navigator.wakeLock.request('screen');
      verrouEcran.addEventListener('release', () => {
        verrouEcran = null;
      });
    }
  } catch {
    verrouEcran = null;
  }
}
function relacherEcran() {
  try {
    if (verrouEcran) verrouEcran.release();
  } catch {
    /* sans effet */
  }
  verrouEcran = null;
}

function ecouleMs() {
  return chrono.base + (chrono.depart === null ? 0 : Date.now() - chrono.depart);
}
function nomsExercice(i) {
  const seance = chrono.seance;
  const codes = (seance && seance.exos[i]) || [];
  return codes
    .map((code) => exerciceAffichable(programme.contenu.catalogue, code))
    .filter(Boolean)
    .map((e) => e.nom)
    .join(' + ');
}
// Le bloc chrono vit dans la carte de l'exercice en cours (collé en haut de l'écran pendant qu'on suit la vidéo) ;
// à l'arrêt, à la fin ou au changement de séance il revient à sa place, au-dessus de la liste.
function rangerChrono() {
  const bloc = $('bloc-chrono');
  const liste = $('liste-exercices');
  bloc.classList.remove('dans-carte');
  if (bloc.parentNode !== liste.parentNode) liste.parentNode.insertBefore(bloc, liste);
}
function surlignerExercice(i, defiler) {
  const cartes = document.querySelectorAll('#liste-exercices .exercice');
  if (i < 0 || !cartes[i]) rangerChrono();
  cartes.forEach((carte, k) => {
    carte.classList.toggle('exercice-courant', k === i);
    if (k === i) {
      const bloc = $('bloc-chrono');
      bloc.classList.add('dans-carte');
      const titre = carte.querySelector('h2');
      if (bloc.parentNode !== carte)
        carte.insertBefore(bloc, titre ? titre.nextSibling : carte.firstChild);
      if (defiler) carte.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
}
function afficherBoutonsChrono() {
  const e = chrono.etat;
  const bloc = $('bloc-chrono');
  const d = $('btn-chrono-demarrer');
  d.hidden = e === 'marche';
  d.textContent =
    { pret: '▶ Lancer le chrono', pause: '▶ Reprendre', fin: '↺ Refaire le chrono' }[e] || '';
  $('btn-chrono-pause').hidden = e !== 'marche';
  $('btn-chrono-passer').hidden = e !== 'marche' && e !== 'pause';
  $('btn-chrono-recommencer').hidden = e !== 'marche' && e !== 'pause';
  $('btn-chrono-arreter').hidden = e !== 'marche' && e !== 'pause';
  if (e === 'pret') bloc.dataset.phase = 'prep';
  if (e === 'fin') bloc.dataset.phase = 'fin';
}
function majChrono() {
  if (!chrono.plan) return;
  validerExosTermines();
  const e = etatChrono(chrono.plan, ecouleMs());
  if (e.termine) return finirChrono();
  const bloc = $('bloc-chrono');
  const total = chrono.plan.nbExos;
  if (chrono.etat === 'pause') {
    bloc.dataset.phase = 'pause';
    $('chrono-etat').textContent = '⏸ En pause';
  } else {
    bloc.dataset.phase = e.phase;
    $('chrono-etat').textContent =
      e.phase === 'prep'
        ? 'Préparez-vous…'
        : e.phase === 'travail'
          ? '💪 Effort !'
          : (exosValides.has(cleExo(...cleSeanceCourante(), e.exo)) ? '✓ Exercice validé · ' : '') +
            (e.exo + 1 < total
              ? '😮‍💨 Repos — ensuite : exercice ' + (e.exo + 2)
              : '😮‍💨 Repos — dernier exercice terminé');
  }
  $('chrono-temps').textContent = formaterTemps(e.restantS);
  $('chrono-exo').textContent =
    e.phase === 'prep'
      ? `Exercice 1 sur ${total}` + (nomsExercice(0) ? ' : ' + nomsExercice(0) : '')
      : `Exercice ${e.exo + 1} sur ${total}` +
        (nomsExercice(e.exo) ? ' : ' + nomsExercice(e.exo) : '');
  if (e.index !== chrono.index) {
    const premier = chrono.index === -1;
    chrono.index = e.index;
    surlignerExercice(e.exo, chrono.etat === 'marche' && e.phase !== 'repos');
    if (!premier || e.phase !== 'prep') {
      if (e.phase === 'travail') bip(880, 220);
      if (e.phase === 'repos') bip(520, 220);
      vibrer(e.phase === 'travail' ? [150] : [80]);
    }
  }
}
function lancerCompteur() {
  if (chrono.timer) clearInterval(chrono.timer);
  chrono.timer = setInterval(majChrono, 200);
}
function arreterCompteur() {
  if (chrono.timer) clearInterval(chrono.timer);
  chrono.timer = null;
}
function demarrerChrono() {
  if (!chrono.plan) return;
  preparerAudio();
  if (chrono.etat === 'fin') {
    chrono.base = 0;
    chrono.index = -1;
    chrono.compte = 0;
  }
  chrono.depart = Date.now();
  chrono.etat = 'marche';
  afficherBoutonsChrono();
  garderEcranAllume();
  lancerCompteur();
  majChrono();
}
function pauseChrono() {
  if (chrono.etat !== 'marche') return;
  chrono.base = ecouleMs();
  chrono.depart = null;
  chrono.etat = 'pause';
  arreterCompteur();
  relacherEcran();
  afficherBoutonsChrono();
  majChrono();
}
function sauterChrono(vers) {
  if (!chrono.plan || (chrono.etat !== 'marche' && chrono.etat !== 'pause')) return;
  chrono.base = vers(chrono.plan, ecouleMs());
  // Passer saute l'exercice : il n'est pas validé ; Recommencer revient en arrière sans rien défaire.
  chrono.compte = exosTermines(chrono.plan, chrono.base);
  if (chrono.depart !== null) chrono.depart = Date.now();
  majChrono();
}
function finirChrono() {
  arreterCompteur();
  relacherEcran();
  chrono.etat = 'fin';
  chrono.base = 0;
  chrono.depart = null;
  chrono.index = -1;
  afficherBoutonsChrono();
  surlignerExercice(chrono.plan.nbExos - 1, false);
  $('chrono-etat').textContent = '🎉 Séance terminée !';
  $('chrono-temps').textContent = formaterTemps(0);
  $('chrono-exo').textContent = '';
  bip(880, 160, 0);
  bip(880, 160, 260);
  bip(1175, 380, 520);
  vibrer([200, 100, 200, 100, 400]);
  $('bloc-chrono').scrollIntoView({ block: 'start', behavior: 'smooth' });
  validerSeanceAuto();
}
// ─── Validation automatique : exercice terminé → badge « Validé » ; dernier exercice → séance validée ───
function cleSeanceCourante() {
  const { jour, seance } = jourSeanceCourants();
  return [jour.date, seance.id];
}
function jourSeanceCourants() {
  const jour = programme.contenu.jours[jourCourant];
  return { jour, seance: jour.seances[seanceCourante] };
}
function majBadgesExos() {
  if (!programme) return;
  const { jour, seance } = jourSeanceCourants();
  const auj = jour.date === aujourdhuiISO();
  document.querySelectorAll('#liste-exercices .exercice').forEach((carte, i) => {
    const cle = cleExo(jour.date, seance.id, i);
    const ok = exosValides.has(cle);
    const essai = !ok && exosEssai.has(cle);
    carte.classList.toggle('exercice-valide', ok);
    carte.classList.toggle('exercice-essai', essai);
    const badge = carte.querySelector('.badge-valide');
    if (badge) {
      badge.hidden = !ok && !essai;
      badge.textContent = ok ? '✓ Validé' : APERCU ? '✓ Fait (aperçu)' : '✓ Fait (essai)';
    }
    const bt = carte.querySelector('.btn-sans-chrono');
    if (bt) bt.hidden = ok || essai || !(auj || APERCU || jour.date > aujourdhuiISO());
  });
}
async function envoyerExo(jour, seance, exo) {
  const r = await appelAuth('/rest/v1/rpc/programme_exo_valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_jour: jour, p_seance: seance, p_exo: exo }),
  });
  const cle = cleExo(jour, seance, exo);
  if (r && r.ok) exosEnAttente.delete(cle);
  else if (r)
    exosEnAttente.delete(cle); // refus du serveur : inutile de réessayer
  else exosEnAttente.set(cle, { jour, seance, exo }); // pas de réseau : on réessaiera
}
const exosEssai = new Set(); // jour hors aujourd'hui : « Fait (essai) » à l'écran seulement, rien n'est enregistré
function validerExo(i) {
  if (!programme) return;
  const { jour, seance } = jourSeanceCourants();
  const cle = cleExo(jour.date, seance.id, i);
  // Aperçu praticien ou jour d'essai : on montre le résultat à l'écran, SANS rien enregistrer.
  if (APERCU || jour.date !== aujourdhuiISO()) {
    // Jour d'essai (ex. programme qui commence lundi, testé samedi) : visible à l'écran, jamais enregistré.
    exosEssai.add(cle);
    majBadgesExos();
    return;
  }
  if (exosValides.has(cle)) return;
  exosValides.add(cle); // tout de suite à l'écran ; l'envoi suit
  majBadgesExos();
  envoyerExo(jour.date, seance.id, i);
  for (const a of [...exosEnAttente.values()]) envoyerExo(a.jour, a.seance, a.exo);
}
// « J'ai fait cet exercice sans chrono » : valide l'exercice affiché ; si c'était le dernier manquant, la séance se valide.
function validerExoSansChrono(i) {
  validerExo(i);
  validerSeanceSiComplete();
}
function seanceComplete() {
  const { jour, seance } = jourSeanceCourants();
  return seance.exos.every((_, i) => exosValides.has(cleExo(jour.date, seance.id, i)));
}
async function validerSeanceSiComplete() {
  if (APERCU || !programme) return false;
  const { jour, seance } = jourSeanceCourants();
  if (jour.date !== aujourdhuiISO() || validations.has(cleValidation(jour.date, seance.id)))
    return false;
  if (!seanceComplete()) return false;
  return validerSeance();
}
function validerExosTermines() {
  const n = exosTermines(chrono.plan, ecouleMs());
  while (chrono.compte < n) {
    validerExo(chrono.compte);
    chrono.compte += 1;
  }
}
async function validerSeanceAuto() {
  if (!programme) return;
  const { jour, seance } = jourSeanceCourants();
  if (APERCU) {
    $('chrono-etat').textContent = '🎉 Séance terminée ! (Aperçu : rien n’est enregistré.)';
    return;
  }
  if (jour.date !== aujourdhuiISO()) {
    $('chrono-etat').textContent =
      '🎉 Séance terminée ! (Essai : ce n’est pas le jour de cette séance, rien n’est enregistré.)';
    return;
  }
  if (validations.has(cleValidation(jour.date, seance.id))) return;
  if (!seanceComplete()) {
    const manquants = seance.exos
      .map((_, i) => i + 1)
      .filter((n) => !exosValides.has(cleExo(jour.date, seance.id, n - 1)));
    $('chrono-etat').textContent =
      '🎉 Chrono terminé, mais la séance n’est pas validée : exercice ' +
      manquants.join(', ') +
      ' non validé. Utilisez « J’ai fait cet exercice sans chrono ».';
    return;
  }
  $('chrono-etat').textContent = '🎉 Séance terminée ! Validation…';
  const ok = await validerSeance();
  $('chrono-etat').textContent = ok
    ? '🎉 Séance terminée et validée ✅'
    : '🎉 Séance terminée ! La validation n’a pas pu partir : utilisez le bouton en bas de page.';
}

// Remet le chrono à zéro pour la séance affichée (null = on quitte l'écran : tout s'arrête).
function reinitialiserChrono(seance) {
  rangerChrono();
  arreterCompteur();
  relacherEcran();
  chrono.seance = seance;
  chrono.plan = seance ? planChrono(seance) : null;
  chrono.etat = 'pret';
  chrono.base = 0;
  chrono.depart = null;
  chrono.index = -1;
  chrono.compte = 0;
  const bloc = $('bloc-chrono');
  bloc.hidden = !chrono.plan;
  if (!chrono.plan) return;
  $('chk-son').checked = sonActif();
  $('chrono-etat').textContent = 'Prêt ? Lancez le chrono quand vous êtes installé.';
  $('chrono-temps').textContent = formaterTemps(PREPARATION_S);
  $('chrono-exo').textContent = '';
  afficherBoutonsChrono();
}

// ─── Validation d'une séance par le patient ───
function afficherValidation() {
  const c = programme.contenu;
  const jour = c.jours[jourCourant];
  const seance = jour && jour.seances[seanceCourante];
  const bloc = $('bloc-validation');
  bloc.hidden = !seance;
  afficherErreur('erreur-validation', '');
  if (!seance) return;
  const auj = aujourdhuiISO();
  const v = validations.get(cleValidation(jour.date, seance.id));
  const saisie = $('validation-saisie');
  saisie.hidden = true;
  if (v) {
    const com = v.commentaire ? ` Votre mot : « ${v.commentaire} »` : '';
    $('validation-etat').textContent = '✅ Séance validée.' + com;
  } else if (jour.date === auj && !APERCU) {
    $('validation-etat').textContent =
      'La séance se valide toute seule quand tous ses exercices sont validés (chrono jusqu’au bout, ou « J’ai fait cet exercice sans chrono »).';
    saisie.hidden = false;
    $('validation-commentaire').value = '';
    $('btn-valider-seance').disabled = false;
    $('btn-valider-seance').hidden = !seanceComplete(); // secours : tout est validé mais l'envoi de la séance a échoué
  } else if (jour.date === auj) {
    $('validation-etat').textContent = 'Séance pas encore validée par le patient.';
  } else if (jour.date > auj) {
    $('validation-etat').textContent =
      'Jour d’essai : vous pouvez tester le chrono, mais rien n’est enregistré avant le jour de la séance.';
  } else {
    $('validation-etat').textContent =
      'Séance non faite ce jour-là. Ce n’est pas grave, on continue ! 💪';
  }
}
function afficherBravo() {
  const c = programme.contenu;
  const s = situationJour(c, jourCourant, validations, aujourdhuiISO());
  const el = $('bravo');
  el.hidden = !s.aJour;
  el.textContent = s.aJour
    ? jourCourant === c.jours.length - 1
      ? '🎉 Bravo, vous avez terminé votre programme !'
      : '🎉 Bravo, vous êtes à jour !'
    : '';
}
function majPastilles() {
  const jour = programme.contenu.jours[jourCourant];
  document.querySelectorAll('.pastille-seance').forEach((b, i) => {
    const s = jour.seances[i];
    const faite = validations.has(cleValidation(jour.date, s.id));
    b.textContent = `${faite ? '✓ ' : ''}${i + 1}. ${s.titre}`;
  });
}
async function validerSeance() {
  const jour = programme.contenu.jours[jourCourant];
  const seance = jour.seances[seanceCourante];
  const bouton = $('btn-valider-seance');
  const commentaire = $('validation-commentaire').value.trim();
  bouton.disabled = true;
  afficherErreur('erreur-validation', '');
  const r = await appelAuth('/rest/v1/rpc/programme_seance_valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_jour: jour.date,
      p_seance: seance.id,
      p_commentaire: commentaire || null,
    }),
  });
  if (!r || !r.ok) {
    bouton.disabled = false;
    bouton.hidden = false;
    afficherErreur(
      'erreur-validation',
      !r
        ? 'Pas de réseau : votre séance n’est pas encore validée. Réessayez dans un instant.'
        : 'Impossible de valider pour le moment. Réessayez.'
    );
    return false;
  }
  validations.set(cleValidation(jour.date, seance.id), {
    jour: jour.date,
    seance_id: seance.id,
    commentaire: commentaire || null,
    valide_at: new Date().toISOString(),
  });
  majPastilles();
  afficherValidation();
  afficherBravo();
  return true;
}

function afficherSeance() {
  const c = programme.contenu;
  const seance = c.jours[jourCourant].seances[seanceCourante];
  reinitialiserChrono(seance);
  $('phrase-chrono').textContent = seance.chrono
    ? 'Chrono : ' + phraseChrono(seance.chrono) + '.'
    : '';
  const liste = $('liste-exercices');
  liste.textContent = '';
  seance.exos.forEach((codes, i) => {
    const carte = elt('section', 'exercice');
    const titre = elt('h2', '', `Exercice ${i + 1}`);
    const badge = elt('span', 'badge-valide', '✓ Validé');
    badge.hidden = true;
    titre.appendChild(badge);
    carte.appendChild(titre);
    const sans = elt(
      'button',
      'bouton bouton-clair btn-sans-chrono',
      '✋ J’ai fait cet exercice sans chrono'
    );
    sans.type = 'button';
    sans.addEventListener('click', () => validerExoSansChrono(i));
    carte.appendChild(sans);
    // 2 ou 3 sous-exercices simultanés : côte à côte, sous UN SEUL chrono (celui de la carte).
    const grille = elt('div', 'sous-exercices');
    const fiches = elt('div', 'fiches-carte');
    for (const code of codes) {
      const ex = exerciceAffichable(c.catalogue, code);
      if (ex) grille.appendChild(blocSousExercice(ex, fiches));
    }
    grille.dataset.nb = String(Math.min(3, grille.children.length));
    carte.appendChild(grille);
    carte.appendChild(fiches);
    carte.appendChild(carte.querySelector('.btn-sans-chrono'));
    liste.appendChild(carte);
  });
  document.querySelectorAll('.pastille-seance').forEach((b, i) => {
    b.setAttribute('aria-selected', String(i === seanceCourante));
  });
  majPastilles();
  majBadgesExos();
  afficherValidation();
  afficherBravo();
}

function afficherJour() {
  const c = programme.contenu;
  const jour = c.jours[jourCourant];
  $('titre-jour').textContent = libelleJour(c, jourCourant);
  $('date-jour').textContent = dateLongue(jour.date);
  $('btn-jour-prec').disabled = jourCourant <= 0;
  $('btn-jour-suiv').disabled = jourCourant >= c.jours.length - 1;
  const etat = jourProgramme(c, aujourdhuiISO());
  $('info-jour').textContent =
    jourCourant === etat.index
      ? etat.etat === 'avant'
        ? 'Votre programme commencera bientôt.'
        : etat.etat === 'apres'
          ? 'Votre programme est terminé : voici le dernier jour.'
          : ''
      : '';
  const absentes = seancesAbsentes(c, jourCourant);
  if (absentes.length) {
    const phrases = absentes.map((a) =>
      a.date
        ? `${a.titre} : pas de séance ce jour, prochaine le ${dateLongue(a.date)}.`
        : `${a.titre} : pas de séance ce jour.`
    );
    $('info-jour').textContent = [$('info-jour').textContent, ...phrases].filter(Boolean).join(' ');
  }
  const zone = $('choix-seances');
  zone.textContent = '';
  seanceCourante = 0;
  jour.seances.forEach((s, i) => {
    const b = elt('button', 'pastille-seance', `${i + 1}. ${s.titre}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      seanceCourante = i;
      afficherSeance();
    });
    zone.appendChild(b);
  });
  $('aide-seances').hidden = jour.seances.length < 2;
  zone.hidden = jour.seances.length < 2;
  if (jour.date === aujourdhuiISO()) {
    const i = jour.seances.findIndex((s) => !validations.has(cleValidation(jour.date, s.id)));
    if (i > 0) seanceCourante = i;
  }
  afficherSeance();
}

async function ouvrirExercices() {
  afficherErreur('erreur-exercices', '');
  $('zone-exercices').hidden = true;
  $('vide-exercices').hidden = true;
  montrer('exercices');
  const [p, v, x] = await Promise.all([
    chargerProgramme(),
    chargerValidations(),
    chargerExosValides(),
  ]);
  if (v !== undefined) validations = v;
  if (x !== undefined) exosValides = x;
  if (p === undefined && !programme) {
    return afficherErreur(
      'erreur-exercices',
      'Impossible de charger votre programme. Vérifiez votre réseau puis réessayez.'
    );
  }
  if (p !== undefined) programme = p;
  const c = programme && programme.contenu;
  if (!c || !Array.isArray(c.jours) || !c.jours.length) {
    $('vide-exercices').hidden = false;
    return;
  }
  jourCourant = jourProgramme(c, aujourdhuiISO()).index;
  $('zone-exercices').hidden = false;
  afficherJour();
}

// ─── Démarrage ───
$('form-connexion').addEventListener('submit', seConnecter);
$('form-mdp').addEventListener('submit', choisirMotDePasse);
$('mdp1').addEventListener('input', majRegles);
$('mdp2').addEventListener('input', majRegles);
$('btn-deconnexion').addEventListener('click', deconnecter);
$('carte-documents').addEventListener('click', ouvrirDocuments);
$('carte-exercices').addEventListener('click', ouvrirExercices);
$('btn-exercices-retour').addEventListener('click', ouvrirAccueil);
$('btn-chrono-demarrer').addEventListener('click', demarrerChrono);
$('btn-chrono-pause').addEventListener('click', pauseChrono);
$('btn-chrono-passer').addEventListener('click', () => sauterChrono(exerciceSuivantMs));
$('btn-chrono-recommencer').addEventListener('click', () => sauterChrono(debutExerciceMs));
$('btn-chrono-arreter').addEventListener('click', () => reinitialiserChrono(chrono.seance));
$('chk-son').addEventListener('change', (e) => {
  try {
    localStorage.setItem('verticy-patient-son', e.target.checked ? '1' : '0');
  } catch {
    /* préférence non mémorisée */
  }
  if (e.target.checked) preparerAudio();
});
$('btn-valider-seance').addEventListener('click', validerSeance);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && chrono.etat === 'marche') {
    garderEcranAllume();
    majChrono();
  }
});
$('btn-jour-prec').addEventListener('click', () => {
  if (jourCourant > 0) {
    jourCourant -= 1;
    afficherJour();
  }
});
$('btn-jour-suiv').addEventListener('click', () => {
  if (programme && jourCourant < programme.contenu.jours.length - 1) {
    jourCourant += 1;
    afficherJour();
  }
});
$('btn-documents-retour').addEventListener('click', ouvrirAccueil);
$('btn-document-retour').addEventListener('click', () => {
  afficherListeDocuments();
  montrer('documents');
});
$('btn-document-imprimer').addEventListener('click', imprimerDocument);
$('btn-retour').addEventListener('click', () => montrer('connexion'));
$('identifiant').addEventListener('input', (e) => {
  e.target.value = formaterIdentifiant(e.target.value);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}
if (APERCU) {
  const b = document.createElement('div');
  b.className = 'bandeau-apercu';
  b.textContent =
    '👁 Aperçu praticien : vous voyez ce que voit le patient. Lecture seule, rien n’est marqué comme lu.';
  document.body.prepend(b);
}
ouvrirAccueil();
