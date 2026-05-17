# Tests E2E Playwright — BioMéca

Tests bout-en-bout pour l'app BioMéca (PWA statique). Cible : `http://localhost:8080`.

## Prérequis

1. **Dépendances installées** :
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Credentials de test** : copier le fichier exemple et renseigner le password :
   ```bash
   cp .env.local.example .env.local
   ```
   Puis éditer `.env.local` et mettre le mot de passe du compte test (`podologue@hotmail.com`). `.env.local` est dans `.gitignore` — ne JAMAIS le committer.

3. **Serveur HTTP** : démarré automatiquement par Playwright (`python3 -m http.server 8080`). Si tu as déjà un serveur sur le port 8080 servant la racine du projet, Playwright le réutilise (`reuseExistingServer: true`).

## Lancer les tests

```bash
npm run test:e2e          # headless
npm run test:e2e:headed   # avec navigateur visible
npm run test:e2e:ui       # mode interactif Playwright
npm run test:e2e:report   # afficher le dernier rapport HTML
```

## Scénarios couverts

### `auth.spec.ts` — Authentification
- **1.1** Login avec credentials test → arrivée sur `#pg-patients`.
- **1.2** Logout → retour à l'écran de login (`#pwa-login` visible).
- **1.3** Login avec mauvais mot de passe → message d'erreur affiché dans `#pwa-login-err`.

### `patient.spec.ts` — Création + persistence patient
- **2.1** Création d'un nouveau patient avec nom unique (`Test${Date.now()}`) → apparaît dans `#pt-list-el`.
- **2.2** Reload de la page → patient toujours présent (vérifie session localStorage + données Supabase).
- **2.3** Suppression du patient → disparaît de la liste.

Chaque test patient utilise un nom unique horodaté et un `afterEach` qui supprime le patient (best-effort) pour limiter la pollution de la base Supabase prod.

## Caveats connus

- **Données prod** : les tests créent de vraies données dans Supabase prod (pas de DB de test pour l'instant). Le cleanup `afterEach` couvre le cas nominal, mais si un test crash brutalement, un patient `E2E Test<timestamp>` peut rester en base.
- **Compte test `podologue@hotmail.com`** : `licence_payee=FALSE` (résiliation du 2026-05-16). Si l'app finit par bloquer la création de patients sans licence, les tests 2.x échoueront — à diagnostiquer : soit remettre `licence_payee=true` en SQL temporairement, soit créer un compte de test dédié.
- **Pas de CI** : tests local-only pour l'instant. Pas de hook GitHub Actions.

## Structure

```
tests/e2e/
├── README.md                this file
├── fixtures/
│   └── auth.ts              helpers login() / logout() reutilisables
├── auth.spec.ts             scenarios 1.x
└── patient.spec.ts          scenarios 2.x
```

## Debug

- Trace Playwright dispo en cas d'échec (`trace: 'retain-on-failure'`) → ouvrir avec `npx playwright show-trace test-results/.../trace.zip`.
- Screenshots auto sur échec (`screenshot: 'only-on-failure'`).
- Mode headed pour voir ce qui se passe : `npm run test:e2e:headed`.
