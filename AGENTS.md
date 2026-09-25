# Deus

Deus 0.3 is an installable TypeScript Pi plugin package. Dexter alone supervises engineering design, decomposition, task execution, review, and integration. Deus contributes product contracts, research, handoffs, and evidence-based acceptance. Project code and docs are English.

## Layout

- `src/`: Pi extensions for the Dexter bridge, designer checks, and board control, plus the pinned Dexter executable/argv adapter, foreground public web research, and process and evidence guards.
- `prompts/kernel.md`: minimal plugin system prompt.
- `skills/`: lazy-discovered Pi skills; do not copy them into managed product repositories.
- `.agents/skills/`: contributor workflows for this repository.
- `tests/`: deterministic plugin and CLI contract tests.
- `scripts/`: skill integrity, clean build, and installed-package smoke.

## Build and verification

Use Node >=22.19, npm, and Git. Run `npm ci --ignore-scripts`, `npm run check`, `npm run skills:verify`, `npm run format:check`, and `npm run test:package`. `npm pack --dry-run --ignore-scripts --json` must contain only the runtime dist, skills, minimal prompt, ownership digests, README, manifest, license, and notices. Commit the generated `dist/` output and verify a clean rebuild with `git diff --exit-code -- dist`. Tests using the pinned CLI must distinguish executable evidence from fixtures. Do not publish, deploy, or change external account settings during local checks.

## No legacy compatibility

Every replaced project contract is a hard cutover. Do not retain or introduce legacy callbacks, aliases, deprecated tool names, wrapper routes, fallback executables, dual-read configuration, old environment variables, compatibility parsing, feature flags, or parallel behavior for a superseded interface. Remove its code, tests, fixtures, documentation, package payload, and configuration in the same change. Do not silently migrate, replay, or reinterpret old operational state. If a one-shot data migration is genuinely required, it must be explicitly designed and requested; it must not create a continuing compatibility path. Historical provenance may retain factual old names, but never behavior.

## Runtime boundaries

Every Dexter call uses executable plus argv, never shell interpolation. `DEXTER_BIN` is the only executable override; when unset, the plugin resolves the literal `dexter` executable on `PATH`. Never read or honor a legacy-named environment override. Match pinned version and help fingerprints before every workspace command; an unknown profile may return only raw probe diagnostics. Pass an absolute workspace every time. `init` uses its positional workspace; other commands use `--dir`. Never automatically retry an error, timeout, or nonzero result. A successful worker exit, board status, or model statement is not product completion; verify actual artifacts and accepted criteria.

Route Dexter control operations through the verified `deus_dexter_*` tools. The existing `deus_board_*` product-control tools are a temporary, explicit exception: snapshot and plan read `forge/**`, and close performs one approval-gated raw edit. Do not read, parse, or edit Dexter-owned state outside these tools. If the CLI lacks another required operation, report the gap and leave Dexter state unchanged. Migrate the board tools to the CLI separately when it exposes equivalent board data and issue closure. Direct product artifact inspection remains available for acceptance. Deus-owned `.deus/` Markdown artifacts follow the separate write rules below.

## Native Dexter profile

Use the native `dexter` executable pinned to `arkts-dev/dexter` commit `3fb8d3753d57dbb28affd540b99b45ba9097e15f`. Do not add legacy callbacks, aliases, compatibility shims, alternate executables, or duplicate dispatch paths. The 16 exposed commands exclude `config` and the separate `dexter-web` server.

Web research is foreground and isolated from project files and Dexter. Retain public DNS and redirect guards, bounded requests, source receipts, and separate evidence, inference, and gaps. Local research uses the host agent's filesystem access. Skills directly write only tracked Markdown artifacts under `.deus/design/`, `.deus/research/`, and `.deus/handoffs/` absent an explicit request elsewhere. Artifacts must have required YAML front matter and must omit credentials, executable and absolute workspace paths, live logs, and private operation state.

## Dependency and provenance

Support exactly one inspected pinned Dexter CLI profile at a time. The current native profile is `dexter-3fb8d375`. Replace its mapping and fingerprints together only after inspecting real Dexter version, help, and argv evidence. The packaged skills are original Deus texts; keep their digests in `skills.lock.json` and use `.agents/skills/maintain-governance-resources/SKILL.md` for updates. The former manager grant and journal model was intentionally removed in 0.3.
