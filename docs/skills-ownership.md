# Skill ownership and integrity

The five Pi skills under `skills/` are original Deus documents written for this release. The Apache-2.0 license in the repository covers them. The `skills.lock.json` file records each packaged path, its ownership marker, and the SHA-256 digest used by build-time and runtime integrity checks.

To change a skill, edit its Markdown source, inspect the resulting behavior contract, run `node scripts/sync-skills.mjs --update`, and then run `npm run skills:verify` and the installed package smoke. The update command only computes hashes of local files; it does not fetch external text.
