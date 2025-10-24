# Automatic Formatting and Linting with Husky + lint-staged

## Principle

This configuration uses **Husky** and **lint-staged** to automatically perform code checks and corrections **before each commit**.

---

## What it does

### For *frontend* files:
- **ESLint**: automatically fixes formatting errors *and* some best practice errors.
- **Prettier**: automatically formats code (indentation, spacing, etc.).

### For *backend* files:
- **Prettier only**: applies automatic formatting (no ESLint linting on backend).

---

## What happens in practice

### Automatic formatting
- Before each commit, code is **automatically formatted** using Prettier (and ESLint for frontend).

### Commit blocking
- The commit will be **blocked** if **ESLint detects errors that cannot be automatically fixed** (frontend only).
  - This may include errors related to:
    - Best practices
    - Security
    - Accessibility

---

## In practice

- **No need to format manually**.
- **Nothing changes** in the way you commit (`git commit` works normally).
- **Sometimes best practice errors will be automatically detected**.

### In case of blocking
- If you are blocked by an error that is difficult to fix:

  ```bash
  git commit -m "fix: toto" --no-verify

## Installing dependencies
After retrieving this update, don't forget to install the new dependencies:
  ```bash
  npm install
  ```

---
## Updating pre-commit configs
**Pre-commit config:** "lint-staged" in the *package.json* at the project root

**ESLint config:** *eslint.config.js* at the project root

**Prettier config:** *prettier.config.js* at the project root