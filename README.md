# Deus

Deus 0.3 is an open-source [Pi](https://github.com/earendil-works/pi-mono) package for product contracts, research, and evidence-based acceptance. Dexter owns engineering planning, execution, review, and integration. [`deus-mcp`](docs/mcp.md) serves Codex/SSH; no standalone `deus` CLI.

## Requirements and installation

Node ≥22.19, npm, Git, Pi 0.85.1; a configured Pi model for research. Dexter is unbundled, unnecessary for design/research, and requires a trusted signed checkout for mutations. Packages inherit user permissions; review source.

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
pi install git:github.com/arkts-dev/deus@v0.3.0
pi list
```

The [release](https://github.com/arkts-dev/deus/releases/tag/v0.3.0) supplies `deus-ex-machina-0.3.0.tgz`/`SHA256SUMS`. Committed `dist/` permits build-free installation.

Start Pi in your project; request designer, product-control, research, or `deus_dexter_probe`. Artifacts default to tracked Markdown under `.deus/design/`, `.deus/research/`, or `.deus/handoffs/`. Cite sources/gaps; worker exits, board statuses and model claims never prove acceptance.

### Dexter CLI

`deus_dexter_probe({diagnostics:false})` returns trust evidence; true adds bounded diagnostics. Six mutations require absolute workspaces and verified executable/argv, without shells or retries:

- `deus_dexter_submit({workspace,title,body})`
- `deus_dexter_issue_create({workspace,title,body,parent,dependencies,priority})`: standalone parent null; dependencies []; normal priority 3 (1 highest, 4 lowest).
- `deus_dexter_issue_nudge({workspace,issue})`
- `deus_dexter_issue_reprioritize({workspace,issue,priority})`
- `deus_dexter_issue_relink({workspace,issue,parent,addDependencies,removeDependencies})`: parent "unchanged" retains, null clears, ID replaces; [] means no dependency changes.
- `deus_dexter_architecture_accept({workspace,issue,candidate,reason})`

Receipts preserve status (`rejected`, `completed`, `outcome_unknown`), issue, exit, signal, timeout, cancellation, reasons and diagnostics (≤2 KiB/stream). Output limits never kill mutations. Failed/interrupted/uncertain outcomes require live-state inspection, never automatic retry. Completion is not acceptance; closure shares these rules.

All tool fields are explicit. Four readers take `{workspace,section,cursor,limit}` plus `issue`, `mr`, `slug`, or `run`:

| Tool | Sections (first is normal) |
| --- | --- |
| `deus_dexter_issue_read` | summary, metadata, body, notes |
| `deus_dexter_mr_read` | summary, metadata, body, reviews, notes |
| `deus_dexter_wiki_read` | summary, metadata, body |
| `deus_dexter_run_read` | metadata, assignment, system, transcript, stderr |

Responses: `{id,section,text,revision,nextCursor}`. Normally limit 2048 UTF-8 bytes (4–16384). Null cursor starts; null nextCursor ends. Continue the same artifact/section. Path-free cursors expire on reload and reject changes. Summary includes metadata/body, not history. Run assignment/system are separate prompts; transcript is stdout, not Pi session data. Missing payloads error.

The CLI lacks structured pagination/run reads. Readers access host-local Forge files (≤64 MiB/file/history); ordinary read-only inspection remains available.

`deus_dexter_issues_live`/`issues_plan` take `{workspace,cursor,limit}` (normally null/20), returning records/total/revision/nextCursor, ≤8 KiB/page. Changes invalidate cursors. Live records retain readiness/claims/blockers; plans retain classifications/actions/closures. `deus_dexter_issue_close` guards approved closure; successor is ID/null. Initialization, drain, directives, request answers/denials, config and doctor are unexposed.

`deus_dexter_bots_live({workspace})`: working/stale bots, targets, correlated claims, PID/heartbeat liveness; ≤16 KiB. Cooldown estimates persisted-config policy, not observed scheduler settings.

`deus_dexter_events_read({workspace,cursor,limit})`: newest-first summaries, no bodies; normally null/20; max 100 records/8 KiB. Backward continuation survives appends; cursors expire on reload.

`DEXTER_BIN` overrides `dexter` on PATH. Pin comma-separated, full `DEUS_DEXTER_TRUSTED_FINGERPRINTS`. `git verify-commit` checks the executable's checkout; verified signer/commit yield `dexter-signed`. Unknown profile blocks all mutations, including closure, not reads.

Independently verify the signer—not merely repository output:

```sh
git -C /path/to/dexter log --show-signature -1
curl -sL https://github.com/web-flow.gpg | gpg --show-keys
export DEUS_DEXTER_TRUSTED_FINGERPRINTS=968479A1AFF927E37D1A566BB5690EEEBB952194
```

GitHub's published web-flow key applies to GitHub-signed merges; independently verify other maintainers. Never use short IDs. Dexter/config services are unbundled.

### Public web research

`deus_research_web({question,provider})`: bounded foreground research isolated from projects. "default" uses configuration; Exa `EXA_API_KEY`, SearXNG `DEUS_SEARXNG_URL`, Brave `BRAVE_API_KEY`, Tavily `TAVILY_API_KEY`. `DEUS_WEB_PROVIDER` selects explicitly; otherwise Exa precedes SearXNG. `fetch` inspects public URLs, not search discovery. Never send private text/credentials.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run skills:verify
npm run format:check
npm run test:package
```

Live checks require Dexter on PATH. CI uses read-only `DEXTER_READ_TOKEN` for `arkts-dev/dexter`; forks use `DEUS_TEST_NO_CLI=1`, skipping live signature checks, not fixtures.

[Apache-2.0](LICENSE); [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), [notices](THIRD_PARTY_NOTICES.md). Git-distributed; `private:true` prevents npm publication.
