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

// ─── Programme d'exercices (lot e3b-2a) ───

/** Identifiant YouTube (11 caractères) d'un lien youtu.be / watch / embed / shorts ; null sinon. */
export function videoYoutubeId(url) {
  const m = String(url || '').match(
    /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
  );
  return m ? m[1] : null;
}

/** Adresse du lecteur sans cookie (la seule adresse externe admise par la CSP) ; null si lien non reconnu. */
export function urlLecteurVideo(url) {
  const id = videoYoutubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

/** Fiche PDF livrée avec l'application : adresse relative sûre (jamais un chemin libre) ; null sinon. */
export function pdfPublic(chemin) {
  const c = String(chemin || '');
  if (!/^assets\/fiches\/[a-z0-9-]+\/[^/\\]+\.pdf$/.test(c) || c.includes('..')) return null;
  return '../' + c.split('/').map(encodeURIComponent).join('/');
}

/** Fiche PDF du stockage privé (bucket exercices-pdf) : chemin attendu ; null sinon. */
export function pdfPrive(chemin) {
  const c = String(chemin || '');
  if (c.length > 200 || c.includes('..') || c.startsWith('/') || !/\.pdf$/.test(c)) return null;
  return /^base\/[0-9a-f-]{36}\.pdf$/.test(c) || /^[0-9a-f-]{36}\/[^/\\]+\.pdf$/.test(c) ? c : null;
}

/**
 * Jour du programme à montrer : celui d'aujourd'hui ; avant le début = le premier jour, après la fin = le
 * dernier ; un jour sans séance entre deux jours = le prochain. Renvoie { index, etat } (etat : 'avant' | 'jour' | 'apres')
 * ou null si le programme est vide.
 */
export function jourProgramme(contenu, aujourdhui) {
  const j = contenu && Array.isArray(contenu.jours) ? contenu.jours : [];
  if (!j.length) return null;
  if (aujourdhui < j[0].date) return { index: 0, etat: 'avant' };
  if (aujourdhui > j[j.length - 1].date) return { index: j.length - 1, etat: 'apres' };
  const i = j.findIndex((x) => x.date >= aujourdhui);
  return { index: i, etat: 'jour' };
}

/** « Jour 3 sur 28 » : le rang du programme du pied quand il existe, sinon la position dans la liste. */
export function libelleJour(contenu, index) {
  const j = contenu.jours[index];
  const total = Math.max(...contenu.jours.map((x, i) => x.rang || i + 1));
  return `Jour ${j.rang || index + 1} sur ${total}`;
}

/** Phrase du chrono d'une séance (affichage seul dans ce lot). */
export function phraseChrono(c) {
  if (!c) return '';
  if (c.type === 'tabata') return `${c.travail} s d’effort, ${c.repos} s de repos`;
  return `1 exercice par minute : ${c.travail} s d’effort, ${c.repos} s de repos`;
}

/** Exercice du catalogue sûr à afficher : nom, vidéos reconnues, fiche PDF, texte. */
export function exerciceAffichable(catalogue, code) {
  const e = catalogue && catalogue[code];
  if (!e || typeof e.nom !== 'string') return null;
  const videos = (Array.isArray(e.liens) ? e.liens : []).map(urlLecteurVideo).filter(Boolean);
  return {
    nom: e.nom,
    videos,
    pdfPublic: pdfPublic(e.pdf),
    pdfPrive: pdfPublic(e.pdf) ? null : pdfPrive(e.pdf),
    texte: typeof e.texte === 'string' ? e.texte : '',
  };
}

/**
 * « Mes fiches » : fiches de réathlétisation publiées SANS séance ni chrono (liste `fiches` de la copie du programme).
 * Seules les fiches présentes dans le catalogue de la copie sont rendues (jamais un code libre) ; sans doublon.
 */
export function fichesAffichables(contenu) {
  const l = contenu && Array.isArray(contenu.fiches) ? contenu.fiches : [];
  const vus = new Set();
  const out = [];
  for (const code of l.slice(0, 12)) {
    if (typeof code !== 'string' || vus.has(code)) continue;
    vus.add(code);
    const ex = exerciceAffichable(contenu.catalogue, code);
    if (ex) out.push({ code, ex });
  }
  return out;
}

/**
 * Séances du programme absentes du jour affiché (ex. Express un samedi non coché) avec leur prochaine date.
 * Renvoie [{ id, titre, date }] (date = null s'il n'y en a plus), dans l'ordre des séances du programme.
 */
export function seancesAbsentes(contenu, index) {
  const jours = contenu && Array.isArray(contenu.jours) ? contenu.jours : [];
  if (!jours[index]) return [];
  const ordre = [];
  for (const j of jours)
    for (const s of j.seances || [])
      if (!ordre.some((x) => x.id === s.id)) ordre.push({ id: s.id, titre: s.titre });
  const presentes = new Set((jours[index].seances || []).map((s) => s.id));
  return ordre
    .filter((o) => !presentes.has(o.id))
    .map((o) => {
      const suivant = jours
        .slice(index + 1)
        .find((j) => (j.seances || []).some((s) => s.id === o.id));
      return { id: o.id, titre: o.titre, date: suivant ? suivant.date : null };
    });
}

// ─── Chrono des séances et séances validées (lot e3b-2b) ───

/** Compte à rebours « Prêt ? » avant le premier exercice (secondes). */
export const PREPARATION_S = 5;

function entierBorne(n, min, max) {
  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Plan du chrono d'une séance : « Prêt ? », puis pour chaque exercice un temps d'effort et un temps de repos
 * (Express 20 s/10 s ; échauffement 30/30 ou 45/15 ; programme du pied 45/15). Renvoie null sans chrono valide.
 * { etapes: [{ exo, phase: 'prep'|'travail'|'repos', duree }], total } (durées en secondes, exo = rang à partir de 0).
 */
export function planChrono(seance) {
  const c = seance && seance.chrono;
  const n = seance && Array.isArray(seance.exos) ? seance.exos.length : 0;
  if (
    !c ||
    !entierBorne(c.travail, 1, 600) ||
    !entierBorne(c.repos, 0, 600) ||
    !entierBorne(n, 1, 12)
  )
    return null;
  const etapes = [{ exo: 0, phase: 'prep', duree: PREPARATION_S }];
  for (let i = 0; i < n; i++) {
    etapes.push({ exo: i, phase: 'travail', duree: c.travail });
    if (c.repos > 0) etapes.push({ exo: i, phase: 'repos', duree: c.repos });
  }
  return { etapes, total: etapes.reduce((s, e) => s + e.duree, 0), nbExos: n };
}

/** Début (ms) de chaque étape du plan. */
function debutsEtapes(plan) {
  let t = 0;
  return plan.etapes.map((e) => {
    const d = t;
    t += e.duree * 1000;
    return d;
  });
}

/**
 * État du chrono après `ecouleMs` de temps réellement écoulé (la pause ne compte pas).
 * { termine, index, phase, exo, restantS (arrondi au-dessus), debutMs }
 */
export function etatChrono(plan, ecouleMs) {
  const t = Math.max(0, Number(ecouleMs) || 0);
  const debuts = debutsEtapes(plan);
  const fin = plan.total * 1000;
  if (t >= fin) {
    const dernier = plan.etapes.length - 1;
    return {
      termine: true,
      index: dernier,
      phase: plan.etapes[dernier].phase,
      exo: plan.nbExos - 1,
      restantS: 0,
      debutMs: debuts[dernier],
    };
  }
  let i = debuts.length - 1;
  while (debuts[i] > t) i--;
  const e = plan.etapes[i];
  return {
    termine: false,
    index: i,
    phase: e.phase,
    exo: e.exo,
    restantS: Math.ceil((debuts[i] + e.duree * 1000 - t) / 1000),
    debutMs: debuts[i],
  };
}

/** « Recommencer l'exercice » : retour au début de l'effort de l'exercice en cours (pendant « Prêt ? » : au début). */
export function debutExerciceMs(plan, ecouleMs) {
  const e = etatChrono(plan, ecouleMs);
  if (e.phase === 'prep') return 0;
  const debuts = debutsEtapes(plan);
  return debuts[plan.etapes.findIndex((x) => x.exo === e.exo && x.phase === 'travail')];
}

/** « Passer » : début de l'effort de l'exercice suivant (pendant « Prêt ? » : du premier) ; après le dernier : fin du chrono. */
export function exerciceSuivantMs(plan, ecouleMs) {
  const e = etatChrono(plan, ecouleMs);
  if (e.termine) return plan.total * 1000;
  const debuts = debutsEtapes(plan);
  const cible = e.phase === 'prep' ? 0 : e.exo + 1;
  const i = plan.etapes.findIndex((x) => x.exo === cible && x.phase === 'travail');
  return i === -1 ? plan.total * 1000 : debuts[i];
}

/** « 1:05 » */
export function formaterTemps(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** Clé d'une séance validée : jour + identifiant de séance. */
export function cleValidation(jour, seanceId) {
  return `${jour}|${seanceId}`;
}

/** Séances validées (lignes { jour, seance_id, commentaire, valide_at }) indexées par clé. Les lignes invalides sont ignorées. */
export function indexerValidations(lignes) {
  const m = new Map();
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (l && /^\d{4}-\d{2}-\d{2}$/.test(l.jour) && typeof l.seance_id === 'string') {
      m.set(cleValidation(l.jour, l.seance_id), l);
    }
  }
  return m;
}

/**
 * Situation d'un jour du programme : { total, faites, jourMeme, passe, aJour, nonFaites: [id] }.
 * aJour (« Bravo ») = jour d'aujourd'hui avec toutes ses séances validées.
 */
export function situationJour(contenu, index, validations, aujourdhui) {
  const jour = contenu && Array.isArray(contenu.jours) ? contenu.jours[index] : null;
  if (!jour)
    return { total: 0, faites: 0, jourMeme: false, passe: false, aJour: false, nonFaites: [] };
  const seances = Array.isArray(jour.seances) ? jour.seances : [];
  const faites = seances.filter((s) => validations.has(cleValidation(jour.date, s.id)));
  return {
    total: seances.length,
    faites: faites.length,
    jourMeme: jour.date === aujourdhui,
    passe: jour.date < aujourdhui,
    aJour: jour.date === aujourdhui && seances.length > 0 && faites.length === seances.length,
    nonFaites: seances
      .filter((s) => !validations.has(cleValidation(jour.date, s.id)))
      .map((s) => s.id),
  };
}

// ─── Exercices validés par le chrono (lot e3b-2b, suite) ───

/** Clé d'un exercice validé : jour, séance, rang de l'exercice (à partir de 0). */
export function cleExo(jour, seanceId, exo) {
  return `${jour}|${seanceId}|${exo}`;
}

/** Exercices validés (lignes { jour, seance_id, exo }) : ensemble de clés. Les lignes invalides sont ignorées. */
export function indexerExos(lignes) {
  const s = new Set();
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (
      l &&
      /^\d{4}-\d{2}-\d{2}$/.test(l.jour) &&
      typeof l.seance_id === 'string' &&
      Number.isInteger(l.exo)
    ) {
      s.add(cleExo(l.jour, l.seance_id, l.exo));
    }
  }
  return s;
}

/**
 * Nombre d'exercices dont le temps d'effort est entièrement écoulé (exercices 0 à n-1), donc à valider.
 * Un exercice est terminé dès que son repos commence (ou que le chrono entier est fini).
 */
export function exosTermines(plan, ecouleMs) {
  const e = etatChrono(plan, ecouleMs);
  if (e.termine) return plan.nbExos;
  if (e.phase === 'prep') return 0;
  return e.phase === 'repos' ? e.exo + 1 : e.exo;
}

// ─── Messagerie patient ↔ praticien ───

/** Longueur maximale d'un message (même valeur que le serveur). */
export const MESSAGE_MAX = 1000;

/** Compteur de saisie : caractères restants, dépassement, envoi possible. */
export function compteurMessage(texte, max = MESSAGE_MAX) {
  const t = String(texte ?? '').replace(/\r/g, '');
  const n = [...t.trim()].length;
  const restant = max - [...t].length;
  return { restant, trop: restant < 0, vide: n === 0, envoyable: n > 0 && restant >= 0 };
}

/** Texte lisible pour une erreur de la messagerie (le serveur renvoie un code court dans `message`). */
export function messageErreurMessagerie(statut, corps) {
  const code = corps && typeof corps === 'object' ? String(corps.message || '') : '';
  if (code === 'trop_de_messages')
    return 'Vous avez beaucoup écrit : réessayez dans quelques minutes.';
  if (code === 'messagerie_desactivee')
    return 'La messagerie est fermée pour le moment. Contactez le cabinet par un autre moyen.';
  if (code === 'texte_invalide') return `Écrivez un message de 1 à ${MESSAGE_MAX} caractères.`;
  if (code === 'delai_depasse') return 'Ce message ne peut plus être modifié (5 minutes écoulées).';
  if (code === 'trop_de_modifications') return 'Ce message a déjà été modifié plusieurs fois.';
  if (statut === 0)
    return 'Pas de réseau : votre message n’est pas parti. Il reste dans la zone de saisie, réessayez.';
  if (statut >= 500) return 'Petit souci de notre côté. Réessayez dans un instant.';
  return 'Impossible d’envoyer pour le moment. Réessayez.';
}

/** Phrase de la carte d'accueil. */
export function phraseMessagerie(nonLus, ouverte = true) {
  if (!ouverte) return 'Messagerie fermée pour le moment';
  if (nonLus <= 0) return 'Écrire à votre praticien';
  return nonLus === 1 ? '1 nouveau message' : `${nonLus} nouveaux messages`;
}

/** Secondes restantes → « 4:32 » (jamais négatif). */
export function tempsRestantMessage(s) {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** Horodatage d'une bulle : « 14:05 » le jour même, sinon « 22/10 14:05 » (heure locale). */
export function heureMessage(iso, maintenant = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  const h = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const memeJour =
    d.getFullYear() === maintenant.getFullYear() &&
    d.getMonth() === maintenant.getMonth() &&
    d.getDate() === maintenant.getDate();
  return memeJour ? h : `${p(d.getDate())}/${p(d.getMonth() + 1)} ${h}`;
}

/**
 * Prépare le fil pour l'affichage. `perspective` : 'patient' (le patient écrit ; JAMAIS d'état « Lu »)
 * ou 'praticien' (aperçu : le praticien écrit en son nom et voit « Lu » sous ses messages).
 */
export function preparerFil(lignes, perspective) {
  const moi = perspective === 'praticien' ? 'praticien' : 'patient';
  return (Array.isArray(lignes) ? lignes : [])
    .filter((m) => m && m.id && typeof m.texte === 'string')
    .map((m) => ({
      id: m.id,
      texte: m.texte,
      cree: m.created_at,
      modifie: !!m.modifie_at,
      miens: m.sens === moi,
      resteS: m.sens === moi ? Math.max(0, Number(m.reste_s) || 0) : 0,
      lu: moi === 'praticien' && m.sens === 'praticien' ? !!m.lu_at : null,
    }));
}

// ─── Signature du devis par le patient ───

/** Longueur minimale de tracé (en pixels du cadre) pour ne pas accepter un cadre vide ou un simple point. */
export const TRACE_MIN_PX = 120;

export function traceSuffisant(longueurPx) {
  return Number(longueurPx) >= TRACE_MIN_PX;
}

/** Lignes de devis_etats_patient() → { <id du document>: état }. */
export function indexerEtatsDevis(lignes) {
  const carte = {};
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (l && l.document_id) carte[l.document_id] = l;
  }
  return carte;
}

/** État affichable d'un devis : « signe », « a_signer », « expire » ; null pour tout autre document. */
export function statutDevis(doc, etat) {
  if (!doc || doc.type !== 'devis' || !etat) return null;
  if (etat.signe_at) return 'signe';
  if (etat.signable) return 'a_signer';
  return 'expire';
}

/** Libellé court du badge d'un devis (null = pas de badge). */
export function libelleStatutDevis(statut) {
  if (statut === 'a_signer') return '✍️ À signer';
  if (statut === 'signe') return '✓ Signé';
  if (statut === 'expire') return 'Expiré';
  return null;
}

/** Code de confirmation reçu par un mineur : exactement 6 chiffres (espaces tolérés à la saisie). */
export function codeConfirmationValide(saisie) {
  return /^[0-9]{6}$/.test(String(saisie || '').replace(/\s+/g, ''));
}
export function nettoyerCode(saisie) {
  return String(saisie || '')
    .replace(/[^0-9]/g, '')
    .slice(0, 6);
}

/** « 2026-10-25T14:03:00Z » → « 25/10/2026 à 15:03 » (heure de Paris) ; vide si illisible. */
export function dateHeureFr(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const v = (t) => parts.find((p) => p.type === t).value;
  return `${v('day')}/${v('month')}/${v('year')} à ${v('hour')}:${v('minute')}`;
}

/** Texte lisible pour une erreur de signature (le serveur renvoie un code court dans `message`). */
export function messageErreurSignature(statut, corps) {
  const code =
    corps && typeof corps === 'object' ? String(corps.message || corps.erreur || '') : '';
  if (code === 'devis_expire')
    return 'Ce devis a expiré. Demandez-en un nouveau à votre praticien.';
  if (code === 'devis_introuvable')
    return 'Ce devis n’est plus disponible. Contactez votre praticien.';
  if (code === 'deja_signe') return 'Ce devis est déjà signé.';
  if (code === 'devis_modifie')
    return 'Ce devis a été modifié pendant que vous le lisiez. Rouvrez-le avant de signer.';
  if (code === 'trace_invalide')
    return 'Votre signature n’a pas pu être lue. Dessinez-la à nouveau.';
  if (code === 'code_requis')
    return 'Le code a expiré ou n’est plus valable. Demandez un nouveau code.';
  if (code === 'trop_de_codes')
    return 'Trop de codes demandés. Patientez quelques minutes avant d’en redemander un.';
  if (statut === 0) return 'Pas de réseau : rien n’a été signé. Réessayez.';
  if (statut >= 500) return 'Petit souci de notre côté. Réessayez dans un instant.';
  return 'Impossible de signer pour le moment. Réessayez.';
}

/** Phrase après un code faux (le serveur compte les essais). */
export function messageCodeInvalide(restants) {
  const r = Number(restants);
  if (r > 0) return `Code incorrect. Il vous reste ${r} essai${r > 1 ? 's' : ''}.`;
  return 'Code incorrect. Demandez un nouveau code.';
}

/** Longueur cumulée d'un tracé (liste de segments [x1, y1, x2, y2]). */
export function longueurTrace(segments) {
  let total = 0;
  for (const s of Array.isArray(segments) ? segments : []) {
    if (Array.isArray(s) && s.length === 4) total += Math.hypot(s[2] - s[0], s[3] - s[1]);
  }
  return total;
}
