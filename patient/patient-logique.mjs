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
