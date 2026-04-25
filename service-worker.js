// ============================================================================
// BioMéca — Service Worker
// ----------------------------------------------------------------------------
// Stratégie multi-niveaux : bypass Stripe, network-first Supabase (GET),
// stale-while-revalidate fonts, cache-first assets, network-first HTML.
// La version du cache est incrémentée manuellement à chaque déploiement notable.
// ============================================================================

const CACHE_VERSION = 'biomeca-v1';
const CACHE_PREFIX  = 'biomeca-';

// Ressources critiques précachées à l'install pour démarrage hors-ligne.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/biomeca.css',
  './js/landing.js',
  './js/biomeca.js',
  './assets/logo-sciopraxi.png',
  './assets/morpho-face-anterieure.png',
  './assets/morpho-face-posterieure.png',
  './assets/morpho-profil-gauche.png',
  './assets/morpho-profil-droit.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png',
  './assets/favicon-16.png',
  './favicon.ico'
];

// Extensions reconnues comme assets statiques locaux (cache-first).
const ASSET_EXTENSIONS = [
  '.css', '.js', '.png', '.jpg', '.jpeg', '.svg',
  '.ico', '.woff', '.woff2', '.webp'
];

// ============================================================================
// INSTALL — précache + skipWaiting
// ============================================================================
self.addEventListener('install', event => {
  console.info('[SW] install — version', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] precache failed:', err))
  );
});

// ============================================================================
// ACTIVATE — purge des anciens caches biomeca-* + claim des clients
// ============================================================================
self.addEventListener('activate', event => {
  console.info('[SW] activate — version', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION)
          .map(k => {
            console.info('[SW] purge old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
      .catch(err => console.warn('[SW] activate cleanup failed:', err))
  );
});

// ============================================================================
// FETCH — routage selon l'URL de la requête
// ============================================================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // ─── 1. Stripe : bypass strict (jamais de cache, jamais de réponse cachée) ───
  if (url.hostname === 'js.stripe.com' || url.hostname.endsWith('.stripe.com')) {
    return; // pas de event.respondWith → laisse passer la requête réseau telle quelle
  }

  // ─── 2. Supabase : network-first cache-fallback (GET uniquement), bypass pour mutations ───
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    if (req.method !== 'GET') {
      return; // POST/PATCH/DELETE/PUT → bypass strict
    }
    event.respondWith(networkFirst(req));
    return;
  }

  // ─── 3. Google Fonts : stale-while-revalidate ───
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // À partir d'ici on ne traite que les requêtes de même origine que le SW.
  if (url.origin !== self.location.origin) {
    return;
  }

  // ─── 4. Assets locaux statiques : cache-first ───
  const path = url.pathname.toLowerCase();
  if (ASSET_EXTENSIONS.some(ext => path.endsWith(ext))) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // ─── 5. Page HTML (même origine, .html ou pas d'extension) : network-first ───
  if (path.endsWith('.html') || path.endsWith('/') || !path.includes('.')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Par défaut, on laisse passer (ne rien faire = comportement réseau natif).
});

// ============================================================================
// STRATÉGIES DE CACHE
// ============================================================================

// Cache-first : sert depuis le cache si présent, sinon réseau + mise en cache.
function cacheFirst(req) {
  return caches.match(req).then(cached => {
    if (cached) return cached;
    return fetch(req).then(resp => {
      // On ne met en cache que les réponses OK basiques (pas d'opaque erreur).
      if (resp && resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_VERSION)
          .then(cache => cache.put(req, clone))
          .catch(err => console.warn('[SW] cacheFirst put failed:', err));
      }
      return resp;
    });
  }).catch(err => {
    console.warn('[SW] cacheFirst error:', err);
    return caches.match(req); // ultime tentative
  });
}

// Network-first : tente le réseau, fallback cache si le réseau échoue.
// Met à jour le cache au passage en cas de succès réseau.
function networkFirst(req) {
  return fetch(req).then(resp => {
    if (resp && resp.ok) {
      const clone = resp.clone();
      caches.open(CACHE_VERSION)
        .then(cache => cache.put(req, clone))
        .catch(err => console.warn('[SW] networkFirst put failed:', err));
    }
    return resp;
  }).catch(() => {
    return caches.match(req).then(cached => {
      if (cached) return cached;
      // Aucun fallback disponible : on remonte une erreur réseau.
      return new Response('Hors-ligne et ressource non cachée.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    });
  });
}

// Stale-while-revalidate : renvoie le cache immédiatement (si présent),
// et déclenche une mise à jour réseau en arrière-plan.
function staleWhileRevalidate(req) {
  return caches.open(CACHE_VERSION).then(cache => {
    return cache.match(req).then(cached => {
      const networkUpdate = fetch(req).then(resp => {
        if (resp && resp.ok) {
          cache.put(req, resp.clone())
            .catch(err => console.warn('[SW] swr put failed:', err));
        }
        return resp;
      }).catch(err => {
        console.warn('[SW] swr network failed:', err);
        return cached; // si le réseau échoue et qu'on a un cache, on s'en contente
      });
      return cached || networkUpdate;
    });
  });
}
