// #102-A — Fusion ADDITIVE des archives cloud dans le blob patient.
// ⚠️ Miroir de test de _mergeCloudArchivesIntoPatient (js/biomeca.js) —
// répercuter toute modification ici, sinon les tests Vitest passent en vert
// alors que la fusion dérive en prod.
//
// Règles STRICTES (découpage #102 validé le 08/08/2026, cf. roadmap locale) :
// 1. Archive au cloud, absente en local (id fiable) → AJOUT (copie profonde).
// 2. Archive présente des deux côtés (même id) → AUCUNE modification locale.
// 3. Archive locale absente du cloud → AUCUNE suppression.
// 4. Entrée cloud SANS id fiable → PAS d'ajout (un doublon indétectable est
//    pire qu'un manque visible ; l'archive réapparaîtra quand sa sync lui
//    aura donné un id).
// Les bilans in_progress (mesures/bilanData*) sont HORS périmètre : l'état de
// travail courant ne doit jamais être écrasé depuis le cloud.
//
// Identité par collection (cf. _reconstructPatientBilansFromRows) :
// - bilansSport : _bilanId au niveau RACINE de l'entrée (hors payload).
// - bilansPosturo / bilansPodopediatrie / bilansPedicurie : _bilanId DANS
//   bilanData<Module>.
const ARCHIVE_ID_READERS = {
  bilansSport: (b) => (b && b._bilanId) || null,
  bilansPosturo: (b) => (b && b.bilanDataPosturo && b.bilanDataPosturo._bilanId) || null,
  bilansPodopediatrie: (b) =>
    (b && b.bilanDataPodopediatrie && b.bilanDataPodopediatrie._bilanId) || null,
  bilansPedicurie: (b) => (b && b.bilanDataPedicurie && b.bilanDataPedicurie._bilanId) || null,
};

// Mute p EN PLACE (ajouts en fin de tableau uniquement). Retourne la liste
// des identifiants ajoutés ('collection:id') — vide si rien à faire.
export function mergeCloudArchivesIntoPatient(p, recon) {
  const added = [];
  if (!p || !recon) return added;
  Object.keys(ARCHIVE_ID_READERS).forEach((col) => {
    const idOf = ARCHIVE_ID_READERS[col];
    const cloudArr = Array.isArray(recon[col]) ? recon[col] : [];
    if (cloudArr.length === 0) return;
    if (!Array.isArray(p[col])) p[col] = [];
    const localArr = p[col];
    const localIds = new Set(localArr.map(idOf).filter(Boolean));
    cloudArr.forEach((b) => {
      const id = idOf(b);
      if (!id || localIds.has(id)) return; // règles 2 et 4
      localArr.push(JSON.parse(JSON.stringify(b))); // règle 1 — copie profonde
      localIds.add(id);
      added.push(col + ':' + id);
    });
  });
  return added;
}
