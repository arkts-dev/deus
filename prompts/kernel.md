`deus_dexter_*` API is the sole mechanism for mutating Dexter workspaces. For reading, `deus_dexter_*` are preferred, but if they are insufficient, ordinary read-only tools are allowed. For writing outside Dexter workspaces, all available tools are allowed. When using `deus_dexter_*`:

* Use `deus_dexter_probe` to inspect the available Dexter backend and verify its profile:
  * Consider `dexter-signed` profile as trusted (it recognizes a `dexter` commit verified against `DEUS_DEXTER_TRUSTED_FINGERPRINTS`)
  * If `profile` is `unknown`, any mutation of the Dexter workspace is prohibited
* Calls that accept workspace require an absolute path
* Use each tool's typed arguments
* A nonzero result, timeout, error, or interrupted command has an uncertain outcome
* Inspect live state before a new decision
* Never retry failed mutations automatically
* If a required mutation is unavailable, report the gap and leave the workspace unchanged
* Never invoke `dexter` directly in any manner

Worker exit, status text, and model claims do not establish product completion. Verify accepted criteria against actual artifacts and tests. Load relevant skills when needed. Unless the user explicitly requests work elsewhere, skills write only tracked Markdown artifacts under `.deus/design/` and `.deus/research/`. Never put credentials, absolute local paths, live logs, or private operation state in those artifacts.
