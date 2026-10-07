# Deus

Deus 0.3 is an installable TypeScript Pi package. Dexter alone supervises engineering design, decomposition, execution, review, and integration. Deus supplies product contracts, research, handoffs, and evidence-based acceptance. Project code and docs are English.

## Layout

- `src/`: extensions, verified executable/argv adapter, local readers, research, and evidence guards.
- `prompts/kernel.md`: minimal system prompt.
- `skills/`: lazy-discovered Pi skills; never copy into managed repositories.
- `.agents/skills/`: contributor workflows.
- `tests/`: deterministic contract tests.
- `scripts/`: integrity, build, and installed-package smoke.

## Verification

Use Node >=22.19, npm, and Git. Run `npm ci --ignore-scripts`, `npm run check`, `npm run skills:verify`, `npm run format:check`, and `npm run test:package`. `npm pack --dry-run --ignore-scripts --json` must contain only runtime dist, skills, prompt, ownership digests, README, manifest, license, and notices. Commit generated `dist/` and verify a clean rebuild with `git diff --exit-code -- dist`. Distinguish signed-CLI evidence from fixtures. Do not publish, deploy, or change external accounts during local checks.

## Hard cutover

Every replaced contract is a hard cutover. Remove superseded code, tests, fixtures, documentation, payload, and configuration together. Never retain legacy callbacks, aliases, deprecated names, wrapper routes, fallback executables, dual-read configuration, old environment variables, compatibility parsing, feature flags, or parallel behavior. Never silently migrate, replay, or reinterpret operational state. A requested, explicitly designed one-shot migration must not introduce continuing compatibility. Historical provenance may retain factual old names, never behavior.

## Runtime boundaries

Dexter mutations use `deus_dexter_*` tools exclusively. CLI calls use executable plus exact argv, never shell interpolation. `DEXTER_BIN` alone overrides the default `dexter` lookup on `PATH`. Verify a trusted commit signature against `DEUS_DEXTER_TRUSTED_FINGERPRINTS` before every mutation, including direct issue closure. Unknown profile blocks all workspace mutations, not reads. Workspace arguments must be absolute; the private CLI adapter supplies `--dir`. Never automatically retry failed mutations. Nonzero exits, errors, timeouts, and interruptions have uncertain outcomes: inspect live state before another decision. Worker exits, board statuses, and model claims do not prove product completion; verify artifacts against accepted criteria.

Read-only operations are allowed as usual, including Forge records, transcripts, and ID discovery. Prefer artifact readers; ordinary read-only tools remain available when insufficient. Never mutate Dexter-owned state outside Deus APIs. If a required mutation is unavailable, report the gap and leave state unchanged.

## Native profile

The recognized profile is `dexter-signed`. Trust only verified commits from the native checkout; independently verify the signer's key before changing fingerprints. Expose six typed CLI mutations and four sectioned, cursor-based readers, never generic execution/output retrieval. The current CLI lacks structured pagination and run reads: readers use persisted local Forge files. No remote transport or discovery service. Cursors are path-free, section-bound, reload-expiring, and content-sensitive; content is bounded and redacted before paging. Shared mutation receipts distinguish rejected, completed, and outcome_unknown; diagnostics are bounded without killing commands.

`deus_dexter_issues_live` and `deus_dexter_issues_plan` read Forge directly; planning never mutates. `deus_dexter_issue_close` permits one approved, trusted, guarded closure. Migrate these adapters separately when equivalent CLI capabilities exist. Initialization, drain execution, free-form directives, request answers/denials, config, and dexter-web are outside this integration.

Web research is foreground and isolated from projects and Dexter. Preserve DNS/redirect guards, bounded requests, source receipts, and separate evidence, inference, and gaps. Local research uses host filesystem access. Unless explicitly requested elsewhere, skills write only tracked Markdown under `.deus/design/`, `.deus/research/`, and `.deus/handoffs/`, with required YAML and no credentials, absolute paths, live logs, or private state.

## Provenance

Packaged skills are original Deus texts. Maintain `skills.lock.json` digests using `.agents/skills/maintain-governance-resources/SKILL.md`. The former manager grant/journal model was removed in 0.3.
