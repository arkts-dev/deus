# MCP interface

Run `deus-mcp --workspace /absolute/product/path`. The server exposes the Pi tool contracts through the maintained MCP SDK. Set `DEUS_GITHUB_REPOSITORIES` on the server and preserve its existing `gh` login.

GitHub tools use explicit repository identities. They submit one objective or task, answer an immutable question, read issue or pull-request records, read private archive objects at immutable commits, and record independent product acceptance. They do not call Dexter CLI or Temporal.

Product artifact tools bind paths to the selected workspace. They reject traversal, symlinks, private runtime state, credentials, and invalid UTF-8. Report and handoff writes create new files under `.deus/` and never overwrite. Design tools retain their separate contract.

All calls are foreground operations. The server serializes calls and cancels processes on cancellation or disconnect. An interrupted external mutation has an uncertain outcome. Inspect GitHub before another decision. Never replay it automatically.

Read `deus_workspace_info` and `deus_skill_read` for product workflows. GitHub readers redact before byte pagination. Cursors expire when the process restarts and reject changed sections or content. Execution archives remain private and use immutable Git commit references.
