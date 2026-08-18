// Edge Function partner-activation — activation automatique PODAXIA → Verticy.
//
// Contrat : docs/api-partenaire-activation-v1.md. Le contrat fait foi ;
// ce fichier l'exécute. Toute divergence est un bug de ce fichier.
//
// Flux : le client paie sa formule sur le site PODAXIA → le portail
// prestataire appelle cette route → les droits Verticy sont posés et la
// licence émise, sans intervention manuelle.
//
// ⚠️ FRONTIÈRE SANTÉ (contrat § 1) — ce flux ne transporte QUE des données
// de compte praticien : référence commerciale, courriel, nom, prénom,
// formule. Aucune donnée de santé, aucune donnée de patient, ni en entrée
// ni en sortie. L'activation crée un compte, elle ne donne à PODAXIA aucun
// accès à ce compte ni à son contenu.
//
// ⚠️ CLÉ D'ÉCRITURE DISTINCTE (contrat § 4) — PARTNER_PROVISION_KEY_PODAXIA,
// jamais PARTNER_API_KEY_PODAXIA. Une clé de lecture divulguée ne doit pas
// permettre de créer des comptes, de poser des droits payants ni de
// provoquer l'envoi de courriels au nom de Verticy.
//
// Prérequis de déploiement, dans l'ordre (contrat § 12) :
//   1. exécuter supabase/migrations/partner-activation.sql dans le
//      SQL Editor — AVANT ce déploiement ;
//   2. supabase secrets set PARTNER_PROVISION_KEY_PODAXIA=<48+ octets> ;
//   3. supabase functions deploy partner-activation --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CLES_ACTIVATION as _CLES_ACTIVATION,
  ENGAGEMENT_PARTENAIRE,
  corpsActivation,
  corpsErreur,
  normaliserEmail,
  rejeuConcordant,
  validerPayload,
  type PayloadValide,
} from '../_shared/partenaire-activation-v1.ts';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PARTNER_CODE = 'PODAXIA';
// Compteur de débit distinct de celui de la lecture : les deux budgets ne se
// consomment pas l'un l'autre (contrat § 11.2).
const PARTNER_CODE_DEBIT = 'PODAXIA_PROVISION';
const QUOTA_HORAIRE = 60;

// Aucun en-tête CORS (contrat § 3, même régime que la lecture) : interface
// serveur-à-serveur, aucun navigateur ne doit porter la clé d'écriture.
function reponse(corps: string, status: number, entetes: Record<string, string> = {}): Response {
  return new Response(corps, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...entetes,
    },
  });
}

const erreur = (code: string, status: number, entetes: Record<string, string> = {}) =>
  reponse(corpsErreur(code), status, entetes);

/** Comparaison en temps constant — identique au § 3 de la lecture. */
function egaliteConstante(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const ref = ba.length === bb.length ? bb : ba;
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ ref[i];
  return diff === 0;
}

function verifierJeton(req: Request): 'ok' | 'refuse' | 'absente' {
  const secret = Deno.env.get('PARTNER_PROVISION_KEY_PODAXIA');
  if (!secret) return 'absente';
  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jeton) return 'refuse';
  let valide = false;
  for (const cle of secret.split(',')) {
    const attendue = cle.trim();
    if (attendue && egaliteConstante(jeton, attendue)) valide = true;
  }
  return valide ? 'ok' : 'refuse';
}

function secondesAvantProchaineFenetre(maintenant: Date): number {
  const prochaine = new Date(maintenant);
  prochaine.setUTCMinutes(0, 0, 0);
  prochaine.setUTCHours(prochaine.getUTCHours() + 1);
  return Math.max(1, Math.ceil((prochaine.getTime() - maintenant.getTime()) / 1000));
}

/**
 * Compteur de débit en base (contrat § 11.2).
 *
 * Les Edge Functions sont sans état : un compteur en mémoire serait remis à
 * zéro à chaque démarrage à froid. Même table que la lecture, code de
 * partenaire distinct.
 *
 * Compteur en panne → on laisse passer : une écriture légitime ne doit pas
 * être bloquée par une table de comptage défaillante, l'authentification
 * restant exigée par ailleurs.
 */
async function debitDepasse(maintenant: Date): Promise<boolean> {
  const bucket = maintenant.toISOString().slice(0, 13);
  const { data, error } = await supaAdmin
    .from('partner_api_usage')
    .select('count')
    .eq('partner_code', PARTNER_CODE_DEBIT)
    .eq('bucket', bucket)
    .maybeSingle();
  if (error) {
    console.error('[partner-activation] lecture compteur', error.message);
    return false;
  }
  const compte = data?.count ?? 0;
  if (compte >= QUOTA_HORAIRE) return true;
  const { error: errEcriture } = await supaAdmin
    .from('partner_api_usage')
    .upsert(
      { partner_code: PARTNER_CODE_DEBIT, bucket, count: compte + 1 },
      { onConflict: 'partner_code,bucket' }
    );
  if (errEcriture) console.error('[partner-activation] écriture compteur', errEcriture.message);
  return false;
}

/**
 * Cherche un compte par courriel.
 *
 * ⚠️ L'API admin Supabase n'offre PAS de getUserByEmail, et `listUsers` ne
 * filtre pas : elle pagine l'intégralité des comptes, la comparaison se
 * faisant côté client. Il faut donc parcourir les pages jusqu'à trouver le
 * courriel ou épuiser une page incomplète.
 *
 * Interroger une seule page serait un bug silencieux d'échelle, de la même
 * classe que le plafond PostgREST de l'API de lecture : passé le nombre de
 * comptes tenant dans une page, un praticien existant deviendrait
 * introuvable, on tenterait de l'inviter sur un courriel déjà enregistré,
 * l'invitation échouerait, et cette activation resterait bloquée en 503.
 *
 * Plafond atteint sans réponse → 'erreur', jamais null. Conclure « compte
 * inexistant » à tort enverrait une invitation à un compte existant :
 * mieux vaut refuser de conclure que conclure faux.
 *
 * Divergence assumée avec resolveUserIdByEmail (stripe-webhook), qui renvoie
 * null au plafond : ici cette valeur déclencherait une écriture.
 *
 * @returns le compte, `null` s'il n'existe pas, `'erreur'` si indécidable.
 */
async function trouverCompte(
  email: string
): Promise<{ id: string; email: string } | null | 'erreur'> {
  const PAR_PAGE = 1000;
  const PLAFOND_PAGES = 50; // 50 000 comptes — garde-fou anti-boucle
  for (let page = 1; page <= PLAFOND_PAGES; page++) {
    const { data, error } = await supaAdmin.auth.admin.listUsers({ page, perPage: PAR_PAGE });
    if (error) {
      console.error('[partner-activation] listUsers', { page, message: error.message });
      return 'erreur';
    }
    const comptes = data?.users ?? [];
    const trouve = comptes.find((u) => normaliserEmail(u.email) === email);
    if (trouve) return { id: trouve.id, email: trouve.email ?? '' };
    // Page incomplète = dernière page : le courriel n'existe pas.
    if (comptes.length < PAR_PAGE) return null;
  }
  console.error('[partner-activation] plafond de pagination atteint', { PLAFOND_PAGES });
  return 'erreur';
}

/**
 * Pose les droits — exactement ceux de l'activation manuelle (contrat § 7).
 *
 * date_debut_abonnement n'est écrite QUE si le champ est vide : un praticien
 * déjà client de Verticy qui bascule chez PODAXIA ne doit pas voir son
 * ancienneté réinitialisée.
 */
async function poserDroits(userId: string, email: string, p: PayloadValide): Promise<boolean> {
  const { data: existant, error: errLecture } = await supaAdmin
    .from('user_data')
    .select('date_debut_abonnement')
    .eq('user_id', userId)
    .maybeSingle();
  if (errLecture) {
    console.error('[partner-activation] lecture user_data', errLecture.message);
    return false;
  }

  const update: Record<string, unknown> = {
    user_id: userId,
    email,
    licence_payee: true,
    formule: p.formule.formuleInterne,
    engagement: ENGAGEMENT_PARTENAIRE,
  };
  if (!existant?.date_debut_abonnement) {
    update.date_debut_abonnement = new Date().toISOString();
  }

  // UPSERT par user_id : un compte sans ligne user_data (jamais connecté)
  // ne peut pas se voir imposer une formule via UPDATE — motif #126,
  // identique à admin-users et stripe-webhook.
  const { error: errUpsert } = await supaAdmin
    .from('user_data')
    .upsert(update, { onConflict: 'user_id' });
  if (errUpsert) {
    console.error('[partner-activation] upsert user_data', errUpsert.message);
    return false;
  }

  // Modules dans app_metadata : infalsifiable côté client, contrairement à
  // user_metadata (durcissement #74 E2).
  const { data: infoUser, error: errGet } = await supaAdmin.auth.admin.getUserById(userId);
  if (errGet) {
    console.error('[partner-activation] getUserById', errGet.message);
    return false;
  }
  const appMeta = (infoUser?.user?.app_metadata as Record<string, unknown>) ?? {};
  const { error: errMeta } = await supaAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { ...appMeta, modules: p.formule.modules },
  });
  if (errMeta) {
    console.error('[partner-activation] updateUserById', errMeta.message);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ─── HTTPS seul (contrat § 4) ────────────────────────────────────
  // Refusé, jamais redirigé : une redirection ferait rejouer la requête —
  // et donc la clé d'écriture — sur le canal en clair.
  const protocole = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  if (protocole !== 'https' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return erreur('https_requis', 400);
  }

  // ─── POST exclusivement (contrat § 2) ────────────────────────────
  if (req.method !== 'POST') return erreur('methode_non_autorisee', 405, { Allow: 'POST' });

  const segments = url.pathname.split('/').filter(Boolean);
  const i = segments.lastIndexOf('v1');
  if (i === -1 || segments[i + 1] !== 'activation') {
    return erreur('ressource_introuvable', 404);
  }

  const etatJeton = verifierJeton(req);
  if (etatJeton === 'absente') {
    console.error('[partner-activation] PARTNER_PROVISION_KEY_PODAXIA non configurée');
    return erreur('indisponible', 503);
  }

  const maintenant = new Date();
  // Les 401 et 429 sont décomptés (contrat § 11.2).
  if (await debitDepasse(maintenant)) {
    return erreur('debit_depasse', 429, {
      'Retry-After': String(secondesAvantProchaineFenetre(maintenant)),
    });
  }
  if (etatJeton !== 'ok') return erreur('authentification_requise', 401);

  // ─── Validation AVANT toute écriture (contrat § 10) ──────────────
  let corps: unknown;
  try {
    corps = await req.json();
  } catch (_e) {
    return erreur('corps_invalide', 400);
  }
  const validation = validerPayload(corps);
  if (!validation.ok) return erreur(validation.erreur, 400);
  const p = validation.payload;

  // ─── Idempotence : la partner_ref est-elle déjà connue ? ─────────
  const { data: dejaVue, error: errRef } = await supaAdmin
    .from('partner_licences')
    .select('licence_id, user_id, compte_cree, formule_partenaire, active')
    .eq('partner_code', PARTNER_CODE)
    .eq('partner_ref', p.partnerRef)
    .maybeSingle();
  if (errRef) {
    console.error('[partner-activation] lecture partner_ref', errRef.message);
    return erreur('indisponible', 503);
  }

  if (dejaVue) {
    // Rejeu ou contradiction ? On compare le courriel du compte lié et le
    // jeton de formule mémorisé (contrat § 8.1).
    const { data: infoUser, error: errUser } = await supaAdmin.auth.admin.getUserById(
      dejaVue.user_id as string
    );
    if (errUser) {
      console.error('[partner-activation] getUserById rejeu', errUser.message);
      return erreur('indisponible', 503);
    }
    const concordant = rejeuConcordant(
      {
        emailCompte: infoUser?.user?.email ?? '',
        formulePartenaire: (dejaVue.formule_partenaire as string | null) ?? null,
      },
      p.email,
      p.jetonFormule
    );
    // Divergence = contradiction, pas rejeu. Rien n'est écrit : réconcilier
    // automatiquement reviendrait à choisir seul quelle version croire.
    if (!concordant) return erreur('reference_incoherente', 409);

    // Rejeu concordant. Les droits sont reposés (idempotent), la licence
    // réactivée si elle avait été révoquée (contrat § 8.2), et le statut
    // d'origine rejoué à l'identique.
    if (!(await poserDroits(dejaVue.user_id as string, p.email, p))) {
      return erreur('indisponible', 503);
    }
    if (dejaVue.active !== true) {
      const { error: errReact } = await supaAdmin
        .from('partner_licences')
        .update({ active: true, revoked_at: null })
        .eq('licence_id', dejaVue.licence_id as string);
      if (errReact) {
        console.error('[partner-activation] réactivation', errReact.message);
        return erreur('indisponible', 503);
      }
    }
    // 200 et non 201, même si le premier appel avait créé le compte : 201
    // affirme une création, et un rejeu ne crée rien (contrat § 8).
    return reponse(
      corpsActivation(
        dejaVue.licence_id as string,
        dejaVue.compte_cree === true ? 'cree' : 'existant'
      ),
      200
    );
  }

  // ─── Nouvelle activation ─────────────────────────────────────────
  const compte = await trouverCompte(p.email);
  if (compte === 'erreur') return erreur('indisponible', 503);

  let userId: string;
  let compteCree: boolean;

  if (compte) {
    userId = compte.id;
    compteCree = false;
  } else {
    // Invitation : le praticien définit LUI-MÊME son mot de passe par
    // courriel. Verticy ne génère, ne connaît et ne transmet aucun mot de
    // passe — PODAXIA non plus.
    const { data: invite, error: errInvite } = await supaAdmin.auth.admin.inviteUserByEmail(
      p.email,
      { data: { nom: p.nom ?? undefined, prenom: p.prenom ?? undefined } }
    );
    if (errInvite || !invite?.user) {
      // Plafond SMTP atteint (contrat § 11.1) ou service indisponible.
      // RIEN n'a été écrit : ni compte, ni droits, ni licence. PODAXIA
      // rejoue plus tard avec la MÊME partner_ref, sans créer de doublon.
      // Un praticien ne doit jamais se retrouver avec des droits et sans
      // moyen de se connecter.
      console.error('[partner-activation] invitation', errInvite?.message ?? 'sans utilisateur');
      return erreur('invitation_indisponible', 503);
    }
    userId = invite.user.id;
    compteCree = true;
  }

  // Un cabinet ne peut avoir qu'UNE licence active par partenaire
  // (contrat § 8.3). Deux références commerciales pour un même cabinet
  // traduisent un double achat ou une erreur de saisie : les réconcilier
  // automatiquement reviendrait à choisir seul laquelle facturer.
  const { data: dejaActive, error: errActive } = await supaAdmin
    .from('partner_licences')
    .select('licence_id')
    .eq('partner_code', PARTNER_CODE)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (errActive) {
    console.error('[partner-activation] lecture licence active', errActive.message);
    return erreur('indisponible', 503);
  }
  if (dejaActive) return erreur('licence_active_existante', 409);

  // ─── Ordre des écritures : droits AVANT licence (contrat § 7.4) ──
  // Un échec après les droits laisse le praticien opérationnel et PODAXIA
  // en mesure de rejouer. L'ordre inverse produirait une licence pointant
  // vers un compte sans droits — l'état anormal du § 6 de la lecture.
  if (!(await poserDroits(userId, p.email, p))) return erreur('indisponible', 503);

  const { data: licence, error: errLicence } = await supaAdmin
    .from('partner_licences')
    .insert({
      user_id: userId,
      partner_code: PARTNER_CODE,
      partner_ref: p.partnerRef,
      compte_cree: compteCree,
      formule_partenaire: p.jetonFormule,
    })
    .select('licence_id')
    .single();

  if (errLicence || !licence) {
    console.error('[partner-activation] insertion licence', errLicence?.message ?? 'sans ligne');
    return erreur('indisponible', 503);
  }

  return reponse(
    corpsActivation(licence.licence_id as string, compteCree ? 'cree' : 'existant'),
    compteCree ? 201 : 200
  );
});
