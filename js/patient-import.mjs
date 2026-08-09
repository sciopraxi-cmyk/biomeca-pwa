// ============================================================================
// #223-B — Import CSV patients : helpers purs (miroir de test)
// ----------------------------------------------------------------------------
// ⚠️ MIROIR MANUEL de js/biomeca.js (section « IMPORT CSV PATIENTS (#223-B) »).
// Toute modification ici doit être répercutée là-bas et inversement (dette
// #132 — détection de dérive non mécanisée).
// ============================================================================

// Séparateur le plus fréquent hors guillemets sur la ligne d'en-tête
// (';' Doctolib/DrSanté, ',' ou tabulation sinon). Défaut ';'.
export function _csvDetectSep(line) {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const c of String(line || '')) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && c in counts) counts[c]++;
  }
  let best = ';',
    bestN = -1;
  for (const s of [';', ',', '\t']) {
    if (counts[s] > bestN) {
      best = s;
      bestN = counts[s];
    }
  }
  return bestN > 0 ? best : ';';
}

// Parseur CSV RFC 4180 minimal : champs quotés (séparateurs ET retours à la
// ligne internes, guillemets doublés ""), BOM UTF-8, lignes vides ignorées.
export function _csvParse(text) {
  let t = String(text || '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  if (!t.trim()) return [];
  const firstNl = t.indexOf('\n');
  const sep = _csvDetectSep(firstNl === -1 ? t : t.slice(0, firstNl));
  const rows = [];
  let row = [],
    field = '',
    inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQ = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

// Normalisation pour appariement et matching d'en-têtes.
export function _importNormName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-']+/g, ' ')
    .trim();
}

// 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'DD.MM.YYYY' | ISO → 'YYYY-MM-DD', sinon ''.
export function _importNormDdn(s) {
  const v = String(s || '').trim();
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return '';
}

// 'M'|'Monsieur'|'Mr'|'Homme' → 'M.' ; 'Mme'|'Madame'|'F'|'Mlle'... → 'Mme'.
export function _importNormCivilite(s) {
  const v = _importNormName(s).replace(/\./g, '');
  if (v === 'm' || v === 'mr' || v === 'monsieur' || v === 'homme' || v === 'h') return 'M.';
  if (
    v === 'mme' ||
    v === 'madame' ||
    v === 'f' ||
    v === 'femme' ||
    v === 'mlle' ||
    v === 'mademoiselle'
  )
    return 'Mme';
  return '';
}

// En-têtes bruts → index de colonne par champ Verticy (-1 si absente).
// nirIdx repère une éventuelle colonne NIR pour l'ignorer EXPLICITEMENT.
export function _importMapHeaders(rawHeaders) {
  const hs = (rawHeaders || []).map((h) => _importNormName(String(h || '').replace(/["']/g, '')));
  const find = (pred) => hs.findIndex(pred);
  const map = {
    nom: find(
      (h) => h === 'nom' || h === 'nom de famille' || h === 'last name' || h === 'lastname'
    ),
    prenom: find((h) => h.includes('prenom') || h === 'first name' || h === 'firstname'),
    ddn: find(
      (h) =>
        (h.includes('naissance') && h.includes('date')) ||
        h === 'ddn' ||
        h.includes('birth') ||
        h === 'dob' ||
        h.startsWith('ne(e)')
    ),
    email: find((h) => h.includes('mail')),
    civilite: find((h) => h.includes('civilite') || h === 'sexe' || h === 'genre'),
    adresse: find((h) => h.includes('adresse') && !h.includes('mail')),
    cp: find((h) => h === 'cp' || h.includes('code postal')),
    medecinTraitant: find((h) => h.includes('medecin traitant') && !h.startsWith('ville')),
    assurance: find((h) => h.includes('assurance')),
    provenance: find((h) => h.includes('provenance')),
    metier: find((h) => h.includes('profession') || h === 'metier'),
    motif: find((h) => h === 'motif' || h.startsWith('motif ')),
  };
  if (map.nom === -1) {
    map.nom = find(
      (h) =>
        h.startsWith('nom') &&
        !h.includes('medecin') &&
        !h.includes('naissance') &&
        !h.includes('prenom')
    );
  }
  map.ville = find((h) => h === 'ville');
  if (map.ville === -1) map.ville = find((h) => h.includes('ville') && !h.includes('medecin'));
  map.tel = find((h) => h.includes('portable') || h.includes('mobile'));
  if (map.tel === -1)
    map.tel = find(
      (h) =>
        (h.includes('telephone') || h.includes('phone') || h === 'tel') && !h.includes('secondaire')
    );
  if (map.tel === -1) map.tel = find((h) => h.includes('telephone'));
  const nirIdx = find((h) => h.includes('securite sociale') || h === 'nir' || h.includes('insee'));
  return { map, nirIdx };
}

// Décision d'appariement idempotent (cf. commentaires côté biomeca.js).
export function _importMatchDecision(candidates, rowDdn) {
  if (!candidates.length) return { action: 'create' };
  if (rowDdn) {
    const exact = candidates.filter((c) => c.ddn === rowDdn);
    if (exact.length === 1) return { action: 'match', idx: exact[0].idx };
    if (exact.length > 1) return { action: 'ambiguous' };
    const noDdn = candidates.filter((c) => !c.ddn);
    if (noDdn.length === 1) return { action: 'match', idx: noDdn[0].idx };
    if (noDdn.length > 1) return { action: 'ambiguous' };
    return { action: 'create' };
  }
  if (candidates.length === 1) return { action: 'match', idx: candidates[0].idx };
  return { action: 'ambiguous' };
}
