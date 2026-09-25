---
name: change-cli-profile
description: Replace the single pinned Dexter CLI profile using real executable help and argv evidence.
---

Read `AGENTS.md`, `src/dexter-profile.ts`, `src/dexter.ts`, and the focused adapter tests. Inspect the exact installed Dexter revision and actual version and help output for every exposed command. Source inspection is needed when help cannot establish a command's mutation effect. Replace fingerprints and command mapping together. The current native `dexter-3fb8d375` profile is pinned to `arkts-dev/dexter` commit `3fb8d3753d57dbb28affd540b99b45ba9097e15f`; replace it from real Dexter evidence without retaining a compatibility branch.

Keep executable plus argv dispatch, explicit absolute workspace binding, raw diagnostics, and no automatic retry after errors, timeouts, or nonzero results. Classify read commands narrowly; commands that can start workers, services, or change state require the recognized profile. Test all command argv forms, `init` positional workspace, unknown-profile mutation block, wrong workspace, shell metacharacters, and uncertain results. Run `npm run check`, `npm run skills:verify`, and installed-package smoke with real Node. Never modify Dexter as part of a Deus mapping update.
