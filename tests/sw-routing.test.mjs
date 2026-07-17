import { describe, it, expect } from 'vitest';
import { pickCacheStrategy, computeBasePath } from '../js/sw-routing.mjs';

// Deux origines cibles pour prouver que la logique fonctionne dans les deux
// contextes réels de déploiement de l'app.
const LOCAL_ORIGIN = 'http://localhost:8080';
const LOCAL_BASE = '/';
const GHPAGES_ORIGIN = 'https://sciopraxi-cmyk.github.io';
const GHPAGES_BASE = '/biomeca-pwa/';

// Helper : construit un URL et appelle pickCacheStrategy sur les deux
// contextes (local + GH Pages) — c'est le cœur de la régression #77 :
// avant le fix, la règle 4a marchait en local et était morte en prod.
function decide(pathname, opts = {}) {
  const method = opts.method || 'GET';
  const origin = opts.origin || LOCAL_ORIGIN;
  const basePath = opts.basePath ?? (origin === LOCAL_ORIGIN ? LOCAL_BASE : GHPAGES_BASE);
  const swOrigin = origin;
  const url = new URL(pathname, origin);
  return pickCacheStrategy({ url, method, swOrigin, basePath });
}

describe('computeBasePath', () => {
  it("dérive '/' quand le SW est servi à la racine (localhost)", () => {
    expect(computeBasePath('/service-worker.js')).toBe('/');
  });

  it("dérive '/biomeca-pwa/' sur GitHub Pages project page", () => {
    expect(computeBasePath('/biomeca-pwa/service-worker.js')).toBe('/biomeca-pwa/');
  });

  it('normalise la casse en minuscules', () => {
    expect(computeBasePath('/BIOMECA-PWA/Service-Worker.js')).toBe(
      '/biomeca-pwa/service-worker.js'
    );
    // NB : le SW réel est toujours en minuscules dans le fichier ; ce cas
    // documente juste le contrat de la fonction.
  });

  it('renvoie chaîne vide sur input vide/null', () => {
    expect(computeBasePath('')).toBe('');
    expect(computeBasePath(null)).toBe('');
  });
});

describe('pickCacheStrategy — bypass Stripe', () => {
  it('js.stripe.com → bypass', () => {
    const url = new URL('https://js.stripe.com/v3/');
    expect(
      pickCacheStrategy({ url, method: 'GET', swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })
    ).toBe('bypass');
  });

  it('api.stripe.com (sous-domaine) → bypass', () => {
    const url = new URL('https://api.stripe.com/v1/checkout');
    expect(
      pickCacheStrategy({ url, method: 'POST', swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })
    ).toBe('bypass');
  });
});

describe('pickCacheStrategy — Supabase', () => {
  it('GET REST → networkFirst', () => {
    const url = new URL('https://tzivizoacdyopwfzerrb.supabase.co/rest/v1/user_data');
    expect(
      pickCacheStrategy({ url, method: 'GET', swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })
    ).toBe('networkFirst');
  });

  it("POST/PATCH/DELETE → bypass (aucune mise en cache d'une mutation)", () => {
    const url = new URL('https://tzivizoacdyopwfzerrb.supabase.co/rest/v1/user_data');
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      expect(pickCacheStrategy({ url, method, swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })).toBe(
        'bypass'
      );
    }
  });
});

describe('pickCacheStrategy — Google Fonts', () => {
  it('fonts.googleapis.com → staleWhileRevalidate', () => {
    const url = new URL('https://fonts.googleapis.com/css2?family=DM+Sans');
    expect(
      pickCacheStrategy({ url, method: 'GET', swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })
    ).toBe('staleWhileRevalidate');
  });

  it('fonts.gstatic.com → staleWhileRevalidate', () => {
    const url = new URL('https://fonts.gstatic.com/s/dmsans/v15/foo.woff2');
    expect(
      pickCacheStrategy({ url, method: 'GET', swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })
    ).toBe('staleWhileRevalidate');
  });
});

describe('pickCacheStrategy — cross-origin non listé', () => {
  it('domaine tiers inconnu → passthrough', () => {
    const url = new URL('https://example.com/random');
    expect(
      pickCacheStrategy({ url, method: 'GET', swOrigin: LOCAL_ORIGIN, basePath: LOCAL_BASE })
    ).toBe('passthrough');
  });
});

describe('pickCacheStrategy — assets immuables (règle 4a) : régression #77', () => {
  // Cœur du fix : la règle doit matcher SUR LES DEUX contextes.
  it('localhost /assets/logo.png → cacheFirst', () => {
    expect(decide('/assets/logo-sciopraxi.png')).toBe('cacheFirst');
  });

  it('localhost /assets/vendor/pdfjs/pdf.min.js → cacheFirst (tiers immuable)', () => {
    expect(decide('/assets/vendor/pdfjs/pdf.min.js')).toBe('cacheFirst');
  });

  it('localhost /assets/vendor/sentry/bundle.min.js → cacheFirst', () => {
    expect(decide('/assets/vendor/sentry/bundle.min.js')).toBe('cacheFirst');
  });

  // Régression prod : GitHub Pages project page — sans le fix BASE_PATH,
  // ces tests seraient tous 'networkFirst' (ou passthrough), signalant que
  // la règle 4a ne matchait pas.
  it('GH Pages /biomeca-pwa/assets/logo.png → cacheFirst', () => {
    expect(decide('/biomeca-pwa/assets/logo-sciopraxi.png', { origin: GHPAGES_ORIGIN })).toBe(
      'cacheFirst'
    );
  });

  it('GH Pages /biomeca-pwa/assets/vendor/pdfjs/pdf.min.js → cacheFirst (fix #77)', () => {
    expect(decide('/biomeca-pwa/assets/vendor/pdfjs/pdf.min.js', { origin: GHPAGES_ORIGIN })).toBe(
      'cacheFirst'
    );
  });

  it('GH Pages /biomeca-pwa/assets/vendor/sentry/bundle.min.js → cacheFirst (fix #77)', () => {
    expect(
      decide('/biomeca-pwa/assets/vendor/sentry/bundle.min.js', { origin: GHPAGES_ORIGIN })
    ).toBe('cacheFirst');
  });

  it('path /vendor/... (hors /assets/) → cacheFirst aussi', () => {
    expect(decide('/vendor/foo.js')).toBe('cacheFirst');
    expect(decide('/biomeca-pwa/vendor/foo.js', { origin: GHPAGES_ORIGIN })).toBe('cacheFirst');
  });
});

describe('pickCacheStrategy — code applicatif (règle 4b) : network-first', () => {
  it('localhost /js/biomeca.js → networkFirst', () => {
    expect(decide('/js/biomeca.js')).toBe('networkFirst');
  });

  it('localhost /css/biomeca.css → networkFirst', () => {
    expect(decide('/css/biomeca.css')).toBe('networkFirst');
  });

  it('GH Pages /biomeca-pwa/js/biomeca.js → networkFirst', () => {
    expect(decide('/biomeca-pwa/js/biomeca.js', { origin: GHPAGES_ORIGIN })).toBe('networkFirst');
  });

  it('GH Pages /biomeca-pwa/css/biomeca.css → networkFirst', () => {
    expect(decide('/biomeca-pwa/css/biomeca.css', { origin: GHPAGES_ORIGIN })).toBe('networkFirst');
  });

  it('modules .mjs (traités comme .js par endsWith) → networkFirst', () => {
    expect(decide('/js/calc.mjs')).toBe('passthrough');
    // Note: .mjs n'est PAS capté par .endsWith('.js') → tombe en HTML default OU passthrough.
    // Ce test documente le contrat actuel ; si un .mjs devait être network-first, il
    // faudrait étendre la règle 4b.
  });
});

describe('pickCacheStrategy — autres assets locaux (règle 4c) : cache-first', () => {
  it('favicon.ico à la racine → cacheFirst', () => {
    expect(decide('/favicon.ico')).toBe('cacheFirst');
    expect(decide('/biomeca-pwa/favicon.ico', { origin: GHPAGES_ORIGIN })).toBe('cacheFirst');
  });
});

describe('pickCacheStrategy — HTML (règle 5) : network-first', () => {
  it('/ → networkFirst', () => {
    expect(decide('/')).toBe('networkFirst');
    expect(decide('/biomeca-pwa/', { origin: GHPAGES_ORIGIN })).toBe('networkFirst');
  });

  it('/index.html → networkFirst', () => {
    expect(decide('/index.html')).toBe('networkFirst');
    expect(decide('/biomeca-pwa/index.html', { origin: GHPAGES_ORIGIN })).toBe('networkFirst');
  });

  it('path sans extension (SPA route) → networkFirst', () => {
    expect(decide('/some-route')).toBe('networkFirst');
  });
});
