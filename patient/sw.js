// Service worker du portail patient — portée /patient/ uniquement, SÉPARÉ de celui de
// l'application praticien (service-worker.js). Préfixe de cache différent : l'autre service
// worker purge les caches « biomeca-* » à son activation et ne doit jamais toucher à ceux-ci.
// Aucune donnée n'est mise en cache : seulement la coquille de l'application. Les appels
// Supabase (authentification, données, fonctions) passent toujours par le réseau.
const VERSION = 'verticy-patient-v7';
const PREFIXE = 'verticy-patient-';
const COQUILLE = [
  './',
  './index.html',
  './patient.css',
  './patient.js',
  './patient-logique.mjs',
  './manifest.json',
  '../assets/icon-192.png',
  '../assets/verticy-logo-simple.png',
  '../assets/by-sciopraxi.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(COQUILLE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(
          cles.filter((k) => k.startsWith(PREFIXE) && k !== VERSION).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Réseau direct pour tout ce qui n'est pas une lecture de la coquille, de même origine.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const portee = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(portee) && !url.pathname.includes('/assets/')) return;
  event.respondWith(
    fetch(req)
      .then((rep) => {
        if (rep && rep.ok) {
          const copie = rep.clone();
          caches
            .open(VERSION)
            .then((c) => c.put(req, copie))
            .catch(() => {});
        }
        return rep;
      })
      .catch(() =>
        caches.match(req).then(
          (c) =>
            c ||
            new Response('Hors connexion.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
        )
      )
  );
});
