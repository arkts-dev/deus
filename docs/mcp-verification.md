# MCP adaptation verification

Date: 2026-10-05. Upstream Deus base: `1c2e02a` (main). The adaptation is local;
no upstream release, production deployment or account configuration was changed.

## Implemented

- A `deus-mcp --workspace <absolute-directory>` stdio entry point, including SSH transport.
- Shared handlers for all eight original tools; the three Pi extensions remain loadable.
- Original six skills exposed on demand through MCP, without changing their text or digests.
- Workspace identification and bounded remote artifact listing, reading and report/handoff writing.
- Schema validation, workspace binding, path checks, cancellation and no automatic replay.
- Write-once design documents now use exclusive file creation to prevent concurrent overwrites.

## Results

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Unit / MCP integration suite | 31 passed, 0 failed, 0 skipped (24 original + 7 MCP tests) |
| Original skill integrity | All 6 passed; original contents unchanged |
| Prettier | Passed |
| Clean installed npm package | Passed; original Pi entry points and installed `deus-mcp` executable exercised |
| Docker + real SSH + MCP SDK client | Passed |
| Supplied real Dexter CLI | init, submit, show, status, board snapshot/plan and help for all 16 commands passed |
| Signature enforcement | Real GPG verification of a test-signed source snapshot passed; an unsigned revision blocked a subsequent mutation |
| Disconnect | A separately labeled signed fake process was terminated once; no automatic replay |
| Reconnect | Submitted issue and saved report remained readable |
| Codex configuration parser | codex-cli 0.153.4 accepted the documented SSH configuration using command-line overrides only |

The real Dexter source was extracted from the user's `dexter-fork-main.zip`.
Its SHA-256 is `43d88628bb6c27750c7076096985dae13387df730ac41809d4cb32bc520c2fd7`.
It reports `dexter 0.1.0`. The ZIP has no Git history. The test therefore created
and signed a new snapshot with an ephemeral test identity. This is evidence of
working signature enforcement and CLI compatibility, not an upstream signature.
The only GPG test shim redirects key acquisition to the generated public key;
actual signature verification uses real Git and GPG. It is confined to the test
container and is not in the runtime npm package.

Machine-readable summaries: [SSH integration](mcp-remote-test.json) and
[installed package](mcp-package-test.json). Reproduction commands and server/Codex
configuration are in [README](../README.md#codex-and-remote-dexter-mcp-adaptation).

## Limits

- No paid model worker run or live external web-research session was performed.
  Web research retains its original engine and guards; the explicit no-model result
  was verified. Its provider credentials must be configured on the server.
- An interactive Codex model session was not used as the integration driver. The
  actual transport was exercised by the official MCP SDK client, and Codex's own
  CLI validated its configuration.
- All commands remain foreground. A durable job service, restart recovery of active
  work and cross-connection mutation deduplication are not implemented. After an
  interrupted mutation, inspect current Dexter state before issuing another one.
- Remote artifact writes create new reports/handoffs only. Existing Pi filesystem
  workflows are unchanged; use a new report when reviewing remotely.
- Linux was tested. The SSH server ran in a disposable Debian container with Node 22;
  host tests used Node 24. No production server was contacted.
- The original Pi dependency tree retains three npm audit findings (Pi/undici and
  brace-expansion). The new SDK's ajv dependency was updated within its allowed
  range; upgrading the original Pi runtime is outside this adaptation.

All test containers and temporary test keys were removed. The downloaded source
archives were read without modification.
