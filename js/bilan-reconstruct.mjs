// ⚠️ CE MODULE EST UNE COPIE, PAS LA SOURCE. Le runtime réel est
// _reconstructPatientBilansFromRows / _isoDateToFr dans js/biomeca.js
// (#102 Phase 2b). Une divergence rend les tests VERTS alors que la
// reconstruction dérive en prod. Toute modification doit être faite dans les
// DEUX fichiers, js/biomeca.js D'ABORD.
//
// Pattern test-mirror identique à js/access.mjs, js/calc.mjs,
// js/subscription.mjs, js/sw-routing.mjs, js/bilan-sync-guard.mjs.
//
// Régression couverte (étape 4a-ter, découverte via le shadow-read #167 avec
// une comparaison deepEqual insensible à l'ordre des clés) : la sélection
// PostgREST omettait la colonne `id`, et la reconstruction n'exposait jamais
// `_bilanId` sur les entrées archivées sport — mesures/bilanData/label/type/
// date concordaient parfaitement, seul l'identifiant manquait. Sans lui,
// basculer la lecture sur fetchPatientBilans() (étape 4b) casserait la
// réouverture fiable d'un bilan archivé, la détection de doublons, le
// garde-fou anti-collision (#163) et l'édition en place d'une archive (#118).
//
// Correctif du correctif (étape 4a-quater) : cette réinjection de _bilanId
// au niveau racine de l'entrée ne s'applique QU'AU SPORT. Pour posturo/
// podopediatrie/pedicurie, _bilanId vit DANS le payload (bilanData<Module>.
// _bilanId côté écriture), donc row.payload le contient déjà — l'ajouter
// aussi au niveau racine créait une clé absente du blob réel et cassait
// deepEqual pour ces 3 modules, qui n'avaient jamais eu de problème.

// 'YYYY-MM-DD' → 'DD/MM/YYYY'. Retourne null si iso est absent ou mal formé.
export function isoDateToFr(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

// Reconstruit la forme "patient.bilans*" à partir des lignes public.bilans
// (module, status, sous_type, label, bilan_date, payload, id). Fonction pure,
// aucun réseau.
export function reconstructPatientBilansFromRows(rows) {
  const out = {
    mesures: undefined,
    bilanData: undefined,
    bilanDataPosturo: undefined,
    bilanDataPodopediatrie: undefined,
    bilanDataPedicurie: undefined,
    bilansSport: [],
    bilansPosturo: [],
    bilansPodopediatrie: [],
    bilansPedicurie: [],
  };
  (rows || []).forEach((row) => {
    const payload = row.payload || {};
    if (row.status === 'in_progress') {
      if (row.module === 'sport') {
        out.mesures = payload.mesures || {};
        out.bilanData = payload.bilanData || {};
      } else if (row.module === 'posturo') {
        out.bilanDataPosturo = payload;
      } else if (row.module === 'podopediatrie') {
        out.bilanDataPodopediatrie = payload;
      } else if (row.module === 'pedicurie') {
        out.bilanDataPedicurie = payload;
      }
    } else if (row.status === 'archived') {
      const date = isoDateToFr(row.bilan_date);
      if (row.module === 'sport') {
        out.bilansSport.push({
          _bilanId: row.id,
          label: row.label || null,
          type: row.sous_type || null,
          date,
          mesures: payload.mesures || {},
          bilanData: payload.bilanData || {},
        });
      } else if (row.module === 'posturo') {
        out.bilansPosturo.push({
          label: row.label || null,
          type: row.sous_type || null,
          date,
          bilanDataPosturo: payload,
        });
      } else if (row.module === 'podopediatrie') {
        out.bilansPodopediatrie.push({
          label: row.label || null,
          type: row.sous_type || null,
          date,
          bilanDataPodopediatrie: payload,
        });
      } else if (row.module === 'pedicurie') {
        out.bilansPedicurie.push({
          label: row.label || null,
          type: row.sous_type || null,
          date,
          bilanDataPedicurie: payload,
        });
      }
    }
  });
  return out;
}
