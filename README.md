# Deus

Deus 0.3 is an open source [Pi](https://github.com/earendil-works/pi-mono) package for product contracts, research, and evidence-based acceptance. Extensions and lazy skills bridge Dexter; Dexter owns engineering planning, execution, review, and integration. Optional [`deus-mcp`](docs/mcp.md) serves Codex/SSH; no standalone `deus` CLI.

## Requirements

- Node.js 22.19 or newer, npm, Git, and Pi 0.85.1.
- A model configured in Pi for agent-driven research and skills.
- Native Dexter from a trusted signed checkout (see [Dexter CLI](#dexter-cli)); unbundled and unnecessary for design/research.

Pi packages inherit user permissions; review source before installation.

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

The [GitHub Release](https://github.com/arkts-dev/deus/releases/tag/v0.3.0) supplies `deus-ex-machina-0.3.0.tgz` and `SHA256SUMS`. Committed `dist/` supports build-free Git installation.

## First use

Start `pi` in your project. Example requests:

```text
Use designer to define the outcome and acceptance criteria for this feature.
Use product-control to find the work that actually moves the product and keep the Dexter board saturated.
Research the public documentation for this API and distinguish evidence from inference.
Run deus_dexter_probe and explain whether the installed CLI matches the supported profile.
```

Persistent artifacts default to tracked Markdown under `.deus/design/`, `.deus/research/`, or `.deus/handoffs/`. Reports cite sources and gaps; worker exits and board statuses never prove acceptance.

### Dexter CLI

`deus_dexter_probe` verifies the installed Dexter CLI's commit signature and reads version evidence. Six typed mutations require absolute workspaces and verified argv execution, without shells or retries:

- `deus_dexter_submit({workspace, title, body})`
- `deus_dexter_issue_create({workspace, title, body, parent?, dependencies?, priority?})`
- `deus_dexter_issue_nudge({workspace, issue})`
- `deus_dexter_issue_reprioritize({workspace, issue, priority})`
- `deus_dexter_issue_relink({workspace, issue, parent?, addDependencies?, removeDependencies?})` — omit parent to retain it; null clears it.
- `deus_dexter_architecture_accept({workspace, issue, candidate, reason})`

Receipts distinguish `rejected`, `completed`, and `outcome_unknown`, with issue, exit, signal, timeout, cancellation, and diagnostics (≤2 KiB/stream). Output limits never kill commands. Failed/interrupted mutations require live-state inspection, never automatic retry. Completion is not product acceptance. Issue closure shares this contract.

Four readers share `{workspace, section?, cursor?, limit?}` plus `issue`, `mr`, `slug`, or `run`, respectively:

| Tool | Sections (first is default) |
| --- | --- |
| `deus_dexter_issue_read` | summary, metadata, body, notes |
| `deus_dexter_mr_read` | summary, metadata, body, reviews, notes |
| `deus_dexter_wiki_read` | summary, metadata, body |
| `deus_dexter_run_read` | metadata, assignment, system, transcript, stderr |

Responses: `{id, section, text, revision, nextCursor}`. Summary includes metadata/body, not history. `limit`: UTF-8 bytes, default 4096, range 4–16384. Omitted/null cursor starts reading; null nextCursor ends the section. Continue the same artifact/section. Opaque, path-free cursors expire on reload and reject changes. Run assignment/system are separate prompts; transcript is stdout, not a Pi session dump. Missing payloads error.

The CLI lacks structured pagination/run reads. Readers use host-local Forge files (≤64 MiB/file or assembled history), without generic output retrieval. Ordinary read-only tools remain available for inspection and ID discovery.

`deus_dexter_issues_live` reads the frontier; `deus_dexter_issues_plan` proposes actions without mutation; `deus_dexter_issue_close` performs an approved, guarded closure. These access Forge directly. Initialization, drain, directives, request answers/denials, and doctor are unexposed.

`deus_dexter_bots_live({workspace})`: working/stale bots, targets, correlated claims; local PID/remote heartbeat liveness; persisted-config cooldown estimate, not observed scheduler settings. Maximum 16 KiB.

`deus_dexter_events_read({workspace,cursor?,limit?})`: newest-first bus summaries, no bodies; default 20/max 100 records and 16 KiB summary bytes. Cursor continues backward despite appends; expires on reload. Both are local read-only adapters.

`DEXTER_BIN` overrides the default `dexter` lookup. Configure comma-separated full `DEUS_DEXTER_TRUSTED_FINGERPRINTS`: `git verify-commit` checks the executable's enclosing checkout. A matching signature yields `dexter-signed`, verified SHA (`baselineRevision`/`verifiedCommit`), and `verifiedFingerprint`. Otherwise `unknown` blocks **all mutations**, including direct closure, but not reads.

#### Determining the trusted fingerprint

Pin the **full commit-signing fingerprint**, verified independently—not merely printed by the repository.

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

Use full 40-character fingerprints, never short IDs; verify individual maintainers' keys separately. `dexter-web` and `config` are outside this integration; the CLI is not bundled.

### Public web research

`deus_research_web({question,provider?})` runs a bounded foreground research session isolated from local project files. Configure one search provider before requesting search:

| Provider | Configuration |
| --- | --- |
| Exa | `EXA_API_KEY` |
| SearXNG | `DEUS_SEARXNG_URL` |
| Brave | `BRAVE_API_KEY` |
| Tavily | `TAVILY_API_KEY` |

Set `DEUS_WEB_PROVIDER` to `exa`, `searxng`, `brave`, or `tavily` to select a provider explicitly. Otherwise Deus prefers configured Exa, then SearXNG. A `fetch` request can inspect a supplied public URL but does not provide search discovery. Never include private project text or credentials in a public research question.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run skills:verify
npm run format:check
npm run test:package
```

Install Dexter on `PATH` for live checks; adapter tests also accept `DEXTER_BIN`.

GitHub Actions needs a `DEXTER_READ_TOKEN` repository secret with read-only Contents access to `arkts-dev/dexter` for pushes and same-repository PRs. Fork PRs cannot receive that secret, so they run fixture checks with `DEUS_TEST_NO_CLI=1` and skip only the live signature check.

Licensed under [Apache-2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for contribution, security, and dependency details. Git-distributed; `private: true` prevents npm publication.
