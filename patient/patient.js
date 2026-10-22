// Portail patient — logique de l'interface (lot b : connexion, choix du mot de passe, accueil).
// Aucune dépendance. Les données du patient ne passent que par la fonction SQL portail_moi()
// (RLS) ; la connexion passe par l'Edge Function patient-connexion (essais limités côté serveur).
import {
  cheminFichierValide,
  dateCourte,
  formaterIdentifiant,
  grouperDocuments,
  identifiantComplet,
  messageErreur,
  motDePasseAcceptable,
  nombreNonLus,
  phraseDocuments,
  reglesMotDePasse,
  salutation,
  sessionAExpirer,
} from './patient-logique.mjs';

const SUPA_URL = 'https://tzivizoacdyopwfzerrb.supabase.co';
// Clé publique (anon / publishable) : la même que l'application praticien, protégée par la RLS.
const SUPA_KEY = 'sb_publishable_aE4_BZYwz6bGGvby4XXAgw_k8ULnrYh';
const CLE_SESSION = 'verticy-patient-session';

const $ = (id) => document.getElementById(id);
const ECRANS = ['chargement', 'connexion', 'mdp', 'accueil', 'ferme', 'documents', 'document'];

function montrer(nom) {
  for (const e of ECRANS) $('ecran-' + e).hidden = e !== nom;
  document.querySelector('.cadre').classList.toggle('large', nom === 'document');
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
    '/rest/v1/documents_partages?select=id,type,titre,date_document,lu_at,created_at,fichier_chemin&order=created_at.desc'
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
  if (!d.lu_at) {
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

// ─── Démarrage ───
$('form-connexion').addEventListener('submit', seConnecter);
$('form-mdp').addEventListener('submit', choisirMotDePasse);
$('mdp1').addEventListener('input', majRegles);
$('mdp2').addEventListener('input', majRegles);
$('btn-deconnexion').addEventListener('click', deconnecter);
$('carte-documents').addEventListener('click', ouvrirDocuments);
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
ouvrirAccueil();
