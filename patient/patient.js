// Portail patient — logique de l'interface (lot b : connexion, choix du mot de passe, accueil).
// Aucune dépendance. Les données du patient ne passent que par la fonction SQL portail_moi()
// (RLS) ; la connexion passe par l'Edge Function patient-connexion (essais limités côté serveur).
import {
  formaterIdentifiant,
  identifiantComplet,
  messageErreur,
  motDePasseAcceptable,
  reglesMotDePasse,
  salutation,
  sessionAExpirer,
} from './patient-logique.mjs';

const SUPA_URL = 'https://tzivizoacdyopwfzerrb.supabase.co';
// Clé publique (anon / publishable) : la même que l'application praticien, protégée par la RLS.
const SUPA_KEY = 'sb_publishable_aE4_BZYwz6bGGvby4XXAgw_k8ULnrYh';
const CLE_SESSION = 'verticy-patient-session';

const $ = (id) => document.getElementById(id);
const ECRANS = ['chargement', 'connexion', 'mdp', 'accueil', 'ferme'];

function montrer(nom) {
  for (const e of ECRANS) $('ecran-' + e).hidden = e !== nom;
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

// ─── Démarrage ───
$('form-connexion').addEventListener('submit', seConnecter);
$('form-mdp').addEventListener('submit', choisirMotDePasse);
$('mdp1').addEventListener('input', majRegles);
$('mdp2').addEventListener('input', majRegles);
$('btn-deconnexion').addEventListener('click', deconnecter);
$('btn-retour').addEventListener('click', () => montrer('connexion'));
$('identifiant').addEventListener('input', (e) => {
  e.target.value = formaterIdentifiant(e.target.value);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}
ouvrirAccueil();
