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

  // js/landing.js et js/biomeca.js : code legacy, on rétrograde no-unused-vars, no-undef
  // et no-empty pour éviter de faire exploser la CI sur des globals partagés entre fichiers
  // et des catch silencieux idiomatiques (storage, speech API, network).
  {
    files: ['js/landing.js', 'js/biomeca.js'],
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

  // Désactive les règles ESLint qui entrent en conflit avec Prettier
  prettier,
];
