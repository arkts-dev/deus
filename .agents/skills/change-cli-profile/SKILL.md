---
name: change-cli-profile
description: Replace the single pinned Dexter CLI profile using real executable help and argv evidence.
---

Read `AGENTS.md`, `src/dexter-profile.ts`, `src/dexter.ts`, and the focused adapter tests. Inspect the exact installed Dexter revision and actual version and help output for every exposed command. Source inspection is needed when help cannot establish a command's mutation effect. Replace fingerprints and command mapping together. The temporary `dexter-bridge-b53f384` profile is legacy-binary evidence; replace it from real Dexter evidence rather than treating it as a native profile or compatibility branch.

Keep executable plus argv dispatch, explicit absolute workspace binding, raw diagnostics, and no automatic retry after errors, timeouts, or nonzero results. Classify read commands narrowly; commands that can start workers, services, or change state require the recognized profile. Test all command argv forms, `init` positional workspace, unknown-profile mutation block, wrong workspace, shell metacharacters, and uncertain results. Run `npm run check`, `npm run skills:verify`, and installed-package smoke with real Node. Never modify Dexter as part of a Deus mapping update.
