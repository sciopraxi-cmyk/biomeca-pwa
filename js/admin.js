// ═══════════════════════════════════════════════════════════════════
// Admin helpers — appels Edge Function `admin-users` (Task #56 PR D)
// ═══════════════════════════════════════════════════════════════════
//
// Endpoint : POST {SUPA_URL}/functions/v1/admin-users
// Auth     : authFetch ajoute apikey + Authorization Bearer (refresh JWT
//            transparent). L'Edge Function vérifie email==ADMIN_EMAIL.
// Routing  : action dans le body.
//
// Pour chaque helper, retourne soit le payload de succès parsé, soit
// { ok:false, error: '<status>: <body>' } en cas d'erreur HTTP/network.
// Aucun helper ne throw — le caller doit checker `.ok` ou la présence
// d'un champ d'erreur. Cohérent avec js/storage.js.
//
// Doit être chargé APRÈS js/biomeca.js (utilise authFetch et SUPA_URL).
// ═══════════════════════════════════════════════════════════════════

async function callAdminAction(action, args) {
  try {
    const res = await authFetch(SUPA_URL + '/functions/v1/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(args || {}) }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `${res.status}: ${err}` };
    }
    return res.json();
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Liste les users (auth.users joints à user_data).
// Retourne { users: [{ id, email, modules, licence_payee, formule, engagement,
//   date_debut_abonnement, stripe_customer_id, created_at }, ...] } ou { ok:false, error }.
// NB (task #58) : `modules` est un array (postural|podopedia|podo_sport), pas
// l'ancien enum `droits`. Fallback [] si user_metadata.modules absent.
async function adminListUsers() {
  return callAdminAction('list', {});
}

// Active/désactive la licence d'un user par email.
// Sur value=true : l'Edge Function set aussi engagement='admin_gratuit' +
// date_debut_abonnement=NOW() pour distinguer des paiements Stripe.
// Retourne { ok:true, updated } ou { ok:false, error }.
async function adminSetLicencePayee(email, value) {
  return callAdminAction('setLicencePayee', { email, value });
}

// Change la formule (formule_1..formule_5) d'un user par email.
// Retourne { ok:true, updated } ou { ok:false, error }.
async function adminSetFormule(email, formule) {
  return callAdminAction('setFormule', { email, formule });
}

// Change les modules d'un user par userId (task #58, remplace setDroits).
// modules = array de strings parmi ['postural', 'podopedia', 'podo_sport'].
// L'Edge Function valide le contenu (chaque entrée doit être canonique),
// dédoublonne silencieusement, puis merge avec le user_metadata existant
// — n'écrase pas acces, nom, prenom, trial_start, etc.
// Pas de contrôle de cohérence modules ↔ formule côté serveur (admin =
// override volontaire).
// Retourne { ok:true } ou { ok:false, error }.
async function adminSetModules(userId, modules) {
  return callAdminAction('setModules', { userId, modules });
}

// Set acces d'un user (task #74 E2 phase 3) — écrit UNIQUEMENT
// app_metadata.acces côté serveur (infalsifiable). Utilisé par adminCreateUser
// juste après le signUp pour que le nouveau compte ait dès sa naissance
// une source de vérité app_metadata.
// acces ∈ { gratuit | essai | postural | sport | duo | integral }.
// Retourne { ok:true } ou { ok:false, error }.
async function adminSetAcces(userId, acces) {
  return callAdminAction('setAcces', { userId, acces });
}

// Écrit les seuils posturaux dans app_config (réglage clinique partagé,
// défini par l'admin, appliqué à TOUS les praticiens). Décision produit
// bug #125 Lot 2 : les seuils ne sont pas per-user mais per-cabinet.
// L'Edge vérifie côté serveur que l'appelant est admin ; RLS app_config
// bloque toute écriture via JWT utilisateur.
// thresholds = objet complet (structure identique à POSTURE_THRESHOLDS côté client).
// Retourne { ok:true } ou { ok:false, error }.
async function adminSetPostureThresholds(thresholds) {
  return callAdminAction('setPostureThresholds', { thresholds });
}

// Alias rétrocompat (task #58) — convertit l'ancien enum droits ('all' |
// 'sport' | 'posturo') en array modules CÔTÉ SERVEUR (cf. admin-users
// handleSetDroits qui délègue à handleSetModules après mapping). Conservé
// pour ne pas casser d'anciens callers ; à supprimer dans une PR future
// quand on aura validé qu'il n'y a plus aucun caller actif.
// Préférer adminSetModules pour les nouveaux callers.
// Retourne { ok:true } ou { ok:false, error: 'Invalid droits ...' | ... }.
async function adminSetDroits(userId, droits) {
  return callAdminAction('setDroits', { userId, droits });
}

// Reset admin du lock 30j sur le changement de modules (task #58).
// L'Edge Function set user_data.last_module_change = NULL ; module_changes_count
// est PRÉSERVÉ (historique audit). Action sensible : l'Edge Function log
// adminEmail + targetEmail + timestamp.
// Cas d'usage : user qui s'est trompé hors grace period 7j, ou litige
// support. Identifie par email (pas userId) pour aligner avec les autres
// actions destructives.
// Retourne { ok:true, updated } ou { ok:false, error }.
async function adminResetModuleChangeLock(email) {
  return callAdminAction('setResetModuleChangeLock', { email });
}

// Suspend (active=false) ou tente de réactiver (active=true) un abonnement.
// - active=false : reset formule/engagement/date_debut_abonnement côté user_data.
//   Préserve licence_payee (achat à vie). Miroir admin du webhook
//   customer.subscription.deleted.
// - active=true : refusé serveur-side (la réactivation passe par Stripe).
//   Pour donner un accès gratuit à un user : enchaîner setLicencePayee(true)
//   puis setFormule(formule_X).
// Retourne { ok:true, updated } | { ok:false, error: 'reactivation_must_go_through_stripe' }
// | { ok:false, error }.
async function adminSetSubscriptionActive(email, active) {
  return callAdminAction('setSubscriptionActive', { email, active });
}
