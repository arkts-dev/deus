---
name: dexter-control
description: Coordinate product contracts and engineering evidence through GitHub.
---

# GitHub coordination

Dexter owns engineering planning, implementation, review, verification, and integration. Deus uses GitHub as an independent actor. Configure `DEUS_GITHUB_REPOSITORIES` with permitted product and archive repositories. Existing `gh` authentication supplies the actor. Read-only operations are allowed as usual.

Use `deus_github_submit` for an explicitly authorized objective or task. The tool supplies `dexter:ready` and exactly one kind label. Pass the complete product text as the `body`. Dexter does not automatically read it from a local Markdown file. Use `deus_github_read` to verify receipt, decisions, reviews, pull requests, and engineering closure.

Use `deus_github_answer` for a question with its exact immutable `inputKey` and `decisionKey`. Dexter accepts only configured GitHub actors. A changed input needs a new decision. Never override an engineering verdict or bypass CI and branch rules.

Use `deus_github_archive_read` with a private archive repository, immutable commit, and manifest or object path. Follow section-bound cursors with the same arguments. Cursors reject changed content and expire on reload. No tool reads Dexter local storage or calls Dexter or Temporal.

Mutation receipts distinguish rejected, completed, and outcome_unknown. Never retry failed mutations automatically. Inspect GitHub after timeout, cancellation, or failure. If an operation is unavailable, report the gap and leave state unchanged.

Ground the handoff in the user's objective, source authority, scope, exclusions, and observable acceptance. Create `.deus/handoffs/<slug>.md` with YAML fields `kind: handoff`, `id`, `created_at`, `updated_at`, `status`, `references`, `design_ref`, `objective`, `scope`, `exclusions`, and `acceptance`. Keep credentials, absolute paths, logs, and private state out of tracked artifacts.

After engineering closure, independently inspect the delivered source and tests. Use `deus_github_product_accept` to record a separate product decision and evidence at the exact revision. Engineering completion alone does not establish product acceptance.
