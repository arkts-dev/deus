# Contributing to Deus

Thank you for helping improve Deus. Please open an issue before making a large behavior or API change so its product contract and acceptance criteria are clear. Pull requests should explain the user-visible change, relevant safety boundaries, and the checks you ran. Keep code, tests, and documentation in English. Do not include credentials, private workspace data, or logs containing sensitive material.

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

The compiled `dist/` directory is committed because Pi installs this package directly from Git. Rebuild and include its changes with any source edit. The pinned Dexter bridge accepts only its verified executable profile; do not add an alternate command route or guess a new CLI mapping from names alone.

The live fingerprint test is skipped in public CI because the compatible CLI is private. Maintainers with that CLI installed run `DEUS_TEST_PINNED_CLI=1 npm run check` to verify actual executable evidence. The package smoke uses a local fixture and does not claim to validate a real CLI.

The five Pi skills are original Deus documents. See [docs/skills-ownership.md](docs/skills-ownership.md) for the digest update process. Persistent product artifacts belong under `.deus/` unless a user asks for another destination.

## Releasing a GitHub build

A maintainer releases a tested commit with a versioned Git tag. Match the tag to `package.json`, run the checks above, and verify the package contents with `npm pack --dry-run --ignore-scripts --json`. Then create the archive and checksum in a temporary directory:

```sh
npm pack --ignore-scripts --pack-destination "$RELEASE_DIR"
cd "$RELEASE_DIR"
shasum -a 256 deus-ex-machina-<version>.tgz > SHA256SUMS
```

Check the archive by installing it into a clean temporary directory. Push the tested tag, then create a GitHub Release from that exact tag with the `.tgz` and `SHA256SUMS` assets and release notes. Download both assets and verify their checksum. Update the README's versioned install command and release link for each release. Do not publish this package to npm as part of this process.
