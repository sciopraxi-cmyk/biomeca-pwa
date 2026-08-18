// ═══════════════════════════════════════════════════════════════════
// API partenaire — activation v1 — logique pure.
// Contrat : docs/api-partenaire-activation-v1.md
//
// Aucun accès réseau, aucun accès base, aucune horloge : tout entre par
// paramètre. C'est ce qui rend le contrat testable octet par octet depuis
// Vitest (tests/partenaire-activation-v1.test.mjs) sans démarrer Deno.
//
// Emplacement : _shared/ et NON js/ — la garde CI #77 impose un bump de
// CACHE_VERSION dès qu'un fichier de js/ change, or ce code est purement
// serveur et n'a rien à faire dans le cache du service worker.
// ═══════════════════════════════════════════════════════════════════

// ─── Vocabulaire public des formules (contrat § 6) ─────────────────
//
// FIGÉ, 7 valeurs. Chaque jeton se résout SANS AMBIGUÏTÉ en un couple
// (formule interne, modules).
//
// Sept jetons et non cinq : les plans Essentiel et Duo Sport comportent un
// choix (posturologie OU podopédiatrie) que le canon ne résout pas seul. Le
// client tranche ce choix sur le site PODAXIA au moment de l'achat ; le
// jeton le porte. Voir § 6 du contrat pour les deux options écartées.
//
// planIdx référence PLAN_MODULES de js/subscription.mjs, qui reste la
// source de vérité du canon. La formule interne vaut 'formule_' + (planIdx+1)
// — correspondance établie par stripe-webhook/index.ts:170.
export interface FormulePartenaire {
  planIdx: number;
  formuleInterne: string;
  modules: string[];
}

export const FORMULES_PARTENAIRE: Record<string, FormulePartenaire> = {
  ESSENTIEL_POSTURO: { planIdx: 0, formuleInterne: 'formule_1', modules: ['postural'] },
  ESSENTIEL_PEDIATRIE: { planIdx: 0, formuleInterne: 'formule_1', modules: ['podopedia'] },
  SPORT: { planIdx: 1, formuleInterne: 'formule_2', modules: ['podo_sport'] },
  DUO: { planIdx: 2, formuleInterne: 'formule_3', modules: ['postural', 'podopedia'] },
  DUO_SPORT_POSTURO: {
    planIdx: 3,
    formuleInterne: 'formule_4',
    modules: ['podo_sport', 'postural'],
  },
  DUO_SPORT_PEDIATRIE: {
    planIdx: 3,
    formuleInterne: 'formule_4',
    modules: ['podo_sport', 'podopedia'],
  },
  INTEGRAL: {
    planIdx: 4,
    formuleInterne: 'formule_5',
    modules: ['postural', 'podopedia', 'podo_sport'],
  },
};

// Valeur d'engagement propre aux activations partenaire (contrat § 11.3).
// PAS 'admin_gratuit', que pose l'activation manuelle : ce serait
// factuellement faux, une activation PODAXIA n'est pas gratuite, elle est
// facturée par Verticy à PODAXIA. PAS non plus 'sans'/'1_an', réservés aux
// paiements Stripe. Champ purement descriptif, il ne conditionne aucun droit.
export const ENGAGEMENT_PARTENAIRE = 'partenaire_podaxia';

// Ordre des clés de la réponse (contrat § 9). Figé.
export const CLES_ACTIVATION = ['licenceId', 'statut'] as const;

/**
 * Résout un jeton public en (formule interne, modules).
 * Retourne null pour tout jeton hors des 7 valeurs figées.
 *
 * Aucune tolérance de casse, aucune correspondance approximative : activer
 * la mauvaise formule est pire que refuser l'appel (contrat § 6).
 */
export function resoudreFormule(jeton: unknown): FormulePartenaire | null {
  if (typeof jeton !== 'string') return null;
  return Object.hasOwn(FORMULES_PARTENAIRE, jeton) ? FORMULES_PARTENAIRE[jeton] : null;
}

// ─── Courriel (contrat § 10.1) ─────────────────────────────────────

/**
 * Normalise un courriel : espaces retirés, minuscules.
 * `Camille@X.FR` et `camille@x.fr` désignent le même compte.
 */
export function normaliserEmail(brut: unknown): string {
  return typeof brut === 'string' ? brut.trim().toLowerCase() : '';
}

// Contrôle de forme volontairement simple (contrat § 10.1) : un @, un
// domaine avec un point, pas d'espace. La délivrabilité n'est PAS vérifiée —
// c'est l'invitation elle-même qui fait foi.
const RE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function estEmailValide(normalise: string): boolean {
  return normalise.length > 0 && normalise.length <= 254 && RE_EMAIL.test(normalise);
}

// ─── partner_ref ───────────────────────────────────────────────────

/** Clé d'idempotence : chaîne non vide, bornée (contrat § 5). */
export function normaliserPartnerRef(brut: unknown): string {
  return typeof brut === 'string' ? brut.trim() : '';
}

export function estPartnerRefValide(normalise: string): boolean {
  return normalise.length > 0 && normalise.length <= 200;
}

// ─── Concordance d'un rejeu (contrat § 8.1) ────────────────────────

export interface LicenceExistante {
  emailCompte: string;
  formulePartenaire: string | null;
}

/**
 * Un rappel portant une partner_ref connue est-il un rejeu, ou une
 * contradiction ?
 *
 * Rejeu SEULEMENT si le courriel normalisé ET le jeton de formule
 * correspondent à la licence existante. Toute divergence est une
 * contradiction — erreur de saisie, ou réutilisation d'une référence déjà
 * consommée — et vaut 409 reference_incoherente, sans aucune écriture.
 *
 * Absorber ces appels serait le pire des comportements : PODAXIA recevrait
 * un 200 et croirait avoir activé ce qu'il a demandé, alors que rien
 * n'aurait changé côté Verticy.
 *
 * nom et prenom ne participent PAS à la comparaison : descriptifs, ils
 * n'ouvrent aucun droit, et une correction d'orthographe ne doit pas faire
 * échouer une activation. L'original fait foi.
 *
 * Une licence sans formule mémorisée (émise avant ce webhook, colonne à
 * NULL) ne peut pas être contrôlée sur la formule : le contrôle porte alors
 * sur le seul courriel.
 */
export function rejeuConcordant(
  existante: LicenceExistante,
  emailDemande: string,
  jetonDemande: string
): boolean {
  if (normaliserEmail(existante.emailCompte) !== emailDemande) return false;
  if (existante.formulePartenaire === null) return true;
  return existante.formulePartenaire === jetonDemande;
}

// ─── Sérialisation (contrat § 9) ───────────────────────────────────

export type StatutActivation = 'cree' | 'existant';

/**
 * Corps de réponse d'activation, ordre des clés figé.
 *
 * Construit par énumération explicite de CLES_ACTIVATION plutôt que par
 * littéral d'objet : l'ordre est ainsi porté par une valeur testable, et non
 * par l'ordre d'écriture du code.
 */
export function corpsActivation(licenceId: string, statut: StatutActivation): string {
  const source: Record<string, unknown> = { licenceId, statut };
  const ordonne: Record<string, unknown> = {};
  for (const cle of CLES_ACTIVATION) ordonne[cle] = source[cle];
  return JSON.stringify(ordonne);
}

/** Corps d'erreur : objet à clé unique, aucun message libre (contrat § 10). */
export function corpsErreur(code: string): string {
  return JSON.stringify({ erreur: code });
}

// ─── Validation du payload (contrat § 5 et § 10) ───────────────────

export interface PayloadValide {
  partnerRef: string;
  email: string;
  nom: string | null;
  prenom: string | null;
  formule: FormulePartenaire;
  jetonFormule: string;
}

export type ResultatValidation =
  | { ok: true; payload: PayloadValide }
  | { ok: false; erreur: string };

/**
 * Valide le corps de la requête AVANT toute écriture (contrat § 10).
 *
 * Toutes les validations de forme sont faites ici : un appel malformé ne
 * touche jamais la base. L'ordre des contrôles suit celui du tableau des
 * erreurs du contrat.
 */
export function validerPayload(corps: unknown): ResultatValidation {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return { ok: false, erreur: 'corps_invalide' };
  }
  const brut = corps as Record<string, unknown>;

  const partnerRef = normaliserPartnerRef(brut.partner_ref);
  if (!estPartnerRefValide(partnerRef)) return { ok: false, erreur: 'partner_ref_manquant' };

  const email = normaliserEmail(brut.email);
  if (!estEmailValide(email)) return { ok: false, erreur: 'email_invalide' };

  const formule = resoudreFormule(brut.formule);
  if (!formule) return { ok: false, erreur: 'formule_inconnue' };

  // Champs descriptifs : bornés, jamais exigés (contrat § 5).
  const texteCourt = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim().slice(0, 120) : '';
    return s.length ? s : null;
  };

  return {
    ok: true,
    payload: {
      partnerRef,
      email,
      nom: texteCourt(brut.nom),
      prenom: texteCourt(brut.prenom),
      formule,
      jetonFormule: brut.formule as string,
    },
  };
}
