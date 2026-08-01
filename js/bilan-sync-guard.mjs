// ⚠️ CE MODULE EST UNE COPIE, PAS LA SOURCE. Le runtime réel est le garde-fou
// dans _syncPatientToNormalizedTables (js/biomeca.js, #102 Phase 2b hotfix 2).
// Une divergence rend les tests VERTS alors que la sync est cassée en prod.
// Toute modification du garde-fou doit être faite dans les DEUX fichiers,
// js/biomeca.js D'ABORD.
//
// Pattern test-mirror identique à js/access.mjs, js/calc.mjs,
// js/subscription.mjs, js/sw-routing.mjs : on extrait la décision pure ici
// pour la tester dans Vitest sans le runtime applicatif (authFetch, pwaUser,
// crypto.randomUUID, réseau Supabase).
//
// Régression couverte (shadow-read #167, prod, 01/08/2026) : ouvrirBilan
// <Module>() charge une COPIE d'un bilan archivé — même _bilanId d'origine —
// dans le slot "en cours", pour consultation en lecture seule, SANS poser
// currentBilan<Module>SousType (delete volontaire, motif #69/#70 déjà
// présent ailleurs). La seule présence de contenu (hasBilanDataContent) ne
// suffit donc PAS à distinguer "bilan en cours" de "archive simplement
// consultée" : sans ce garde-fou, consulter une archive fait pousser une
// ligne status=in_progress avec le MÊME id que la ligne status=archived déjà
// en base → Postgres 21000 "ON CONFLICT DO UPDATE command cannot affect row
// a second time" sur tout le batch POST (500, sync silencieusement perdue).

// Décide si un bilan doit être poussé comme ligne status=in_progress dans le
// batch de sync. Mirror EXACT des 4 conditions dans
// _syncPatientToNormalizedTables : sousType posé (bilan génuinement en
// cours) ET contenu non vide.
export function isEnCoursPourSync(sousType, hasContent) {
  return sousType != null && Boolean(hasContent);
}

// Détecte les collisions d'id dans un tableau de lignes destinées au même
// batch POST (bilanRows). PostgREST/Postgres rejette (500, erreur 21000)
// tout batch INSERT ... ON CONFLICT(id) DO UPDATE contenant deux lignes
// partageant le même id — cardinalité invalide. Renvoie la liste des id
// dupliqués (vide si aucune collision).
export function detectIdCollision(rows) {
  const seen = new Set();
  const collisions = new Set();
  (rows || []).forEach((r) => {
    const id = r && r.id;
    if (id == null) return;
    if (seen.has(id)) collisions.add(id);
    seen.add(id);
  });
  return Array.from(collisions);
}
