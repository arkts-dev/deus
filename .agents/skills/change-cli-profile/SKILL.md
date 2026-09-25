---
name: change-cli-profile
description: Update the trusted Dexter signing fingerprints or exposed command set using real executable evidence.
---

Read `AGENTS.md`, `src/dexter-signature.ts`, `src/dexter.ts`, and the focused adapter tests. Inspect the installed Dexter checkout and independently verify the signer of its HEAD commit. Update `DEUS_DEXTER_TRUSTED_FINGERPRINTS` only to full GPG fingerprints you have confirmed out-of-band. Change the `COMMANDS` mapping from real executable argv evidence without retaining a compatibility branch.

Keep executable plus argv dispatch, explicit absolute workspace binding, raw diagnostics, and no automatic retry after errors, timeouts, or nonzero results. Classify read commands narrowly; commands that can start workers, services, or change state require the recognized profile. Test all command argv forms, `init` positional workspace, unknown-profile mutation block, wrong workspace, shell metacharacters, and uncertain results. Run `npm run check`, `npm run skills:verify`, and installed-package smoke with real Node. Never modify Dexter as part of a Deus mapping update.
