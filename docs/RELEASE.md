# Release

This checklist is the operator-facing release procedure for
`@yohawing/three-mmd-loader`. Development details for individual scripts live in
[DEVELOPMENT.md](./DEVELOPMENT.md).

## 1. Preflight

- Confirm the target version and release scope.
- Confirm `CHANGELOG.md` has an entry for the target version.
- Build the `CHANGELOG.md` entry from the commits since the previous release
  tag, not only from the final release-prep commit.
- Confirm `package.json` `version` matches the intended release.
- Confirm the working tree is clean.
- Confirm the release branch is based on `develop`.
- Confirm npm Trusted Publishing is configured for the GitHub `npm`
  environment.

```bash
git status --short
npm ci
```

## 2. Local Checks

Run the same release-blocking checks that CI runs before packaging:

```bash
npm run lint
npm test
npm run build
npm run check:fixtures
npm run smoke:dist
npm run smoke:types
npm pack --dry-run --json
```

The nanoem-backed WASM wrapper is currently not part of the default package
build. Do not run `npm run build:wasm` as a release gate unless the release is
explicitly re-enabling the WASM core path.

## 3. Commit

Commit the version, changelog, and any release-prep changes before tagging.

```bash
git status --short
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

Adjust the staged files if the release includes additional documentation or
source changes.

Push the release-prep commit to `develop` before opening the release PR.

```bash
git push origin develop
```

## 4. Merge `develop` to `main`

Open a pull request from `develop` to `main` before tagging. Do not publish from
`develop`; the release tag must be created from the reviewed and merged `main`
commit.

```bash
gh pr create --base main --head develop --title "chore(release): vX.Y.Z"
```

Review the PR, wait for CI, and merge it into `main`. Direct pushes to `main`
may be blocked by repository rules; use the PR path even when the merge is a
fast-forward.

After merging, update the local `main` branch and confirm that `package.json`
still matches the intended version.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
node -e "const p=require('./package.json'); if (p.version !== 'X.Y.Z') process.exit(1)"
```

## 5. Tag

The release workflow requires the Git tag to match `package.json` exactly.
Create the tag on `main` after the release PR has been reviewed and merged.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

For example, `package.json` version `0.2.0` must be tagged as `v0.2.0`.

## 6. GitHub Actions

The `Release` workflow runs on `v*.*.*` tags. It builds the package, validates
tag/version consistency, creates the npm tarball, publishes to npm, and creates
or updates the GitHub Release.

Verify these workflow results:

- The package job passed `lint`, `test`, `build`, fixture checks, dist smoke,
  and TypeScript consumer smoke.
- The publish job ran under the GitHub `npm` environment.
- npm Trusted Publishing succeeded.
- The GitHub Release exists for the tag, has the package artifact attached, and
  uses the matching `CHANGELOG.md` version section as its release notes.

The release workflow extracts the `## [X.Y.Z]` section from `CHANGELOG.md` for
tag `vX.Y.Z`. If that section is missing, the workflow fails instead of
publishing generic generated notes.

Manual dispatch is also available, but use tag-triggered releases for normal
publishing so the GitHub Release is tied to the version tag.

## 7. Post-release Verification

Verify the published npm artifact rather than only the local package:

```bash
npm view @yohawing/three-mmd-loader version
npm view @yohawing/three-mmd-loader peerDependencies
npm view @yohawing/three-mmd-loader dist-tags
```

When compatibility matters for a downstream app, install the published version
there or in a temporary consumer before updating that app.
