// ⚠️ CE MODULE EST UNE COPIE, PAS LA SOURCE. Le runtime réel est la
// fonction _classifyAuthError inline dans js/biomeca.js (handleLogin).
// Une divergence rend les tests VERTS alors que la prod est cassée.
// Toute modification de la classification doit être faite dans les DEUX
// fichiers, js/biomeca.js D'ABORD.
//
// Pattern test-mirror identique à js/access.mjs, js/auth-detect.mjs,
// js/subscription.mjs, js/sw-routing.mjs.
//
// #127 — classifier les erreurs de login pour distinguer :
//   (a) un vrai échec d'identifiants → message générique flou (anti-énumération
//       de comptes) : « Email ou mot de passe incorrect. »
//   (b) une panne infra (clé API refusée, 5xx, endpoint mort) → message qui
//       déculpabilise l'utilisateur + log technique pour diagnostic.
//
// C'est le mélange des deux cas qui a masqué la panne #77 pendant 2,5 mois :
// GoTrue renvoyait {"message":"Legacy API keys are disabled"} avec status 401,
// le code affichait « Email ou mot de passe incorrect. » et personne ne
// remontait le vrai symptôme.

// Retourne { kind: 'credentials' } ou { kind: 'infra', status, technical }.
// - credentials : le message affiché DOIT rester générique (anti-énumération).
//   Le message technique est volontairement ignoré.
// - infra : le message affiché doit déculpabiliser l'utilisateur (« ce n'est
//   pas votre mot de passe »), le champ technical fournit le détail à logger
//   pour diagnostic (console.error + Sentry).
//
// `status` : code HTTP renvoyé par /auth/v1/token.
// `body`   : payload JSON parsé (ou {} si le parse a échoué).
export function classifyAuthError({ status, body }) {
  const b = body && typeof body === 'object' ? body : {};
  const msg = typeof b.message === 'string' ? b.message : '';
  const msgAlt = typeof b.msg === 'string' ? b.msg : '';
  // GoTrue renvoie invalid_credentials en status 400 avec plusieurs formes
  // au fil des versions — on couvre les 4 patterns observés en prod :
  //   { error_code: 'invalid_credentials' }         → nouveau format
  //   { error: 'invalid_grant' }                    → format OAuth2 classique
  //   { message: 'Invalid login credentials' }      → format GoTrue moderne
  //   { msg: 'Invalid login credentials' }          → format GoTrue legacy
  const looksLikeCredentials =
    status === 400 &&
    (b.error_code === 'invalid_credentials' ||
      b.error === 'invalid_grant' ||
      /invalid login credentials/i.test(msg) ||
      /invalid login credentials/i.test(msgAlt));
  if (looksLikeCredentials) {
    return { kind: 'credentials' };
  }
  const technical =
    msg ||
    msgAlt ||
    (typeof b.error_description === 'string' ? b.error_description : '') ||
    '(pas de message)';
  return { kind: 'infra', status, technical };
}
