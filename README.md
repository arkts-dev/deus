# Deus

Deus 0.3 is an open source [Pi](https://github.com/earendil-works/pi-mono) package for product contracts, local and public research, and evidence-based acceptance. It adds a small Dexter CLI bridge without taking over engineering orchestration: Dexter remains responsible for implementation planning, execution, review, and integration.

The package contains Pi extensions and on-demand skills for design, product control, Dexter control, research, and review. Deus has no standalone `deus` command or platform-specific executable.

## Requirements

- Node.js 22.19 or newer, npm, Git, and Pi 0.85.1.
- A model configured in Pi for agent-driven research and skills.
- The native Dexter CLI pinned to `arkts-dev/dexter` commit `3fb8d3753d57dbb28affd540b99b45ba9097e15f` for Dexter commands. The CLI is not included in this repository; design and research capabilities do not require it.

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

`deus_dexter_probe` reads version and command-help evidence. `deus_dexter_exec({command,args,workspace})` executes one command with an absolute workspace and no shell interpolation or automatic retry. Every workspace command is blocked when the executable fingerprint is unknown. Set `DEXTER_BIN` to an executable path to override the default `dexter` lookup. The plugin supports only the pinned `dexter-3fb8d375` profile; a different or missing executable can be diagnosed but cannot run workspace commands. The separate `dexter-web` server and `config` command are outside this integration. The private CLI is **not** included in the GitHub Release.

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

Install the pinned Dexter CLI before running `npm run check` or `npm run test:package`. Put its executable on `PATH` for the installed-package smoke test; `DEXTER_BIN` can point to the same executable for the adapter tests.

GitHub Actions needs a `DEXTER_READ_TOKEN` repository secret with read-only Contents access to `arkts-dev/dexter` for pushes and same-repository PRs. Fork PRs cannot receive that secret, so they run fixture checks with `DEUS_TEST_NO_CLI=1` and skip only the pinned executable fingerprint check.

The package is licensed under [Apache-2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for development and release steps, [SECURITY.md](SECURITY.md) for vulnerability reports, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency notices. This repository is Git-distributed; `private: true` in `package.json` prevents accidental npm publication.
