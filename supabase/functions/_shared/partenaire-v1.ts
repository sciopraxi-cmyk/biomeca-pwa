// ═══════════════════════════════════════════════════════════════════
// API partenaire v1 — logique pure.
// Contrat : docs/api-partenaire-v1.md — ce fichier en est l'exécution.
//
// Aucun accès réseau, aucun accès base, aucune horloge implicite : tout
// ce qui varie (date du jour, lignes de bilans, modules) entre par
// paramètre. C'est ce qui rend le contrat testable octet par octet
// depuis Vitest (tests/partenaire-v1.test.mjs) sans démarrer Deno.
//
// Emplacement : _shared/ et NON js/. La garde CI #77 impose un bump de
// CACHE_VERSION dès qu'un fichier de js/ change ; ce code est purement
// serveur, il n'a rien à faire dans le cache du service worker.
// ═══════════════════════════════════════════════════════════════════

// ─── Vocabulaire public des modules (contrat § 6) ──────────────────
//
// FIGÉ. Ces jetons sont publics et stables : les identifiants internes
// peuvent être renommés lors d'un remaniement, pas eux.
//
// L'ordre de ce tableau EST l'ordre de sortie de modulesActifs. Ce n'est
// pas un tri alphabétique : c'est l'ordre du contrat, et c'est lui qui
// rend deux réponses comparables octet par octet.
export const MODULE_ORDRE = ['POSTURO', 'PEDIATRIE', 'SPORT', 'PEDICURIE'] as const;

// Correspondance identifiant interne → jeton public.
// PEDICURIE n'y figure pas : il n'existe aucun module interne 'pedicurie',
// le jeton se déduit de la formule (cf. modulesActifs ci-dessous).
export const MODULE_PUBLIC: Record<string, string> = {
  postural: 'POSTURO',
  podopedia: 'PEDIATRIE',
  podo_sport: 'SPORT',
};

// ─── Ordre des clés de la réponse d'activité (contrat § 8) ─────────
// Figé. Sert aussi de garde en test : toute permutation casse la
// comparaison aux goldens.
export const CLES_ACTIVITE = [
  'licenceId',
  'patientsActifs',
  'bilansMoisCourant',
  'bilansMoisPrecedent',
  'dernierBilanLe',
  'modulesActifs',
] as const;

export const FENETRE_PATIENTS_ACTIFS_JOURS = 365;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Forme canonique UUID, minuscules, 36 caractères (contrat § 4.2). */
export function estUuidValide(v: unknown): boolean {
  return typeof v === 'string' && RE_UUID.test(v);
}

// ─── Dates, fuseau Europe/Paris (contrat § 5.1) ────────────────────
//
// Toutes les bornes sont calculées à Paris, heure d'été comprise, jamais
// en UTC : un bilan du 1er août à 01:00 Paris appartient au mois d'août
// alors qu'il est encore le 31 juillet à Londres.
//
// On passe par Intl plutôt que par un décalage codé en dur : le passage
// heure d'hiver / heure d'été rendrait faux tout offset fixe.
const FMT_PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Date civile Europe/Paris d'un instant, au format YYYY-MM-DD. */
export function dateParis(instant: Date | string | number): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  // en-CA produit déjà YYYY-MM-DD ; on ne reformate pas à la main.
  return FMT_PARIS.format(d);
}

/**
 * Date de référence d'un bilan (contrat § 5.1).
 *
 * bilan_date si elle est renseignée, SINON la date Europe/Paris de
 * created_at. Le repli existe parce que bilan_date est nullable en base
 * (patients-bilans-schema.sql) : sans lui, un bilan sans date de
 * consultation compterait pour zéro alors qu'il est une activité réelle.
 *
 * Le repli ne s'applique JAMAIS quand bilan_date est renseignée, même
 * incohérente avec created_at : la date saisie par le praticien fait foi,
 * c'est celle qu'il voit à l'écran.
 */
export function dateRef(bilan: {
  bilan_date?: string | null;
  created_at?: string | null;
}): string | null {
  const saisie = bilan.bilan_date;
  if (typeof saisie === 'string' && saisie.length >= 10) return saisie.slice(0, 10);
  if (bilan.created_at) return dateParis(bilan.created_at);
  return null;
}

/** Décale une date YYYY-MM-DD de n jours, en arithmétique civile pure. */
export function decalerJours(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bornes du mois calendaire de `jour` : [premier, dernier] inclus. */
export function bornesMois(jour: string): [string, string] {
  const [a, m] = jour.split('-').map(Number);
  const premier = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const dernierJour = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [premier, `${premier.slice(0, 8)}${String(dernierJour).padStart(2, '0')}`];
}

/** Bornes du mois calendaire précédant celui de `jour`. */
export function bornesMoisPrecedent(jour: string): [string, string] {
  const [premier] = bornesMois(jour);
  return bornesMois(decalerJours(premier, -1));
}

// ─── modulesActifs (contrat § 6) ───────────────────────────────────

/**
 * Jetons publics d'un cabinet, dans l'ordre figé du contrat.
 *
 * @param modulesInternes  app_metadata.modules du praticien.
 * @param formuleActive    true si user_data.formule est renseignée.
 *
 * PEDICURIE ne vient pas de modulesInternes : la pédicurie est incluse
 * dans toutes les formules, il n'existe aucun identifiant interne pour
 * elle. Le jeton est présent dès qu'une formule est active, absent
 * seulement en l'absence de formule.
 *
 * Un identifiant interne inconnu est ignoré silencieusement : inventer un
 * jeton à la volée romprait le vocabulaire figé, alors qu'ajouter une
 * entrée à MODULE_PUBLIC est rétrocompatible. L'appelant journalise.
 */
export function modulesActifs(modulesInternes: unknown, formuleActive: boolean): string[] {
  const jetons = new Set<string>();
  if (Array.isArray(modulesInternes)) {
    for (const interne of modulesInternes) {
      const jeton = MODULE_PUBLIC[String(interne)];
      if (jeton) jetons.add(jeton);
    }
  }
  if (formuleActive) jetons.add('PEDICURIE');
  // On parcourt l'ordre figé, jamais les jetons : le tri sort du contrat,
  // pas de l'ordre d'insertion ni de l'alphabet.
  return MODULE_ORDRE.filter((jeton) => jetons.has(jeton));
}

/** Identifiants internes non couverts par le vocabulaire, pour journalisation. */
export function modulesInconnus(modulesInternes: unknown): string[] {
  if (!Array.isArray(modulesInternes)) return [];
  return modulesInternes.map(String).filter((interne) => !MODULE_PUBLIC[interne]);
}

// ─── Agrégats (contrat § 5) ────────────────────────────────────────

export interface LigneBilan {
  patient_id: string;
  bilan_date?: string | null;
  created_at?: string | null;
}

export interface Agregats {
  patientsActifs: number;
  bilansMoisCourant: number;
  bilansMoisPrecedent: number;
  dernierBilanLe: string | null;
}

/**
 * Agrège les bilans d'un cabinet (contrat § 5).
 *
 * @param bilans  TOUS les bilans du cabinet, statuts in_progress ET
 *                archived confondus (§ 5.2) — le filtrage temporel est
 *                fait ici, pas par l'appelant.
 * @param aujourdhui  Date civile Europe/Paris de l'instant de la requête.
 *
 * Les bilans à date future (consultation pré-datée) sont exclus de TOUS
 * les compteurs et de dernierBilanLe : sans cette règle, une saisie
 * anticipée ferait apparaître une activité qui n'a pas eu lieu.
 */
export function agreger(bilans: LigneBilan[], aujourdhui: string): Agregats {
  const debutFenetre = decalerJours(aujourdhui, -(FENETRE_PATIENTS_ACTIFS_JOURS - 1));
  const [debutMois] = bornesMois(aujourdhui);
  const [debutPrec, finPrec] = bornesMoisPrecedent(aujourdhui);

  const patients = new Set<string>();
  let moisCourant = 0;
  let moisPrecedent = 0;
  let dernier: string | null = null;

  for (const bilan of bilans) {
    const ref = dateRef(bilan);
    if (!ref) continue;
    if (ref > aujourdhui) continue; // bilan pré-daté — § 5.1

    if (dernier === null || ref > dernier) dernier = ref;
    if (ref >= debutFenetre) patients.add(bilan.patient_id);
    // Mois courant : du 1er à aujourd'hui inclus. La borne haute est déjà
    // posée par l'exclusion des dates futures ci-dessus.
    if (ref >= debutMois) moisCourant++;
    else if (ref >= debutPrec && ref <= finPrec) moisPrecedent++;
  }

  return {
    patientsActifs: patients.size,
    bilansMoisCourant: moisCourant,
    bilansMoisPrecedent: moisPrecedent,
    dernierBilanLe: dernier,
  };
}

// ─── Sérialisation (contrat § 8) ───────────────────────────────────

/**
 * Corps de réponse d'activité, ordre des clés figé.
 *
 * Construit par énumération explicite plutôt que par littéral d'objet :
 * l'ordre est ainsi porté par CLES_ACTIVITE, une valeur testable, et non
 * par l'ordre d'écriture du code.
 */
export function corpsActivite(licenceId: string, agregats: Agregats, modules: string[]): string {
  const source: Record<string, unknown> = {
    licenceId,
    patientsActifs: agregats.patientsActifs,
    bilansMoisCourant: agregats.bilansMoisCourant,
    bilansMoisPrecedent: agregats.bilansMoisPrecedent,
    dernierBilanLe: agregats.dernierBilanLe,
    modulesActifs: modules,
  };
  const ordonne: Record<string, unknown> = {};
  for (const cle of CLES_ACTIVITE) ordonne[cle] = source[cle];
  return JSON.stringify(ordonne);
}

/** Corps d'erreur : objet à clé unique, aucun message libre (contrat § 7). */
export function corpsErreur(code: string): string {
  return JSON.stringify({ erreur: code });
}

/** Corps de la sonde de vivacité — constant, sans horodatage (contrat § 4.1). */
export function corpsSante(): string {
  return JSON.stringify({ statut: 'ok', service: 'api-partenaire', version: 'v1' });
}
