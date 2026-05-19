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
// Retourne { users: [{ id, email, droits, licence_payee, formule, engagement,
//   date_debut_abonnement, stripe_customer_id, created_at }, ...] } ou { ok:false, error }.
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

// Change les droits d'un user par userId (auth.users.id, pas email).
// Merge avec le user_metadata existant côté serveur — n'écrase pas
// acces, nom, prenom, trial_start, etc.
// Retourne { ok:true } ou { ok:false, error }.
async function adminSetDroits(userId, droits) {
  return callAdminAction('setDroits', { userId, droits });
}
