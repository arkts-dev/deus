# Deus

Deus 0.3 is an open source [Pi](https://github.com/earendil-works/pi-mono) package for product contracts, local and public research, and evidence-based acceptance. It adds a small Dexter CLI bridge without taking over engineering orchestration: Dexter remains responsible for implementation planning, execution, review, and integration.

The package contains Pi extensions and on-demand skills for design, product control, Dexter control, research, and review. The Pi entry points remain available. This adaptation also supplies `deus-mcp`, a Node.js stdio MCP server for Codex and SSH connections; it has no platform-specific binary.

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

## Codex and remote Dexter (MCP adaptation)

This source tree adds an MCP entry point while preserving the three Pi extensions,
all eight original tools, and all six original skills. The same registered tool
handlers serve both hosts. `deus-mcp` is a foreground stdio server, not an HTTP
server or a persistent job scheduler. No changes to Dexter or dexter-web are required.

### Server installation

Use Node.js >=22.19, npm, Git, GnuPG with keyserver support, a working Dexter CLI
and workspace, and SSH key access. Keep Dexter's normal Python/Pi/model environment
available to the SSH user. A separate model is not needed for the MCP bridge itself.
Pi remains a package dependency because the original web-research engine uses it.
The optional Dexter backend and frontend are not needed for this connection.

From this source tree, `npm ci --ignore-scripts && npm run build` prepares the
server. To install the prebuilt archive instead, use an application directory owned
by the service user (replace every example path):

```sh
npm install --prefix /opt/deus-mcp --ignore-scripts \
  /path/to/deus-ex-machina-0.3.0.tgz \
  @earendil-works/pi-coding-agent@0.85.1 typebox@1.3.7
```

Create an executable `/opt/deus-mcp/start` on the Dexter host:

```sh
#!/bin/sh
set -eu
# Add the actual Node >=22.19 installation directory if it is not on this PATH.
export PATH=/usr/local/bin:/usr/bin:/bin
export DEXTER_BIN=/srv/dexter/.venv/bin/dexter
export DEUS_DEXTER_TRUSTED_FINGERPRINTS=REPLACE_WITH_VERIFIED_FULL_FINGERPRINT
exec /opt/deus-mcp/node_modules/.bin/deus-mcp --workspace /srv/workspaces/project
```

The workspace must already be an existing absolute directory. It may be empty when
explicitly initializing a new workspace. The server resolves it once and binds all
calls to that canonical path. Configure a separate named MCP connection for another
workspace. The SSH account is a trusted workspace operator: this transport is not a
sandbox for hostile users or concurrent hostile filesystem changes.

The real Dexter executable must resolve inside its signed Git checkout. A source ZIP
has no upstream commit signature and is insufficient for production trust. Do not
use the integration test's generated keys or GPG wrapper in production. The current
signature verifier retrieves trusted public keys from `keyserver.ubuntu.com`, so
that service must be reachable. Provider credentials stay in the server's launch
environment; SSH does not automatically forward the local Codex environment.

### Connect Codex

First configure and verify normal SSH key access to the host alias `dexter-host`.
The server launch command must not print shell banners or other text to stdout.
Add this block to Codex's configuration, using the actual host and script path:

```toml
[mcp_servers.deus_remote]
command = "ssh"
args = ["-T", "-o", "BatchMode=yes", "dexter-host", "/opt/deus-mcp/start"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

For a server on the same machine, use:

```toml
[mcp_servers.deus_local]
command = "/opt/deus-mcp/node_modules/.bin/deus-mcp"
args = ["--workspace", "/srv/workspaces/project"]
env_vars = ["DEXTER_BIN", "DEUS_DEXTER_TRUSTED_FINGERPRINTS"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

Restart the MCP connection after changing its configuration. A useful first request:

> Use Deus to identify its server workspace, read the dexter-control skill, probe
> Dexter, and show the current tasks. Do not start the drain or create a task.

The server supplies workflow instructions during MCP initialization. Its
`deus_skill_read` tool loads the original packaged skill text on demand, so copying
skills into a managed product repository or installing Pi on the Codex computer is
unnecessary. `deus_workspace_info` returns the exact workspace for subsequent calls.

### Original workflows over MCP

| Workflow | MCP tools |
| --- | --- |
| Dexter commands | `deus_dexter_probe`, `deus_dexter_exec` |
| Product control | `deus_board_live`, `deus_board_plan`, `deus_board_close` |
| Design contracts | `deus_design_check`, `deus_design_write` |
| Public research | `deus_research_web` |
| Load original workflows | `deus_skill_read` |
| Remote source research and review | `deus_artifact_list`, `deus_artifact_read` |
| Persist research/review reports and handoffs | `deus_artifact_write` |

All paths refer to the server. Artifact reads are bounded and return byte offsets
and a digest of the source bytes before output redaction. They exclude Dexter-owned state, `.git`,
`node_modules`, `.env*`, and `dexter.config.json`; inspect Dexter state through its
dedicated tools. Source files under `fs/` remain readable for acceptance. Symlinks,
traversal and special files are rejected by the MCP file boundary. The workspace
owner must not race filesystem changes against it.

Artifact writes create new `.deus/research/<slug>.md` or
`.deus/handoffs/<slug>.md` documents with the skill's required front matter and
never overwrite an existing file. Save a new review report when working remotely.
Designs use their original validation and write-once tools. The original Pi skills
can still use the host agent's filesystem for their existing workflows.

Public research retains the original isolated Pi session, bounded requests, public
URL guards and source receipts. Configure its search provider and model credentials
in the server environment as described above. MCP does not reuse Codex's model
session or subscription. A no-model response means research is unavailable; it is
not a successful research result.

### Cancellation and uncertain outcomes

Calls are serialized per MCP connection, matching the existing tool workflow.
There is no automatic command retry or mutation replay. Client cancellation,
stdin EOF, SIGINT, SIGTERM or SIGHUP aborts foreground processes. A lost connection
or failed command can leave partial effects: reconnect and inspect current state
before deciding on another command. Increasing `tool_timeout_sec` is necessary if
an explicitly requested foreground `run` exceeds the client's default deadline.
Only one Dexter drain may operate on a workspace. A durable background operation
service and cross-connection mutation deduplication are outside this adaptation.

### Reproduce verification

```sh
npm ci --ignore-scripts
npm run check
npm run skills:verify
npm run format:check
DEUS_TEST_NO_CLI=1 npm run test:package
DEUS_TEST_DEXTER_SOURCE=/absolute/path/to/extracted/dexter npm run test:remote
```

The package smoke installs the archive into a clean directory and exercises both
Pi entry points and a real MCP client/server process. The remote test additionally
needs Docker and an SSH client. It creates a disposable container, test SSH keys,
real GPG-signed test snapshots, and a fresh workspace; it removes the container and
keys on exit. It uses the supplied real Dexter code for init/submit/status/show
and board checks. A separately labeled fake executable tests in-flight disconnects.
Test signatures establish test-fixture identity only, not upstream provenance.
It does not spend model credits or validate live external search/model services.
