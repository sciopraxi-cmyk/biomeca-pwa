// #128 — Healthcheck login prod : reproduit le trajet réel du user.
//
// Contexte : le login prod a été mort du 28/04 au 17/07/2026 sans qu'aucun
// signal ne le détecte (cf. #77). Un uptime classique sur l'endpoint
// /auth/v1/health de Supabase serait resté vert — c'est la CLÉ ANON EMBARQUÉE
// dans le bundle servi en prod qui était révoquée, pas l'API. Le check ci-dessous
// fetch le bundle prod exactement comme le navigateur, en extrait SUPA_KEY, et
// tente un login avec cette clé — si la clé du bundle n'accepte plus l'API,
// on le voit tout de suite.
//
// Ne PAS lire la clé depuis un secret ou depuis le dépôt local : ça reviendrait
// à tester une autre clé que celle réellement servie aux utilisateurs.
//
// Invocation : node scripts/check-prod-auth.mjs
// Environnement requis : PROD_CHECK_EMAIL, PROD_CHECK_PASSWORD (secrets GitHub
// Actions en CI, ou export manuel pour lancer en local).
// Exit code : 0 si login OK, 1 sinon.

import { fileURLToPath } from 'node:url';

const BUNDLE_URL = 'https://sciopraxi-cmyk.github.io/biomeca-pwa/js/biomeca.js';
const SUPA_URL = 'https://tzivizoacdyopwfzerrb.supabase.co';

// Fonction pure exportée pour les tests Vitest. La regex tolère guillemets
// simples ou doubles et un espacement libre autour du = (`const SUPA_KEY='xxx'`
// comme `const SUPA_KEY = "xxx"`). Elle capture uniquement le premier
// SUPA_KEY rencontré — le bundle prod n'en contient qu'un.
export function extractSupaKey(bundleSource) {
  const match = /const\s+SUPA_KEY\s*=\s*['"]([^'"]+)['"]/.exec(String(bundleSource || ''));
  if (!match) {
    throw new Error(
      "SUPA_KEY introuvable dans le bundle prod (regex `const SUPA_KEY = '...'` sans match — bundle corrompu ou renommé ?)"
    );
  }
  return match[1];
}

async function fetchBundle() {
  const res = await fetch(BUNDLE_URL);
  if (res.status !== 200) {
    throw new Error(`Bundle prod inaccessible : HTTP ${res.status} sur ${BUNDLE_URL}`);
  }
  return res.text();
}

async function attemptLogin(apikey, email, password) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || !body.access_token) {
    // Message strictement générique : on ne remonte JAMAIS email, password
    // ni la clé anon. Les champs msg/message/hint de Supabase contiennent
    // des libellés type « Invalid login credentials », « Legacy API keys
    // are disabled », « Your legacy API keys (anon, service_role) were
    // disabled on 2026-04-28... » — safe. Le hint est CRUCIAL : c'est lui
    // qui portait la date et la raison lors de l'incident #77.
    const msg = body?.msg || body?.message || body?.error_description || '(pas de message)';
    const hint = body?.hint ? ` — ${body.hint}` : '';
    throw new Error(
      `Login prod ÉCHEC : HTTP ${res.status} — ${msg}${hint}. ` +
        'Précédent connu : incident #77 (cache SW figé sur une clé anon révoquée). Voir la PR #95.'
    );
  }
  return true;
}

async function main() {
  const email = process.env.PROD_CHECK_EMAIL;
  const password = process.env.PROD_CHECK_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "PROD_CHECK_EMAIL et PROD_CHECK_PASSWORD requis dans l'environnement (secrets GitHub Actions ou export local)."
    );
  }
  console.log('[prod-healthcheck] Fetch bundle prod...');
  const bundle = await fetchBundle();
  console.log('[prod-healthcheck] Extraction SUPA_KEY du bundle...');
  const apikey = extractSupaKey(bundle);
  console.log('[prod-healthcheck] Login prod avec la clé du bundle...');
  await attemptLogin(apikey, email, password);
  console.log('[prod-healthcheck] ✓ Login prod OK.');
}

// Run only when invoked directly (n'exécute pas main() quand Vitest importe
// extractSupaKey pour les tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
