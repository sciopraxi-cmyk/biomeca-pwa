// ═══════════════════════════════════════════════════════════════════
// Supabase Storage — helpers photos patients (Task #36 PR A)
// ═══════════════════════════════════════════════════════════════════
//
// Bucket : `patient-media` (privé, à créer manuellement via Supabase Studio).
// RLS    : voir supabase/migrations/storage-patient-media-rls.sql
//
// Convention de path :
//   {user_id}/{patient_id}/{type}/{bilan_id}/{filename}
//   ex. "a305c7c4-9c2.../patient-uuid/sport/bilan-uuid/photoSlot_0_1714567890.jpg"
//
// Les helpers utilisent authFetch (défini dans js/biomeca.js) — refresh
// JWT transparent inclus. js/storage.js DOIT être chargé après biomeca.js.
//
// Cette PR (A) n'introduit que les helpers. La migration des photos
// existantes (base64 → Storage) et la modification du flow d'upload
// patient viendront dans les PR B et C.
// ═══════════════════════════════════════════════════════════════════

const STORAGE_BUCKET = 'patient-media';

// Encode chaque segment du path sans toucher aux séparateurs `/`.
// encodeURIComponent('a/b') donnerait 'a%2Fb' — pas ce qu'on veut.
function encodeStoragePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

// Convertit `data:image/jpeg;base64,...` en Blob pour upload binaire.
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('dataUrl invalide : pas de virgule séparatrice');
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Génère un path normalisé pour Storage.
function buildPhotoPath(userId, patientId, type, bilanId, filename) {
  return `${userId}/${patientId}/${type}/${bilanId}/${filename}`;
}

// Upload une photo base64 → Storage. Retourne { ok, path } ou { ok:false, error }.
async function uploadPhotoBase64(dataUrl, path) {
  try {
    const blob = dataUrlToBlob(dataUrl);
    const url = `${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeStoragePath(path)}`;
    // x-upsert: 'true' → autorise l'overwrite (utile si on re-upload après édition).
    const res = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': blob.type, 'x-upsert': 'true' },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Upload ${res.status} : ${err}` };
    }
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Génère une URL signée temporaire pour afficher la photo dans un <img>.
// Storage privé → impossible d'utiliser l'URL publique, signed URL obligatoire.
async function getPhotoSignedUrl(path, expiresInSec = 3600) {
  try {
    const url = `${SUPA_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${encodeStoragePath(path)}`;
    const res = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSec }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Sign ${res.status} : ${err}` };
    }
    const data = await res.json();
    // Supabase renvoie signedURL (capital U) — on prend aussi signedUrl par robustesse.
    const relative = data.signedURL || data.signedUrl;
    if (!relative) return { ok: false, error: 'Réponse sans signedURL' };
    return { ok: true, signedUrl: `${SUPA_URL}/storage/v1${relative}` };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Supprime un lot de photos. `paths` = array de chemins exacts (pas des prefixes
// malgré le nom de paramètre côté Supabase — c'est l'API officielle qui s'appelle
// ainsi). Retourne { ok } ou { ok:false, error }.
async function deletePhotos(paths) {
  if (!paths || paths.length === 0) return { ok: true };
  try {
    const url = `${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}`;
    const res = await authFetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Delete ${res.status} : ${err}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// List interne — pagine sur l'endpoint /storage/v1/object/list. Non récursif
// (Storage n'expose pas de list récursif). On boucle avec offset jusqu'à
// épuisement de la "page". Retourne { ok, items } ou { ok:false, error }.
async function _listStorageFolder(prefix) {
  const url = `${SUPA_URL}/storage/v1/object/list/${STORAGE_BUCKET}`;
  const items = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const res = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `List ${res.status} : ${err}` };
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) return { ok: false, error: 'List : réponse non-array' };
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return { ok: true, items };
}

// Supprime toutes les photos d'un patient (récursif).
// Walk BFS : list → distingue fichiers (id non null) des sous-dossiers
// (id null) → collecte les chemins → batch delete final.
// Retourne { ok, deleted } ou { ok:false, error }.
async function deletePatientFolder(userId, patientId) {
  const root = `${userId}/${patientId}`;
  const queue = [root];
  const files = [];
  while (queue.length) {
    const folder = queue.shift();
    const listed = await _listStorageFolder(folder);
    if (!listed.ok) return listed;
    for (const item of listed.items) {
      const fullPath = `${folder}/${item.name}`;
      // Convention Supabase Storage : id===null → "folder" virtuel, sinon fichier.
      if (item.id) files.push(fullPath);
      else queue.push(fullPath);
    }
  }
  if (files.length === 0) return { ok: true, deleted: 0 };
  const del = await deletePhotos(files);
  if (!del.ok) return del;
  return { ok: true, deleted: files.length };
}

// ───────────────────────────────────────────────────────────────────
// Helpers de migration lazy (Task #51 PR B1 — flow bilan posturo)
// ───────────────────────────────────────────────────────────────────
//
// Stratégie :
//  - dataUrl en RAM pendant l'édition (compat pattern <img src="data:...">).
//  - SEUL le path est persisté en DB.
//  - Migration au save : si dataUrl présente sans path → upload, set path,
//    drop la dataUrl du persisté (mais le caller la garde en RAM via stash).
//  - Prefetch au load : si path présent sans dataUrl → fetch signed URL →
//    blob → dataUrl → réinjecte en RAM pour affichage.
// ───────────────────────────────────────────────────────────────────

// Récupère une photo depuis Storage et la retourne sous forme de dataUrl,
// pour ré-alimenter une UI qui consomme du `data:image/...` (img.src, canvas).
async function prefetchPhotoToDataUrl(path) {
  try {
    const signed = await getPhotoSignedUrl(path);
    if (!signed.ok) return { ok: false, error: signed.error };
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return { ok: false, error: `Fetch ${res.status}` };
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Migre une entrée photo d'un objet bilan (in-place).
//  - obj[key] = dataUrl AND !obj[key + 'Path']  → upload, set Path, retourne
//    { ok:true, migrated:true } et SUPPRIME obj[key] (caller doit stasher avant
//    s'il veut la garder en RAM).
//  - obj[key + 'Path'] déjà set ou rien → no-op, retourne { ok:true, migrated:false }.
//  - upload échoue → retourne { ok:false, error } et laisse obj[key] intact
//    pour retry au prochain save (lazy retry).
//
// pathArgs = { userId, patientId, type, bilanId, filenamePrefix }
//   filenamePrefix par défaut = key.replace(/^_/, '') (ex: '_empreinte' → 'empreinte')
async function migratePhotoEntry(obj, key, pathArgs) {
  const pathKey = key + 'Path';
  if (obj[pathKey]) return { ok: true, migrated: false };
  const val = obj[key];
  if (!val || typeof val !== 'string' || !val.startsWith('data:')) {
    return { ok: true, migrated: false };
  }
  const { userId, patientId, type, bilanId } = pathArgs;
  if (!userId || !patientId || !type || !bilanId) {
    return { ok: false, error: 'pathArgs incomplets (userId/patientId/type/bilanId)' };
  }
  const prefix = pathArgs.filenamePrefix || key.replace(/^_/, '');
  // Détecte l'extension depuis le MIME du dataUrl (image/png → png, image/jpeg → jpg).
  const mimeMatch = val.match(/data:image\/([a-zA-Z0-9+.-]+)/);
  const subtype = mimeMatch ? mimeMatch[1].toLowerCase() : 'bin';
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  const filename = `${prefix}_${Date.now()}.${ext}`;
  const path = buildPhotoPath(userId, patientId, type, bilanId, filename);
  const up = await uploadPhotoBase64(val, path);
  if (!up.ok) return { ok: false, error: up.error };
  obj[pathKey] = up.path;
  delete obj[key];
  return { ok: true, migrated: true };
}
