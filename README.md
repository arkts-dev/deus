# Deus

Deus 0.3 is an open source [Pi](https://github.com/earendil-works/pi-mono) package for product contracts, local and public research, and evidence-based acceptance. It adds a small Dexter CLI bridge without taking over engineering orchestration: Dexter remains responsible for implementation planning, execution, review, and integration.

The package contains Pi extensions and on-demand skills for design, product control, Dexter control, research, and review. Deus has no standalone `deus` command or platform-specific executable.

## Requirements

- Node.js 22.19 or newer, npm, Git, and Pi 0.85.1.
- A model configured in Pi for agent-driven research and skills.
- The native Dexter CLI, from a checkout whose commits are signed by a trusted GPG key (see [Dexter CLI](#dexter-cli)). The CLI is not included in this repository; design and research capabilities do not require it.

Pi packages run with the user's system permissions. Review the extension and skill source before installing it.

## Install

Install Pi if needed:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
```

Install the first Deus release from its versioned Git tag:

```sh
pi install git:github.com/arkts-dev/deus@v0.3.0
pi list
```

The [v0.3.0 GitHub Release](https://github.com/arkts-dev/deus/releases/tag/v0.3.0) also provides the prebuilt `deus-ex-machina-0.3.0.tgz` package and `SHA256SUMS`. The archive contains compiled JavaScript, the packaged skills, the minimal prompt, metadata, and license files. Pi's supported installation path for this release is the Git tag above; the release archive is a downloadable build for inspection or other npm-compatible tooling. It is not a separate executable and does not need an operating-system-specific variant. The compiled `dist/` files are committed so Pi can load the Git installation without a local TypeScript build.

## First use

Start `pi` in your project. You can ask it to create a product design contract, inspect local code with cited evidence, or research a public question. For example:

```text
Use designer to define the outcome and acceptance criteria for this feature.
Use product-control to find the work that actually moves the product and keep the Dexter board saturated.
Research the public documentation for this API and distinguish evidence from inference.
Run deus_dexter_probe and explain whether the installed CLI matches the supported profile.
```

Deus writes requested persistent product artifacts as tracked Markdown under `.deus/design/`, `.deus/research/`, or `.deus/handoffs/` by default. Research reports cite inspected sources and identify gaps. A successful worker exit or task-board status is never treated as proof that a product requirement was met.

### Dexter CLI

`deus_dexter_probe` verifies the installed Dexter CLI's commit signature and reads version evidence. `deus_dexter_exec({command,args,workspace})` executes one command with an absolute workspace and no shell interpolation or automatic retry. Every workspace command is blocked when verification fails. Set `DEXTER_BIN` to an executable path to override the default `dexter` lookup.

Set `DEUS_DEXTER_TRUSTED_FINGERPRINTS` to one or more comma-separated full GPG fingerprints. The plugin then verifies (`git verify-commit`) that the installed Dexter commit is signed by one of those keys; the recognized profile is `dexter-signed`, `baselineRevision` is the verified commit SHA, and the probe also reports `verifiedCommit` and `verifiedFingerprint`. The Dexter checkout is located by walking up from the resolved `dexter` executable. Without a matching signature the profile is `unknown` and no workspace command runs.

#### Determining the trusted fingerprint

`DEUS_DEXTER_TRUSTED_FINGERPRINTS` is the **full fingerprint of the key that signs the Dexter commits you run**, verified out-of-band — not guessed, and not trusted merely because the repo printed it.

```sh
# Who signed the commit you are on?
git -C /path/to/dexter log --show-signature -1
#   → "Primary key fingerprint: 9684 79A1 AFF9 27E3 7D1A  566B B569 0EEE BB95 2194"

# Confirm that key belongs to the signer via a source you independently trust,
# e.g. GitHub's published web-flow key for commits merged through GitHub:
curl -sL https://github.com/web-flow.gpg | gpg --show-keys

# Pin the full fingerprint (no spaces). Multiple trusted keys: comma-separated.
export DEUS_DEXTER_TRUSTED_FINGERPRINTS=968479A1AFF927E37D1A566BB5690EEEBB952194
```

Always use the full 40-character fingerprint, never the short key ID. For commits signed by an individual maintainer rather than GitHub, confirm that maintainer's published key instead.

The separate `dexter-web` server and `config` command are outside this integration. The private CLI is **not** included in the GitHub Release.

### Public web research

`deus_research_web({question,provider?})` runs a bounded foreground research session isolated from local project files. Configure one search provider before requesting search:

| Provider | Configuration |
| --- | --- |
| Exa | `EXA_API_KEY` |
| SearXNG | `DEUS_SEARXNG_URL` |
| Brave | `BRAVE_API_KEY` |
| Tavily | `TAVILY_API_KEY` |

Set `DEUS_WEB_PROVIDER` to `exa`, `searxng`, `brave`, or `tavily` to select a provider explicitly. Without that setting, Deus selects Exa when its key is present, then SearXNG when its URL is present. A `fetch` request can inspect a supplied public URL but does not provide search discovery. Never include private project text or credentials in a public research question.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run skills:verify
npm run format:check
npm run test:package
```

Install Dexter before running `npm run check` or `npm run test:package`. Put its executable on `PATH` for the installed-package smoke test; `DEXTER_BIN` can point to the same executable for the adapter tests.

GitHub Actions needs a `DEXTER_READ_TOKEN` repository secret with read-only Contents access to `arkts-dev/dexter` for pushes and same-repository PRs. Fork PRs cannot receive that secret, so they run fixture checks with `DEUS_TEST_NO_CLI=1` and skip only the live signature check.

The package is licensed under [Apache-2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for development and release steps, [SECURITY.md](SECURITY.md) for vulnerability reports, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency notices. This repository is Git-distributed; `private: true` in `package.json` prevents accidental npm publication.
