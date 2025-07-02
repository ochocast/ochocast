# Formatage et Lint Automatique avec Husky + lint-staged

## Principe

Cette configuration utilise **Husky** et **lint-staged** pour effectuer automatiquement des vérifications et des corrections de code **avant chaque commit**.

---

## Ce que ça fait

### Pour les fichiers *frontend* :
- **ESLint** : corrige automatiquement les erreurs de formatage *et* certaines erreurs de bonnes pratiques.
- **Prettier** : formate automatiquement le code (indentation, espaces, etc.).

### Pour les fichiers *backend* :
- **Prettier uniquement** : applique un formatage automatique (pas de lint ESLint côté backend).

---

## Ce qui se passe concrètement

### Formatage automatique
- Avant chaque commit, le code est **automatiquement formaté** grâce à Prettier (et ESLint pour le frontend).

### Blocage du commit
- Le commit sera **bloqué** si **ESLint détecte des erreurs non corrigibles automatiquement** (frontend uniquement).
  - Cela peut inclure des erreurs de :
    - Bonnes pratiques
    - Sécurité
    - Accessibilité

---

## En pratique

- **Pas besoin de formater manuellement**.
- **Rien ne change** dans la manière de committer (`git commit` fonctionne normalement).
- **Parfois des erreurs de bonnes pratiques seront relevées** automatiquement.

### En cas de blocage
- Si vous êtes bloqué par une erreur difficile à corriger :

  ```bash
  git commit -m "fix: toto" --no-verify

## Installation des dépendances
Après avoir récupéré cette mise à jour, n’oubliez pas d’installer les nouvelles dépendances :
  ```bash
  npm install
  ```

---
## Mise à jour des configs de pre-commit
**Config du pre-commit :** "lint-staged" dans le *package.json* à la racine du projet

**Config d'eslint :** *eslint.config.js* à la racine du projet

**Config de prettier :** *prettier.config.js* à la racine du projet