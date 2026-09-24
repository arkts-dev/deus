# Deus

Deus 0.3 is an installable TypeScript Pi plugin package. Dexter alone supervises engineering design, decomposition, task execution, review, and integration. Deus contributes product contracts, research, handoffs, and evidence-based acceptance. Project code and docs are English.

## Layout

- `src/`: Pi extension, pinned Dexter executable/argv adapter, foreground public web research, process and evidence guards.
- `prompts/kernel.md`: minimal plugin system prompt.
- `skills/`: five lazy-discovered Pi skills; do not copy them into managed product repositories.
- `.agents/skills/`: contributor workflows for this repository.
- `tests/`: deterministic plugin and CLI contract tests.
- `scripts/`: skill integrity, clean build, and installed-package smoke.

## Build and verification

Use Node >=22.19, npm, and Git. Run `npm ci --ignore-scripts`, `npm run check`, `npm run skills:verify`, `npm run format:check`, and `npm run test:package`. `npm pack --dry-run --ignore-scripts --json` must contain only the runtime dist, skills, minimal prompt, ownership digests, README, manifest, license, and notices. Commit the generated `dist/` output and verify a clean rebuild with `git diff --exit-code -- dist`. Tests using the pinned CLI must distinguish executable evidence from fixtures. Do not publish, deploy, or change external account settings during local checks.

## No legacy compatibility

Every replaced project contract is a hard cutover. Do not retain or introduce legacy callbacks, aliases, deprecated tool names, wrapper routes, fallback executables, dual-read configuration, old environment variables, compatibility parsing, feature flags, or parallel behavior for a superseded interface. Remove its code, tests, fixtures, documentation, package payload, and configuration in the same change. Do not silently migrate, replay, or reinterpret old operational state. If a one-shot data migration is genuinely required, it must be explicitly designed and requested; it must not create a continuing compatibility path. Historical provenance may retain factual old names, but never behavior.

An upstream system may temporarily retain its current actual executable name only when a direct, pinned bridge is explicitly documented here. This is an executable-identity bridge, not a legacy fallback: it invokes the upstream executable directly and must not restore any former Deus-facing API, callback, alias, fallback configuration, or duplicate dispatch route.

## Runtime boundaries

Every Dexter call uses executable plus argv, never shell interpolation. `DEXTER_BIN` is the only executable override; when unset, the temporary private bridge resolves the literal `arkestr` executable on `PATH`. Never read or honor a legacy-named environment override. Match pinned version and help fingerprints before mutation; an unknown profile may return raw read evidence but must block mutation. Pass an absolute workspace every time. `init` uses its positional workspace; other commands use `--dir`. Never automatically retry an error, timeout, or nonzero result. A successful worker exit, board status, or model statement is not product completion; verify actual artifacts and accepted criteria.

## Dexter transition invariant

Until the upstream executable is actually renamed, Arkestr remains the supported engineering executor and must continue to work through the current `deus_dexter_*` tools. The private Dexter bridge invokes that executable directly; it is not a deprecated callback path. Do not add legacy callbacks, aliases, compatibility shims, alternate dispatch paths, or duplicate tools for former `deus_arkestr_*`, `ARKESTR_BIN`, or `arkestr-control` names. Outside immutable provenance, the only permitted Arkestr uses are the direct bridge implementation and truthful documentation or tests of that bridge. Replace that bridge only after inspecting and fingerprinting a real native Dexter CLI.

Web research is foreground and isolated from project files and Dexter. Retain public DNS and redirect guards, bounded requests, source receipts, and separate evidence, inference, and gaps. Local research uses the host agent's filesystem access. Skills directly write only tracked Markdown artifacts under `.deus/design/`, `.deus/research/`, and `.deus/handoffs/` absent an explicit request elsewhere. Artifacts must have required YAML front matter and must omit credentials, executable and absolute workspace paths, live logs, and private operation state.

## Dependency and provenance

Support exactly one inspected pinned Dexter CLI profile at a time. The current `dexter-bridge-b53f384` profile is temporary legacy-binary evidence, not a verified native Dexter profile. Replace its mapping and fingerprints from real Dexter evidence when Dexter becomes available; remove the bridge rather than adding compatibility shims. The five packaged skills are original Deus texts; keep their digests in `skills.lock.json` and use `.agents/skills/maintain-governance-resources/SKILL.md` for updates. The former manager grant and journal model was intentionally removed in 0.3.
