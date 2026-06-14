// #85 Phase 1 — détection JWT-issue dans une réponse Supabase. Extrait du
// retry one-shot de authFetch (js/biomeca.js L111+) pour testabilité.
//
// Pattern : duplication contrôlée (cf computeAccessLevel L726-728). Si tu
// modifies la logique ici, répercute aussi dans authFetch sinon les tests
// dérivent du runtime.
//
// Statuts éligibles :
//   - 401, 403 : Supabase Auth + REST (PGRST303, bad_jwt)
//   - 400 sur /storage/v1/* : Storage renvoie 400 sur token expiré
//     (« "exp" claim timestamp check failed »), pas 401/403.
//
// Body scan (mots-clés case-insensitive) : 'jwt' | 'pgrst303' | 'bad_jwt' |
// 'expired' | 'token' | 'claim'. Le mot-clé 'claim' couvre spécifiquement les
// erreurs gotrue/storage du type `"<x>" claim timestamp check failed` qui ne
// contiennent aucun des autres mots-clés.

export function isJwtIssueResponse({ status, url, body }) {
  const isStorageEndpoint = typeof url === 'string' && url.includes('/storage/v1/');
  const statusEligible =
    status === 401 ||
    status === 403 ||
    (status === 400 && isStorageEndpoint);
  if (!statusEligible) return false;
  // Si Storage 400 et qu'on a la garantie one-shot (_retry===0 côté caller),
  // on peut forcer isJwtIssue=true sans scanner le body — il n'y a quasi
  // aucun autre cas où Storage renvoie 400 pour un GET signed URL. Mais le
  // scan est défensif et pas coûteux : on le garde + on l'enrichit.
  if (!body || typeof body !== 'object') {
    // Storage 400 sans body parsable → on présume JWT-issue (caller protégé par _retry).
    return status === 400 && isStorageEndpoint;
  }
  const code = String(body.code || body.error_code || body.statusCode || '').toLowerCase();
  const msg  = String(body.message || body.msg || body.error || '').toLowerCase();
  return (
    code.includes('jwt') || code === 'pgrst303' || code === 'bad_jwt' ||
    msg.includes('jwt') || msg.includes('expired') || msg.includes('token') ||
    msg.includes('claim')
  );
}
