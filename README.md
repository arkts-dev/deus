# Deus

Deus 0.3 supplies product contracts, research, and acceptance for [Pi](https://github.com/earendil-works/pi-mono) and [MCP](docs/mcp.md). Dexter owns engineering planning, execution, review, and integration.

## Requirements and installation

Requires Node ≥22.19, npm, Git, Pi; host web tools for research. Unbundled Dexter requires trusted signatures for mutations. Review source: packages inherit user permissions.

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
pi install git:github.com/arkts-dev/deus@v0.3.0
pi list
```

The [release](https://github.com/arkts-dev/deus/releases/tag/v0.3.0) supplies `deus-ex-machina-0.3.0.tgz`/`SHA256SUMS`. Committed `dist/` permits build-free installation.

Start Pi in your project; request designer, product-control, research, or `deus_dexter_probe`. Artifacts default to tracked Markdown under `.deus/design/`, `.deus/research/`, or `.deus/handoffs/`. Cite sources/gaps; worker exits, board statuses and model claims never prove acceptance.

### Dexter CLI

`deus_dexter_probe({diagnostics:false})` returns trust evidence; true adds bounded diagnostics. Seven mutations require absolute workspaces and verified executable/argv, without shells or retries:

- `deus_dexter_epic_create({workspace,title,body})`: creates an objective for decomposition.
- `deus_dexter_task_create({workspace,title,body,parent,dependencies,priority})`: standalone parent null; dependencies []; normal priority 3 (1 highest, 4 lowest).
- `deus_dexter_issue_nudge({workspace,issue})`
- `deus_dexter_issue_reject({workspace,issue})`: rejects the target and every unfinished descendant. Inspect the subtree and obtain explicit user authorization first; rejection is not completion and does not satisfy dependencies.
- `deus_dexter_issue_reprioritize({workspace,issue,priority})`
- `deus_dexter_issue_relink({workspace,issue,parent,addDependencies,removeDependencies})`: parent "unchanged" retains, null clears, ID replaces; [] means no dependency changes.
- `deus_dexter_architecture_accept({workspace,issue,candidate,reason})`

Receipts: status (`rejected`, `completed`, `outcome_unknown`), issue, exit, signal, timeout, cancellation, reasons, diagnostics (≤2 KiB/stream). Output limits never kill mutations. Inspect live state after uncertainty; never automatically retry. Completion is not acceptance.

All tool fields are explicit. Four readers take `{workspace,section,cursor,limit}` plus `issue`, `mr`, `slug`, or `run`:

| Tool | Sections (first is normal) |
| --- | --- |
| `deus_dexter_issue_read` | summary, metadata, body, notes |
| `deus_dexter_mr_read` | summary, metadata, body, reviews, notes |
| `deus_dexter_wiki_read` | summary, metadata, body |
| `deus_dexter_run_read` | metadata, assignment, system, transcript, stderr |

Responses: `{id,section,text,revision,nextCursor}`. Normally limit 2048 UTF-8 bytes (4–16384). Null cursor starts; null nextCursor ends. Continue the same artifact/section. Path-free cursors expire on reload and reject changes. Summary includes metadata/body, not history. Run assignment/system are separate prompts; transcript is stdout, not Pi session data. Missing payloads error.

Readers access local Forge files (≤64 MiB/file/history); ordinary read-only inspection remains available.

`deus_dexter_issues_live`/`issues_plan({workspace,cursor,limit})`: normally null/20, ≤8 KiB/page; records/total/revision/nextCursor. Changes invalidate cursors. Live: readiness/claims/blockers; plans: classifications/actions. Never edits Forge. Initialization, drain, directives, request answers/denials, config, doctor are unexposed.

`deus_dexter_bots_live({workspace})`: working SQLite `runs`, including stale owners, issue targets, PID/heartbeat liveness; ≤16 KiB. Ownership is not progress; reservations/throttling are unobservable. Board claims reflect working leases.

`deus_dexter_events_read({workspace,cursor,limit})`: newest-first SQLite notification summaries, no bodies; normally null/20; max 100 records/8 KiB. Backward continuation survives appends; cursors expire on reload.

`DEXTER_BIN` overrides `dexter` on PATH. Pin comma-separated, full `DEUS_DEXTER_TRUSTED_FINGERPRINTS`. `git verify-commit` checks the executable's checkout; verified signer/commit yield `dexter-signed`. Unknown profile blocks all mutations, not reads. Signature verification runs before each mutation; installed public keys avoid keyserver dependence. CLI mutations have no automatic deadline; explicit cancellation remains available.

Independently verify the signer—not merely repository output:

```sh
git -C /path/to/dexter log --show-signature -1
curl -sL https://github.com/web-flow.gpg | gpg --show-keys
export DEUS_DEXTER_TRUSTED_FINGERPRINTS=968479A1AFF927E37D1A566BB5690EEEBB952194
```

The web-flow key covers GitHub-signed merges; independently verify other signers. Never use short IDs.

`deus_dexter_metrics({workspace,since,until,utcOffsetMinutes})`: ≤7 days/8 KiB; exclusive end, fixed offset (180 = +03:00), no DST. Daily run-start cohorts: totals/observed roles, collection-start outcome cutoff; reviews separate. `dayClosed`: calendar ended; collection nontransactional. Terminal duration: `updated_at - started_at`; sampled prompt counters, unsampled sums null. Cancelled counts failed; `failure_reason: timed_out` marks timeouts. Invalid/unavailable sources error. No delivery, context, CPU, liveness, or acceptance attribution.

### Public web research

`web-research` uses host web tools. Never send private text or credentials to public sources.

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
