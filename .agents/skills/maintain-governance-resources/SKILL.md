---
name: maintain-governance-resources
description: Maintain the original Deus Pi skills and their integrity records.
---

Read the affected skill, `skills.lock.json`, `scripts/sync-skills.mjs`, and the relevant product contract before editing. Keep every skill discoverable through the Pi package. Write original English text for Deus; do not copy material from another repository without a compatible license and a deliberate attribution update.

Preserve the user mandate, product scope, observable acceptance, public research isolation, and the signature-verifying executable/argv bridge. Skill-directed persistent writes stay under `.deus/**` unless the user explicitly chooses another location. Avoid credentials, absolute workspace paths, live logs, and private operation state in those artifacts. Do not introduce a second execution route or automatic retry of uncertain mutations.

After review, run `node scripts/sync-skills.mjs --update`, `npm run skills:verify`, relevant behavior checks, and `npm run test:package`. This process refreshes only local content digests.
