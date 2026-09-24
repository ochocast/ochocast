---
name: fix-deps
description: Resolve Dependabot alerts (all severities) and dependency updates across the Ochocast monorepo, fix breakages, then open a PR. Invoke it (e.g. `/fix-deps` or "run the fix-deps skill") for a full cleanup, or give it a PR number to repair a failing Renovate/Dependabot PR.
---

# fix-deps

Projects: npm in `.` (root), `backend`, `frontend`, `docs`, `ffmpegServer`; Go in `sfuServer`, `liveRecoder`.

## Mode A: full cleanup (no PR number given)

1. **Branch from up-to-date main**: `git fetch origin main && git checkout -b fix/deps-<yyyy-mm-dd> origin/main`.
2. **List open alerts** (all severities) and group by package/manifest:
   ```bash
   gh api "repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100" --paginate \
     --jq '.[] | [.security_advisory.severity, .dependency.package.ecosystem, .dependency.package.name, .dependency.manifest_path, .security_vulnerability.first_patched_version.identifier] | @tsv' | sort | uniq -c
   ```
3. **Go**: in `sfuServer` and `liveRecoder`, `go get -u ./... && go mod tidy && go build ./...`. Delete any binary produced by `go build` (e.g. `liveRecoder/liveRecorder`). Check that the `go` directive still matches the `golang:` tag in the Dockerfiles.
4. **npm**: in each project run `npm audit fix`, then `npm audit`.
5. **Stale `overrides`**: `npm audit fix` does not touch pinned `overrides` in `package.json` (backend, frontend, docs). For each vulnerable package still pinned, look up the patched version (`npm view <pkg> version`, or `npm view <pkg>@<major> version | tail -1` to stay on the same major) and bump the override. For a vulnerable transitive package with no override, add one.
6. **Direct dependencies with no non-breaking fix** (e.g. `sharp`): bump in `package.json` manually. Avoid `npm audit fix --force`, it makes uncontrolled major jumps.
7. `npm install` (or `npm ci` to confirm lockfile consistency) in each project, then re-run `npm audit` until only accepted leftovers remain. Report leftovers with reason (no patch available, breaking major, etc.).
8. Go to **Verify and fix breakages**.

## Mode B: repair a PR (a PR number is given)

1. `gh pr checkout <PR#>`; `gh pr checks <PR#>` and `gh run view <run> --log-failed` to find what fails.
2. Reproduce locally, fix the code or config (see breakage list below), push to the PR branch.
3. Re-check CI. Do not force-push a Renovate branch without asking.

## Verify and fix breakages

Run everything touched, compare against `main` when something fails to tell pre-existing failures from new ones (`git stash`, re-run, `git stash pop`, or a worktree):

- `backend`: `npm run build && npm test`
- `frontend`: `CI=false npm run build`
- `docs`: `npm run build` (known to fail on main with a Docusaurus "Progress Plugin" validation error; not caused by dependency bumps)
- `ffmpegServer`: `node -e "require('sharp')"`
- `sfuServer`: `go test ./...`; `liveRecoder`: `go vet ./...`

Known breakage patterns:
- **sharp >= 0.35 (backend)**: types are ESM-first. Use `import sharp = require('sharp')` and keep the `paths` mapping `"sharp": ["node_modules/sharp/dist/index.d.cts"]` in `backend/tsconfig.json`. `import * as sharp` fails with TS2349.
- Bumped overrides can conflict with a parent package's range: check `npm ls <pkg>` for `invalid`/`overridden`.
- Major bumps: read the changelog, fix call sites, do not silence type errors.

## Ship

1. Commit (Conventional Commits, e.g. `fix(deps): resolve Dependabot alerts`), push, open a PR with: what was bumped per project, breakage fixes, leftovers not covered, test plan.
2. E2E tests (`.github/workflows/e2e.yml`, self-hosted runner) run automatically on every PR targeting `main`, except branches starting with `renovate/`. Rebase on latest `main` before pushing so the run tests the merged result. Ask the user before force-pushing a rebased branch you did not create. Re-read the workflow file if in doubt, triggers change.
3. Stop after the PR is opened. Do not merge it. The developer merges it and then checks on GitHub (Security > Dependabot) that the alerts closed.
