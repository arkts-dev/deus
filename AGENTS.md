# Deus

Deus 0.3 is a TypeScript Pi package. Dexter owns engineering design, decomposition, execution, review, and integration. Deus supplies product contracts, research, handoffs, and evidence-based acceptance. Code/docs: English.

## Layout

- `src/`: extensions, GitHub executable/argv adapter, immutable archive readers, research, and evidence guards.
- `prompts/kernel.md`: minimal system prompt.
- `skills/`: lazy-discovered Pi skills; never copy into managed repositories.
- `.agents/skills/`: contributor workflows.
- `tests/`: deterministic contract tests.
- `scripts/`: integrity, build, and installed-package smoke.

## Verification

Require Node >=22.19, npm, Git. Run `npm ci --ignore-scripts`, `npm run check`, `npm run skills:verify`, `npm run format:check`, `npm run test:package`. `npm pack --dry-run --ignore-scripts --json` must contain only runtime dist, skills, prompt, ownership digests, README, manifest, license, and notices. Commit generated `dist/` and verify a clean rebuild with `git diff --exit-code -- dist`. Distinguish native GitHub evidence from fixtures. Do not publish, deploy, or change external accounts during local checks.

## Hard cutover

Every replaced contract is a hard cutover. Remove superseded code, tests, fixtures, documentation, payload, and configuration together. Never retain legacy callbacks, aliases, deprecated names, wrapper routes, fallback executables, dual-read configuration, old environment variables, compatibility parsing, feature flags, or parallel behavior. Never silently migrate, replay, or reinterpret operational state. A requested, explicitly designed one-shot migration must not introduce continuing compatibility. Historical provenance may retain factual old names, never behavior.

## Runtime boundaries

Deus and Dexter coordinate only through GitHub. Use installed `gh` with exact argv and existing authentication. `DEUS_GITHUB_REPOSITORIES` is the installation allowlist. Never invoke Dexter CLI, Temporal RPC, or local engineering storage. Do not add compatibility routes or callbacks.

Typed product tools submit objectives/tasks, answer immutable questions, read engineering records and private archives, and record independent product acceptance. Dexter owns engineering closure. Read-only operations are allowed as usual. Preserve bounded redacted receipts, section-bound cursors, cancellation, and access checks. Never retry failed mutations automatically. Inspect GitHub after an uncertain result.

MCP binds product artifact paths to one absolute workspace. GitHub tools use repository identity independently of that path. Preserve schema validation, serialization, cancellation, and disconnect behavior.

Web research is foreground and isolated from projects and Dexter. Preserve DNS/redirect guards, bounded requests, source receipts, and separate evidence, inference, and gaps. Local research uses host filesystem access. Unless explicitly requested elsewhere, skills write only tracked Markdown under `.deus/design/`, `.deus/research/`, and `.deus/handoffs/`, with required YAML and no credentials, absolute paths, live logs, or private state.

## Provenance

Packaged skills are original Deus texts. Maintain `skills.lock.json` digests using `.agents/skills/maintain-governance-resources/SKILL.md`. The former manager grant/journal model was removed in 0.3.
