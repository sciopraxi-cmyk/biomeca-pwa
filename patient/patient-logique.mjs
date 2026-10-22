// Portail patient — fonctions pures de l'interface (testées sous Vitest).
// Les contrôles qui font foi sont côté serveur (Edge Functions) ; ceux-ci ne servent
// qu'à guider le patient avant l'envoi.

export const MOT_DE_PASSE_MIN = 10;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** « k7m2 9qxp » → « K7M2-9QXP » ; renvoie la saisie nettoyée si incomplète. */
export function formaterIdentifiant(saisie) {
  const s = String(saisie || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return s.length > 4 ? s.slice(0, 4) + '-' + s.slice(4) : s;
}

export function identifiantComplet(saisie) {
  const s = String(saisie || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return s.length === 8 && [...s].every((c) => ALPHABET.includes(c));
}

/** Liste des règles du mot de passe avec leur état (affichées en direct). */
export function reglesMotDePasse(mdp) {
  const m = String(mdp || '');
  return [
    { ok: m.length >= MOT_DE_PASSE_MIN, texte: `Au moins ${MOT_DE_PASSE_MIN} caractères` },
    { ok: m.length > 0 && !/^(.)\1+$/.test(m), texte: 'Pas le même caractère répété' },
    { ok: /[a-z]/.test(m) && /[A-Z]/.test(m), texte: 'Une minuscule et une majuscule' },
    { ok: /[0-9]/.test(m), texte: 'Un chiffre' },
    { ok: /[^A-Za-z0-9]/.test(m), texte: 'Un symbole (par exemple - ou !)' },
  ];
}

export function motDePasseAcceptable(mdp, confirmation) {
  return reglesMotDePasse(mdp).every((r) => r.ok) && mdp === confirmation;
}

/** Texte lisible pour le patient à partir d'une réponse d'erreur du serveur. */
export function messageErreur(statut, corps) {
  const c = corps && typeof corps === 'object' ? corps : {};
  if (c.error === 'bloque') {
    const min = Number(c.minutes) > 0 ? Number(c.minutes) : 15;
    return `Trop d'essais. Réessayez dans ${min} minute${min > 1 ? 's' : ''}.`;
  }
  if (c.error === 'identifiants_incorrects') {
    const r = Number(c.restants);
    const base = 'Identifiant ou mot de passe incorrect.';
    if (r > 0 && r < 5) return `${base} Il vous reste ${r} essai${r > 1 ? 's' : ''}.`;
    return base;
  }
  if (c.error === 'acces_ferme') return 'Votre accès est fermé. Contactez votre praticien.';
  if (c.error === 'billet_invalide') return 'Le temps est écoulé. Recommencez votre connexion.';
  if (c.error === 'mot_de_passe_faible' && typeof c.message === 'string') return c.message;
  if (statut === 0) return 'Pas de connexion internet. Vérifiez votre réseau puis réessayez.';
  if (statut >= 500) return 'Petit souci de notre côté. Réessayez dans un instant.';
  return 'Une erreur est survenue. Réessayez.';
}

/** Vrai si la session doit être renouvelée (moins de 60 s de validité). */
export function sessionAExpirer(session, maintenantS) {
  return (
    !session || typeof session.expires_at !== 'number' || session.expires_at - maintenantS < 60
  );
}

/** Salutation : prénom nettoyé, sinon formule neutre. */
export function salutation(prenom) {
  const p = String(prenom || '')
    .trim()
    .slice(0, 40);
  return p ? `Bonjour ${p} 👋` : 'Bonjour 👋';
}

// ─── Documents partagés (lot b2) ───
export const TYPES_DOCUMENTS = [
  { type: 'devis', emoji: '📄', titre: 'Mes devis' },
  { type: 'facture', emoji: '🧾', titre: 'Mes factures' },
  { type: 'ordonnance', emoji: '💊', titre: 'Mes ordonnances' },
  { type: 'rapport', emoji: '📊', titre: 'Mes bilans' },
];

/** Nombre de documents jamais ouverts (pastille « nouveau »). */
export function nombreNonLus(liste) {
  return (Array.isArray(liste) ? liste : []).filter((d) => d && !d.lu_at).length;
}

/** « 2026-05-17 » → « 17/05/2026 » ; vide si la date est illisible. */
export function dateCourte(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Documents rangés par type (types vides omis), les plus récents d'abord. */
export function grouperDocuments(liste) {
  const l = Array.isArray(liste) ? liste.filter((d) => d && d.id) : [];
  const cle = (d) => `${d.date_document || ''}|${d.created_at || ''}`;
  return TYPES_DOCUMENTS.map((t) => ({
    ...t,
    documents: l.filter((d) => d.type === t.type).sort((a, b) => cle(b).localeCompare(cle(a))),
  })).filter((g) => g.documents.length > 0);
}

/** Phrase courte pour la carte d'accueil. */
export function phraseDocuments(nonLus) {
  if (nonLus <= 0) return 'Devis, factures, ordonnances, bilans';
  return nonLus === 1 ? '1 nouveau document' : `${nonLus} nouveaux documents`;
}

/** Chemin de fichier attendu (même forme que côté serveur) : jamais un chemin tordu. */
export function cheminFichierValide(chemin) {
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.html$/.test(String(chemin || ''));
}

/** Identifiant de fiche demandé par l'aperçu praticien (?apercu=<uuid>) ; null si absent ou tordu. */
export function apercuDemande(recherche) {
  const v = new URLSearchParams(String(recherche || '')).get('apercu');
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : null;
}
