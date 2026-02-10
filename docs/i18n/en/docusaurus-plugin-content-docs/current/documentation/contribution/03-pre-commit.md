# Automatic Formatting and Linting with Husky + lint-staged

## Principle

This configuration uses **Husky** and **lint-staged** to run checks and fixes automatically **before each commit**.

---

## What it does

### For frontend files:
- **ESLint**: automatically fixes formatting issues and some best-practice problems.
- **Prettier**: automatically formats code (indentation, spacing, etc.).

### For backend files:
- **Prettier only**: applies automatic formatting (no ESLint on backend).

---

## Behavior

### Automatic formatting
- Before each commit, code is **automatically formatted** via Prettier (and ESLint for frontend).

### Commit blocking
- Commits are **blocked** if **ESLint finds non-fixable errors** (frontend only).
  - These may include issues related to:
    - Best practices
    - Security
    - Accessibility

---

## Practical notes

- **No manual formatting required**.
- **`git commit` works as usual**.
- **You may encounter linter errors that need manual fixes**.

### If a commit is blocked

Run:

```bash
git commit -m "fix: message" --no-verify
```

## Install dependencies
After pulling updates, install dependencies:

```bash
npm install
```

---

## Update pre-commit configs
**Pre-commit config:** `lint-staged` in the root `package.json`

**ESLint config:** `eslint.config.js` at project root

**Prettier config:** `prettier.config.js` at project root
