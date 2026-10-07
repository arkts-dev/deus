---
name: dexter-control
description: Coordinate the verified native Dexter CLI through Deus tools.
---

# Dexter control

Dexter owns implementation planning, work assignment, review, and integration. Before any Dexter workspace mutation, including guarded direct issue closure, call `deus_dexter_probe`; an unknown profile blocks all mutations, not read-only inspection. Use typed tools with an absolute workspace: `deus_dexter_submit`, `deus_dexter_issue_create`, `deus_dexter_issue_nudge`, `deus_dexter_issue_reprioritize`, `deus_dexter_issue_relink`, and `deus_dexter_architecture_accept`. Deus supplies executable plus argv internally. Never invoke Dexter through a shell or retry a failed, cancelled, or uncertain mutation automatically.

The `dexter-signed` profile recognizes a Dexter commit whose GPG signature matches `DEUS_DEXTER_TRUSTED_FINGERPRINTS`; the CLI resolves on `PATH` unless `DEXTER_BIN` names a different executable. Verify the full 40-character signer fingerprint out-of-band. Initialization, drain execution, free-form directives, request answers/denials, doctor, config, and dexter-web are not exposed. Mutation receipts distinguish rejected-before-execution, completed, and outcome_unknown; inspect live state after uncertainty.

Use `deus_dexter_issue_read`, `deus_dexter_mr_read`, `deus_dexter_wiki_read`, and `deus_dexter_run_read` for bounded sections. Readers default to metadata/body (run: metadata), never history. Request notes, reviews, assignment, or transcript explicitly; follow nextCursor with the same artifact and section. limit counts UTF-8 content bytes. Cursors expire on reload and reject changed content. Readers currently use local persisted Forge artifacts, not CLI display-text parsing or a remote service.

Use `deus_dexter_*` tools for all Dexter mutations. `deus_dexter_issues_live` reads the frontier; `deus_dexter_issues_plan` proposes scheduling and guarded closures without mutation; `deus_dexter_issue_close` performs one approval-gated raw edit. Read-only operations are allowed as usual, including Forge files and run transcripts for inspection and discovery. Never mutate Dexter state outside these tools. If a required mutation is unavailable, report the gap and leave Dexter state unchanged. Direct product artifact inspection remains available for acceptance.

Ground any handoff in the user's desired result, source authority, scope, exclusions, and observable acceptance. A board state or worker exit does not prove the product works: inspect the resulting files and run proportionate checks. If output is ambiguous, inspect live state before deciding what to do next. Ask the user to decide a new product behavior, publication, or expansion of external access.

For a durable handoff, create `.deus/handoffs/<slug>.md` with YAML front matter: `kind: handoff`, lowercase `id`, ISO `created_at` and `updated_at`, `status`, list `references`, string `design_ref`, string `objective`, list `scope`, list `exclusions`, and list `acceptance`. Put the full product requirements in the body. Keep credentials, absolute paths, logs, executable paths, and private replay state out of tracked artifacts.

When the user authorizes submission, read the agreed handoff and pass its complete product text as the `body` of `deus_dexter_submit({workspace, title, body})`. Dexter does not automatically read it from the Markdown file. After submission, verify from live evidence that the intended objective was received and later satisfied. An exit code alone cannot establish that outcome.
