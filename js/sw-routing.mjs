// ⚠️ CE MODULE EST UNE COPIE, PAS LA SOURCE. Le runtime réel est
// service-worker.js. Une divergence rend les tests VERTS alors que la prod
// est cassée. Toute modification du routage doit être faite dans les DEUX
// fichiers, service-worker.js D'ABORD.
//
// Pattern test-mirror identique à js/access.mjs, js/calc.mjs, js/subscription.mjs :
// on extrait la décision pure ici pour la tester dans Vitest sans le runtime SW
// (self, caches, fetch, addEventListener).
//
// #77 — le vrai enjeu est la correction du bug prod : sur GitHub Pages project
// page (sciopraxi-cmyk/biomeca-pwa), le pathname est /biomeca-pwa/assets/...
// et non /assets/... — la règle 4a de routage doit raisonner en chemin
// RELATIF au scope du SW, sinon code mort en prod (comportement observé
// uniquement en localhost où le SW est servi à la racine).

// Extensions traitées comme assets statiques génériques (fallback cache-first
// pour ce qui n'est pas capté par les règles /assets/ /vendor/ ou .js/.css).
export const SW_ASSET_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.webp',
];

// Chemin de base du SW dérivé de self.location.pathname. '/' en local, quelque
// chose comme '/biomeca-pwa/' sur GitHub Pages project page.
export function computeBasePath(swPathname) {
  return String(swPathname || '')
    .replace(/service-worker\.js$/, '')
    .toLowerCase();
}

// Décide la stratégie de cache à appliquer à une requête entrante.
// Renvoie l'un de : 'bypass' | 'networkFirst' | 'cacheFirst' |
// 'staleWhileRevalidate' | 'passthrough'.
//
// `url` est un objet URL (ou tout ce qui expose hostname/pathname/origin).
// `basePath` est le résultat de computeBasePath(self.location.pathname).
// `swOrigin` est self.location.origin.
export function pickCacheStrategy({ url, method, swOrigin, basePath }) {
  // 1. Stripe — bypass total, jamais de cache.
  if (url.hostname === 'js.stripe.com' || url.hostname.endsWith('.stripe.com')) {
    return 'bypass';
  }
  // 2. Supabase — network-first pour GET, bypass pour mutations.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    if (method !== 'GET') return 'bypass';
    return 'networkFirst';
  }
  // 3. Google Fonts — stale-while-revalidate.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    return 'staleWhileRevalidate';
  }
  // Même origine uniquement à partir d'ici.
  if (url.origin !== swOrigin) {
    return 'passthrough';
  }
  const path = url.pathname.toLowerCase();
  const rel = path.startsWith(basePath) ? path.slice(basePath.length) : path.replace(/^\//, '');
  // 4a. Assets immuables sous /assets/ ou /vendor/ (relatif au scope) — cache-first.
  if (rel.startsWith('assets/') || rel.startsWith('vendor/')) {
    return 'cacheFirst';
  }
  // 4b. Code applicatif (.js / .css hors /assets/) — network-first.
  if (path.endsWith('.js') || path.endsWith('.css')) {
    return 'networkFirst';
  }
  // 4c. Autres assets locaux par extension — cache-first.
  if (SW_ASSET_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return 'cacheFirst';
  }
  // 5. HTML — network-first.
  if (path.endsWith('.html') || path.endsWith('/') || !path.includes('.')) {
    return 'networkFirst';
  }
  // Par défaut, laisser passer.
  return 'passthrough';
}
