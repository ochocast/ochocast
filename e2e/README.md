# Tests End-to-End (E2E) - Playwright

Ce dossier contient la configuration et les tests End-to-End pour l'application **Ochocast**. 

Les tests E2E permettent de simuler des parcours utilisateurs complets en contrôlant de vrais navigateurs (Chromium, Firefox, WebKit).

---

## 🚀 Lancement des tests

### En local (ligne de commande)
```bash
npm run test:e2e
```

### En local (Mode UI interactif)
Recommandé pour le développement et le débogage. Ouvre une interface graphique montrant les étapes pas à pas :
```bash
npm run test:e2e:ui
```

### Enregistrer un nouveau test (Codegen)
Génère le code du test automatiquement en enregistrant vos clics et frappes au clavier dans le navigateur :
```bash
npx playwright codegen http://localhost:3000
```

---

## 🔒 Gestion de l'Authentification (Keycloak)

Pour optimiser le temps d'exécution et éviter le coût d'une connexion complète à Keycloak pour chaque fichier de test, nous utilisons la fonctionnalité **Global Setup** de Playwright :

1. Le script [auth.setup.ts](file:///Users/tbriens/Documents/epita/ochocast/e2e/auth.setup.ts) se lance en premier.
2. Il navigue sur la page d'accueil de Ochocast, clique sur le bouton de connexion, renseigne les identifiants de test, et attend d'être redirigé.
3. Il sauvegarde l'état de la session (cookies et localStorage) dans le fichier temporaire `playwright/.auth/user.json`.
4. Tous les tests se situant dans `e2e/tests` chargent automatiquement cet état et démarrent directement connectés.

### Prérequis Keycloak en local
Par défaut, le conteneur Keycloak importé localement ne contient pas d'utilisateur de test pré-configuré. Avant de lancer les tests, assurez-vous d'avoir créé un utilisateur de test dans votre Keycloak local (http://localhost:8080) dans le realm `local-realm` et d'avoir configuré les variables d'environnement suivantes ou de modifier le fichier `auth.setup.ts` :

- **Nom d'utilisateur par défaut :** `test-user`
- **Mot de passe par défaut :** `test-password`

---

## 📁 Structure des fichiers

- `playwright.config.ts` : Configuration globale de Playwright à la racine.
- `e2e/` :
  - `auth.setup.ts` : Script de connexion initial et mise en cache de la session.
  - `tests/` : Dossier contenant les spécifications de tests (ex : `login.spec.ts`, etc.).
- `playwright-report/` : Rapport HTML généré après l'exécution.
