import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  // Ignores globaux
  {
    ignores: [
      'node_modules/**',
      'assets/**',
      'css/**',
      'tests/**',
      '**/*.json',
      '**/*.md',
      '.git/**',
    ],
  },

  // Base : règles recommandées
  js.configs.recommended,

  // Règle globale — autorise les paramètres et variables préfixés par _
  // à rester unused (convention standard JS pour signaler "volontairement ignoré").
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // js/landing.js, js/biomeca.js, js/storage.js et js/admin.js : scripts
  // classiques chargés via <script src>, partageant des globals entre fichiers
  // (SUPA_URL, authFetch, pwaUser, etc.). On rétrograde no-unused-vars, no-undef
  // et no-empty pour éviter de faire exploser la CI sur ces globals inter-fichiers
  // et les catch silencieux idiomatiques (storage, speech API, network).
  {
    files: ['js/landing.js', 'js/biomeca.js', 'js/storage.js', 'js/admin.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-empty': 'warn',
    },
  },

  // js/*.mjs : ES modules clean (calc.mjs pour les calculs cliniques,
  // access.mjs pour le gating). Peuvent tourner en navigateur (chargement
  // futur via import) ou Node (tests Vitest) → on autorise les globals
  // des 2 environnements. Découvert lors du commit 6 task #57 : access.mjs
  // utilise console.error et le fallback config par défaut n'avait pas
  // de globals → erreur no-undef en CI.
  {
    files: ['js/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // service-worker.js : code propre, règles strictes avec contexte SW
  {
    files: ['service-worker.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  // scripts/*.mjs : outils Node (healthchecks, one-shots). ES modules purs,
  // pas de dépendance client — globals Node uniquement.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // Désactive les règles ESLint qui entrent en conflit avec Prettier
  prettier,
];
