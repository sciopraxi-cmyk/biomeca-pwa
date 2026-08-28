// ═══════════════════════════════════════════════════════════════════
// PLAN_MODULES — source de vérité mapping plan ↔ modules (task #58)
// ═══════════════════════════════════════════════════════════════════
//
// Test-mirror module : utilisé directement par C3 (showSubscribeModulesView)
// et par les tests Vitest. Sera aussi importé par la prod biomeca.js si on
// décide d'en faire la source unique (sinon duplication assumée comme
// calc.mjs et access.mjs).
//
// Pour chaque plan (indexé 0-4, cohérent avec landing.js _plans et le
// pricing dans index.html lignes 113-117) :
//   - required : array de modules toujours inclus (cochés+disabled en vue 2)
//   - choose : null si aucune flexibilité, sinon {from, count} pour
//              modules au choix (cochables avec contrainte count exact)
//
// IDs de modules canoniques (cohérents avec landing.js _modules ligne 65) :
//   'postural', 'podopedia', 'podo_sport'
//
// Note de cohérence avec landing.js _plans :
//   landing `{fixed:[], choose:2, pool:[...]}` ≡ PR58 `{required:[...], choose:null}`
//     (choose 2/2 dans pool de 2 = forcés les 2 → required)
//   landing `{fixed:[X], choose:1, pool:[A,B]}` ≡ PR58 `{required:[X], choose:{from:[A,B], count:1}}`
//   landing `{fixed:[X,Y,Z], choose:0, pool:[]}` ≡ PR58 `{required:[X,Y,Z], choose:null}`

export const PLAN_MODULES = [
  {
    planIdx: 0,
    name: 'Essentiel',
    required: [],
    choose: { from: ['postural', 'podopedia'], count: 1 },
  },
  { planIdx: 1, name: 'Sport', required: ['podo_sport'], choose: null },
  { planIdx: 2, name: 'Duo', required: ['postural', 'podopedia'], choose: null },
  {
    planIdx: 3,
    name: 'Duo Sport',
    required: ['podo_sport'],
    choose: { from: ['postural', 'podopedia'], count: 1 },
  },
  { planIdx: 4, name: 'Intégral', required: ['postural', 'podopedia', 'podo_sport'], choose: null },
];

// Retourne les modules par défaut d'un plan (required + premiers `count` de choose.from).
// Utilisé par C3 pour initialiser la vue 2 avec une sélection cohérente.
export function defaultModulesForPlan(planIdx) {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return [];
  const fromChoose = plan.choose ? plan.choose.from.slice(0, plan.choose.count) : [];
  return [...plan.required, ...fromChoose];
}

// Valide qu'un set de modules est cohérent avec un plan donné.
// Retourne { ok: true } | { ok: false, reason: 'missing_required' | 'wrong_choose_count' | 'unknown_plan' }.
export function isValidModulesForPlan(planIdx, modules) {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return { ok: false, reason: 'unknown_plan' };
  if (!plan.required.every((m) => modules.includes(m))) {
    return { ok: false, reason: 'missing_required' };
  }
  if (plan.choose) {
    const chosen = modules.filter((m) => plan.choose.from.includes(m)).length;
    if (chosen !== plan.choose.count) {
      return { ok: false, reason: 'wrong_choose_count' };
    }
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════
// canChangeModule — fonction pure testable, test-mirror de
// canChangeModuleServer dans supabase/functions/prepare-module-change/index.ts.
// Toute modif ici DOIT être répercutée serveur et vice-versa. Référence task #58.
//
// Args :
//   userData : { date_debut_abonnement: string | null, last_module_change: string | null }
//   now      : Date (injectable pour tests déterministes)
//
// Retourne null si OK (autorisé), sinon { reason, next_change_date? }.
//
// Logique anti-abus :
//   - Pas de date_debut_abonnement → première souscription, toujours OK.
//   - Dans les 7j post-souscription initiale (grace period) → toujours OK,
//     le user a le droit de tâtonner sur son choix initial de modules.
//   - Hors grace period mais jamais changé (last_module_change === null) → OK.
//   - Hors grace period + dernier changement il y a ≥30j → OK (lock expiré).
//   - Sinon → blocked, avec next_change_date = lastChange + 30j (ISO).
//
// NB : le caller (prepare-module-change) n'appelle canChangeModule QUE si
// modules changent ET plan inchangé (cf. Q3 de task #58 — changement de plan
// = transaction commerciale légitime, exemptée du lock).
// ═══════════════════════════════════════════════════════════════════
export function canChangeModule(userData, now) {
  // Première souscription : pas de date_debut → toujours OK.
  if (!userData.date_debut_abonnement) return null;

  const debut = new Date(userData.date_debut_abonnement).getTime();
  const nowMs = now.getTime();
  const sevenDaysMs = 7 * 86400 * 1000;
  // Grace period 7j post-souscription initiale : changement libre.
  if (nowMs - debut <= sevenDaysMs) return null;

  // Hors grace period : jamais changé → OK.
  if (!userData.last_module_change) return null;

  const lastChange = new Date(userData.last_module_change).getTime();
  const thirtyDaysMs = 30 * 86400 * 1000;
  if (nowMs - lastChange >= thirtyDaysMs) return null;

  // Lock actif : calcule la prochaine date possible.
  return {
    reason: 'locked',
    next_change_date: new Date(lastChange + thirtyDaysMs).toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// describeEngagement — libellé + droit de résilier (task #241)
// ═══════════════════════════════════════════════════════════════════
//
// Test-mirror : le runtime réel est dupliqué dans js/biomeca.js
// (_describeEngagement, appelé par loadAbonnement et resilierAbonnement).
// Toute modification doit être faite dans les DEUX fichiers, sinon les
// tests restent verts pendant que la prod dérive. Cf. access.mjs, auth-error.mjs.
//
// #241 — le client testait `engagement === '12_mois'`, valeur écrite par
// PERSONNE. Les quatre valeurs réellement posées en base sont :
//   'sans'               stripe-webhook/index.ts:130  (abonnement mensuel)
//   '1_an'               stripe-webhook/index.ts:135  (abonnement engagé 12 mois)
//   'admin_gratuit'      admin-users/index.ts:202     (activation manuelle)
//   'partenaire_podaxia' _shared/partenaire-activation-v1.ts:60
// Conséquence du test mort : badge « Sans engagement » pour tout le monde,
// décompte des mois jamais affiché, et blocage de résiliation anticipée
// jamais déclenché depuis l'origine.
//
// Le libellé était binaire (« Engagement 12 mois » / « Sans engagement »), donc
// FAUX pour admin_gratuit et partenaire_podaxia : une licence offerte n'est pas
// un abonnement sans engagement. Une valeur inconnue ne doit JAMAIS retomber
// sur un libellé rassurant — elle affiche la valeur brute et invite à vérifier.

// Libellés des quatre valeurs réellement écrites. Sert aussi de liste des
// valeurs reconnues : toute clé absente d'ici bascule sur le repli explicite.
export const ENGAGEMENT_LABELS = {
  sans: 'Sans engagement',
  '1_an': 'Engagement 12 mois',
  admin_gratuit: 'Licence offerte (activation administrateur)',
  partenaire_podaxia: 'Accès partenaire PODAXIA',
};

// Durée de la période d'engagement de la formule '1_an', en mois.
export const ENGAGEMENT_DUREE_MOIS = 12;

// Args :
//   engagement : valeur brute du champ user_data.engagement (string | null)
//   dateDebut  : user_data.date_debut_abonnement (string ISO | null)
//   now        : Date (injectable pour tests déterministes)
//
// Retourne :
//   etat          'absent' | 'connu' | 'inconnu'
//   label         libellé affichable, jamais faussement rassurant
//   peutResilier  false UNIQUEMENT pour '1_an' encore dans sa fenêtre.
//                 'admin_gratuit' et 'partenaire_podaxia' ne sont pas des
//                 abonnements avec engagement — les bloquer reviendrait à
//                 retenir des comptes qui n'ont rien souscrit.
//   moisRestants  mois restants avant l'échéance (arrondi au supérieur), sinon null
//   finEngagement Date d'échéance de l'engagement, sinon null
//
// ⚠️ Le décompte NE sert PAS à décider du blocage. Compter en mois calendaires
// (l'ancien `12 - moisEcoules`) ignore le jour du mois : un abonnement souscrit
// le 31 janvier 2026 et évalué le 1er janvier 2027 donne (2027−2026)×12+(0−0)
// = 12 mois « écoulés » et se serait libéré 30 jours trop tôt. Le blocage
// compare donc `now` à la date d'échéance réelle ; les mois ne sont qu'un
// affichage, arrondi au supérieur pour ne jamais annoncer « 0 mois restants »
// sur un compte encore bloqué.
export function describeEngagement(engagement, dateDebut, now = new Date()) {
  // Champ absent : compte sans abonnement (ou remis à zéro par l'admin,
  // admin-users/index.ts:414 écrit engagement=null). Rien à bloquer.
  if (!engagement) {
    return {
      etat: 'absent',
      label: 'Aucun abonnement actif',
      peutResilier: true,
      moisRestants: null,
      finEngagement: null,
    };
  }

  // Valeur non reconnue : ne jamais afficher « Sans engagement », qui
  // laisserait croire à une résiliation libre sur un contrat inconnu.
  if (!Object.prototype.hasOwnProperty.call(ENGAGEMENT_LABELS, engagement)) {
    return {
      etat: 'inconnu',
      label: 'Engagement non reconnu (« ' + engagement + ' ») — contactez le support',
      peutResilier: true,
      moisRestants: null,
      finEngagement: null,
    };
  }

  const base = ENGAGEMENT_LABELS[engagement];

  // Les trois valeurs sans engagement : libellé seul, résiliation libre.
  if (engagement !== '1_an') {
    return {
      etat: 'connu',
      label: base,
      peutResilier: true,
      moisRestants: null,
      finEngagement: null,
    };
  }

  // '1_an' sans date de début : l'engagement existe mais son échéance est
  // incalculable. On ne bloque pas (un blocage sans date de sortie serait
  // insoluble pour l'utilisateur) et on le dit au lieu de faire comme si
  // tout était normal.
  if (!dateDebut) {
    return {
      etat: 'connu',
      label: base + ' — date de début inconnue',
      peutResilier: true,
      moisRestants: null,
      finEngagement: null,
    };
  }

  const debut = new Date(dateDebut);
  // setMonth reporte au mois suivant quand le quantième n'existe pas
  // (29 février + 12 mois → 1er mars). Décalage d'un jour assumé, du côté
  // qui retient l'abonné, jamais du côté qui le libère trop tôt.
  const finEngagement = new Date(debut.getTime());
  finEngagement.setMonth(finEngagement.getMonth() + ENGAGEMENT_DUREE_MOIS);

  // Échéance atteinte (comparaison à l'instant près, pas au mois) : libre.
  // Le jour exact de l'échéance, l'engagement est terminé.
  if (now.getTime() >= finEngagement.getTime()) {
    return {
      etat: 'connu',
      label: base + ' — échu',
      peutResilier: true,
      moisRestants: 0,
      finEngagement: finEngagement,
    };
  }

  // Encore engagé : décompte d'affichage, arrondi au mois supérieur.
  let moisRestants =
    (finEngagement.getFullYear() - now.getFullYear()) * 12 +
    (finEngagement.getMonth() - now.getMonth());
  if (finEngagement.getDate() > now.getDate()) moisRestants += 1;
  // Un reste strictement positif mais inférieur au mois doit s'afficher « 1 ».
  if (moisRestants < 1) moisRestants = 1;

  return {
    etat: 'connu',
    label: base + ' — ' + moisRestants + ' mois restants',
    peutResilier: false,
    moisRestants: moisRestants,
    finEngagement: finEngagement,
  };
}
