// Edge Function api-partenaire — API partenaire v1, lecture seule.
//
// Contrat : docs/api-partenaire-v1.md. Le contrat fait foi ; ce fichier
// l'exécute. Toute divergence est un bug de ce fichier, pas du contrat.
//
// Consommateur : PODAXIA, encart « Mon activité bilan » de son portail
// praticien. Serveur-à-serveur uniquement, jamais depuis un navigateur.
//
// ⚠️ FRONTIÈRE SANTÉ (contrat § 1) — cette fonction ne renvoie QUE des
// agrégats de comptage. Aucune donnée de patient, aucun identifiant,
// aucun contenu de bilan ne franchit cette limite. Les lignes de bilans
// lues ci-dessous ne servent qu'à compter : seuls patient_id (compté
// puis jeté), bilan_date et created_at sont sélectionnés, et rien de
// tout cela ne ressort. Ajouter un champ à la réponse n'est PAS une
// évolution mineure : c'est une modification du contrat.
//
// Prérequis de déploiement, dans l'ordre (contrat § 11) :
//   1. exécuter supabase/migrations/partner-api-licences.sql dans le
//      SQL Editor — AVANT ce déploiement, sinon 503 à chaque appel ;
//   2. supabase secrets set PARTNER_API_KEY_PODAXIA=<48+ octets base64url> ;
//   3. supabase functions deploy api-partenaire --no-verify-jwt
//      (--no-verify-jwt indispensable : la plateforme exigerait sinon un
//      JWT Supabase, rendant /sante inaccessible sans authentification et
//      empêchant l'authentification par jeton partenaire, vérifiée ici).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  agreger,
  corpsActivite,
  corpsErreur,
  corpsSante,
  dateParis,
  estUuidValide,
  modulesActifs,
  modulesInconnus,
  type LigneBilan,
} from '../_shared/partenaire-v1.ts';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PARTNER_CODE = 'PODAXIA';
const QUOTA_HORAIRE = 300; // contrat § 9 — budget de flotte, par clé

// Aucun en-tête CORS (contrat § 12) : interface serveur-à-serveur. Émettre
// Access-Control-Allow-Origin inviterait à porter la clé dans un navigateur.
function reponse(corps: string, status: number, entetes: Record<string, string> = {}): Response {
  return new Response(corps, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      // La réponse ne doit jamais être indexée ni archivée par un
      // intermédiaire, même si l'un d'eux venait à s'intercaler.
      'X-Content-Type-Options': 'nosniff',
      ...entetes,
    },
  });
}

const erreur = (code: string, status: number, entetes: Record<string, string> = {}) =>
  reponse(corpsErreur(code), status, entetes);

/**
 * Comparaison en temps constant (contrat § 3).
 *
 * Un === sur des chaînes s'arrête au premier octet différent : la durée
 * de comparaison renseigne alors sur le nombre d'octets corrects, ce qui
 * permet de reconstituer la clé octet par octet. Ici, la durée ne dépend
 * que des longueurs, jamais du contenu.
 */
function egaliteConstante(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Les longueurs diffèrent : on compare quand même a avec lui-même pour
  // ne pas répondre plus vite, puis on renvoie false.
  const ref = ba.length === bb.length ? bb : ba;
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ ref[i];
  return diff === 0;
}

/**
 * Vérifie le jeton porteur contre le secret.
 *
 * Le secret accepte DEUX valeurs séparées par une virgule, pour permettre
 * une rotation sans coupure (contrat § 3) : on pose `nouvelle,ancienne`,
 * PODAXIA bascule, puis on repose `nouvelle` seule.
 *
 * Retourne 'absente' quand aucun secret n'est configuré : le défaut est
 * fermé, jamais ouvert.
 */
function verifierJeton(req: Request): 'ok' | 'refuse' | 'absente' {
  const secret = Deno.env.get('PARTNER_API_KEY_PODAXIA');
  if (!secret) return 'absente';

  const entete = req.headers.get('Authorization') || '';
  const jeton = entete.replace(/^Bearer\s+/i, '').trim();
  if (!jeton) return 'refuse';

  let valide = false;
  for (const cle of secret.split(',')) {
    const attendue = cle.trim();
    // Pas de court-circuit : on évalue toutes les clés dans tous les cas,
    // pour que la durée ne dise pas laquelle a répondu.
    if (attendue && egaliteConstante(jeton, attendue)) valide = true;
  }
  return valide ? 'ok' : 'refuse';
}

/** Fenêtre horaire UTC fixe 'YYYY-MM-DDTHH' (contrat § 9). */
function fenetreCourante(maintenant: Date): string {
  return maintenant.toISOString().slice(0, 13);
}

/** Secondes jusqu'à la prochaine bascule d'heure, pour Retry-After. */
function secondesAvantProchaineFenetre(maintenant: Date): number {
  const prochaine = new Date(maintenant);
  prochaine.setUTCMinutes(0, 0, 0);
  prochaine.setUTCHours(prochaine.getUTCHours() + 1);
  return Math.max(1, Math.ceil((prochaine.getTime() - maintenant.getTime()) / 1000));
}

/**
 * Incrémente le compteur de débit et dit si le quota est dépassé.
 *
 * Les Edge Functions sont sans état : un compteur en mémoire serait remis
 * à zéro à chaque démarrage à froid et ne serait pas partagé entre
 * instances concurrentes. Le compteur vit donc en base (même mécanique
 * que help_chat_usage).
 *
 * En cas d'échec de lecture ou d'écriture, on LAISSE PASSER la requête :
 * un compteur cassé ne doit pas couper le service à PODAXIA. Le risque
 * inverse — un débit non limité pendant une panne de la table — est
 * borné par le fait que l'authentification, elle, reste exigée.
 */
async function debitDepasse(maintenant: Date): Promise<boolean> {
  const bucket = fenetreCourante(maintenant);
  const { data, error } = await supaAdmin
    .from('partner_api_usage')
    .select('count')
    .eq('partner_code', PARTNER_CODE)
    .eq('bucket', bucket)
    .maybeSingle();
  if (error) {
    console.error('[api-partenaire] lecture compteur', error.message);
    return false;
  }
  const compte = data?.count ?? 0;
  if (compte >= QUOTA_HORAIRE) return true;

  const { error: errEcriture } = await supaAdmin
    .from('partner_api_usage')
    .upsert(
      { partner_code: PARTNER_CODE, bucket, count: compte + 1 },
      { onConflict: 'partner_code,bucket' }
    );
  if (errEcriture) console.error('[api-partenaire] écriture compteur', errEcriture.message);
  return false;
}

/**
 * Segments du chemin après le nom de la fonction.
 *
 * L'URL réelle est <base>/api-partenaire/v1/… mais le contrat ne fige que
 * ce qui suit /v1/ (contrat § 3, « URL de base ») : la base est un détail
 * d'hébergement, appelé à changer. On repère donc 'v1' dans le chemin
 * plutôt que de compter les segments depuis la racine, ce qui rend le
 * routage indifférent au préfixe d'hébergement.
 */
function segmentsContractuels(url: URL): string[] {
  const segments = url.pathname.split('/').filter(Boolean);
  const i = segments.lastIndexOf('v1');
  return i === -1 ? [] : segments.slice(i);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ─── HTTPS seul (contrat § 3) ────────────────────────────────────
  // On refuse, on ne redirige pas : une redirection ferait rejouer la
  // requête — et donc la clé — sur le canal en clair. En production
  // Supabase termine déjà le TLS ; ce garde-fou vaut pour tout autre
  // hébergement, la migration prévue comprise.
  const protocole = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  if (protocole !== 'https' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return erreur('https_requis', 400);
  }

  // ─── Lecture seule (contrat § 2) ─────────────────────────────────
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return erreur('methode_non_autorisee', 405, { Allow: 'GET, HEAD' });
  }

  const segments = segmentsContractuels(url);

  // ─── /v1/sante — vivacité, sans authentification (contrat § 4.1) ─
  // Placée AVANT toute vérification de clé et AVANT le compteur : une
  // sonde doit répondre sans clé, et ne doit jamais consommer le budget
  // qu'elle surveille.
  if (segments.length === 2 && segments[1] === 'sante') {
    return reponse(corpsSante(), 200);
  }

  // ─── /v1/activite/{licenceId} ────────────────────────────────────
  if (segments.length !== 3 || segments[1] !== 'activite') {
    return erreur('ressource_introuvable', 404);
  }

  const etatJeton = verifierJeton(req);
  if (etatJeton === 'absente') {
    console.error('[api-partenaire] PARTNER_API_KEY_PODAXIA non configurée');
    return erreur('indisponible', 503);
  }

  const maintenant = new Date();

  // Le débit est décompté avant même le verdict d'authentification : les
  // 401 et les 429 comptent (contrat § 9), sinon la limite ne protégerait
  // de rien face à une énumération non authentifiée.
  if (await debitDepasse(maintenant)) {
    return erreur('debit_depasse', 429, {
      'Retry-After': String(secondesAvantProchaineFenetre(maintenant)),
    });
  }

  // Un 401 ne distingue jamais « clé absente » de « clé fausse » : la
  // distinction dirait à un attaquant que sa clé a la bonne forme.
  if (etatJeton !== 'ok') return erreur('authentification_requise', 401);

  const licenceId = decodeURIComponent(segments[2]).toLowerCase();
  // La forme UUID se vérifie hors ligne, sans nous interroger : ce 400
  // ne renseigne donc sur l'existence de rien (contrat § 7.1).
  if (!estUuidValide(licenceId)) return erreur('licence_id_invalide', 400);

  // ─── Résolution de la licence ────────────────────────────────────
  const { data: licence, error: errLicence } = await supaAdmin
    .from('partner_licences')
    .select('user_id')
    .eq('licence_id', licenceId)
    .eq('partner_code', PARTNER_CODE)
    .eq('active', true)
    .maybeSingle();

  if (errLicence) {
    console.error('[api-partenaire] lecture licence', errLicence.message);
    return erreur('indisponible', 503);
  }

  // AUCUN ORACLE D'EXISTENCE (contrat § 7.1) — licence inconnue, licence
  // existante mais non liée à PODAXIA, et licence révoquée produisent
  // rigoureusement la même réponse : même statut, même corps octet pour
  // octet, mêmes en-têtes. Le filtrage ci-dessus les confond volontairement
  // en une seule branche ; ne jamais les séparer pour « aider au
  // diagnostic », ce serait livrer une cartographie de la clientèle.
  if (!licence) return erreur('licence_introuvable', 404);

  const userId = licence.user_id as string;

  // ─── Bilans : on ne lit QUE de quoi compter ──────────────────────
  // patient_id sert à dénombrer des patients distincts puis est jeté ;
  // il ne ressort jamais. Aucune colonne clinique n'est sélectionnée —
  // surtout pas payload, qui contient le contenu du bilan.
  //
  // ⚠️ PAGINATION OBLIGATOIRE. PostgREST plafonne une réponse à 1000
  // lignes SANS le signaler : un select() nu sur un cabinet dépassant ce
  // seuil renverrait des compteurs silencieusement faux, d'apparence
  // parfaitement normale. C'est précisément le mode de défaillance que
  // cette base proscrit — un chiffre amputé ne doit pas ressembler à un
  // chiffre juste.
  const TAILLE_PAGE = 1000;
  const PLAFOND_PAGES = 100; // 100 000 bilans — garde-fou anti-boucle
  const bilans: LigneBilan[] = [];
  for (let page = 0; ; page++) {
    if (page >= PLAFOND_PAGES) {
      // On refuse de répondre plutôt que de renvoyer un compte tronqué.
      console.error('[api-partenaire] plafond de pagination atteint', { pages: page });
      return erreur('indisponible', 503);
    }
    const debut = page * TAILLE_PAGE;
    const { data: lot, error: errBilans } = await supaAdmin
      .from('bilans')
      .select('patient_id, bilan_date, created_at')
      .eq('user_id', userId)
      .order('id', { ascending: true }) // ordre stable : sans lui, deux pages peuvent se recouvrir ou se manquer
      .range(debut, debut + TAILLE_PAGE - 1);

    if (errBilans) {
      console.error('[api-partenaire] lecture bilans', errBilans.message);
      return erreur('indisponible', 503);
    }
    if (!lot?.length) break;
    bilans.push(...(lot as LigneBilan[]));
    if (lot.length < TAILLE_PAGE) break;
  }

  // ─── Droits du cabinet (contrat § 6) ─────────────────────────────
  const { data: infoUser, error: errUser } = await supaAdmin.auth.admin.getUserById(userId);
  if (errUser) {
    console.error('[api-partenaire] lecture user', errUser.message);
    return erreur('indisponible', 503);
  }
  const internes = (infoUser?.user?.app_metadata as Record<string, unknown> | undefined)?.modules;

  const { data: userData, error: errUserData } = await supaAdmin
    .from('user_data')
    .select('formule')
    .eq('user_id', userId)
    .maybeSingle();
  if (errUserData) {
    console.error('[api-partenaire] lecture user_data', errUserData.message);
    return erreur('indisponible', 503);
  }
  // PEDICURIE se déduit de la formule, pas d'un module interne : la
  // pédicurie est incluse dans toutes les formules (contrat § 6).
  const formuleActive = Boolean(userData?.formule);

  // Un module interne hors vocabulaire est ignoré en sortie, mais
  // journalisé : c'est le signal qu'il faut étendre MODULE_PUBLIC.
  const inconnus = modulesInconnus(internes);
  if (inconnus.length) {
    console.warn('[api-partenaire] modules internes hors vocabulaire v1', inconnus);
  }

  const aujourdhui = dateParis(maintenant);
  const agregats = agreger(bilans, aujourdhui);
  const corps = corpsActivite(licenceId, agregats, modulesActifs(internes, formuleActive));

  // private : aucun cache partagé ne doit conserver cette réponse.
  return reponse(corps, 200, { 'Cache-Control': 'private, max-age=900' });
});
