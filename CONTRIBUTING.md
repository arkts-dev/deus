# Contributing to Deus

Open an issue before large behavior/API changes, defining scope and acceptance. PRs explain user-visible changes, safety boundaries, and checks. Use English; exclude credentials, private workspace data, and sensitive logs.

## Local development

Use Node.js 22.19 or newer, npm, and Git. The repository's CI runs:

```sh
npm ci --ignore-scripts
npm run check
npm run skills:verify
npm run format:check
npm run test:package
npm run build
git diff --exit-code -- dist
```

Commit rebuilt `dist/`: Pi installs directly from Git. Accept only trusted Dexter executables; verify argv against the real parser, never infer mappings or add alternate execution routes.

Build current Dexter (Node 26.11.1), then run `npm run test:current-dexter -- /path/to/dexter`: seven parser-only argv checks, no project mutations. Deus requires Node ≥22.19.

The live signature test is skipped on fork PRs because the compatible CLI is private. Maintainers run `npm run test:package` with `DEUS_DEXTER_TRUSTED_FINGERPRINTS` set to verify actual signature evidence. The package smoke uses a local fixture and does not claim to validate a real CLI.

The Pi skills are original Deus documents. See [docs/skills-ownership.md](docs/skills-ownership.md) for the digest update process. Persistent product artifacts belong under `.deus/` unless a user asks for another destination.

## Releasing a GitHub build

A maintainer releases a tested commit with a versioned Git tag. Match the tag to `package.json`, run the checks above, and verify the package contents with `npm pack --dry-run --ignore-scripts --json`. Then create the archive and checksum in a temporary directory:

```sh
npm pack --ignore-scripts --pack-destination "$RELEASE_DIR"
cd "$RELEASE_DIR"
shasum -a 256 deus-ex-machina-<version>.tgz > SHA256SUMS
```

Check the archive by installing it into a clean temporary directory. Push the tested tag, then create a GitHub Release from that exact tag with the `.tgz` and `SHA256SUMS` assets and release notes. Download both assets and verify their checksum. Update the README's versioned install command and release link for each release. Do not publish this package to npm as part of this process.
