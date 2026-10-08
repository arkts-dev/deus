# MCP

Adapted from [PR #15](https://github.com/arkts-dev/deus/pull/15). Pi and MCP share current handlers; [API/trust contracts](../README.md#dexter-cli) remain unchanged.

## Setup

```sh
npm ci --ignore-scripts
npm run build
npm pack
npm install --prefix /opt/deus-mcp --ignore-scripts ./deus-ex-machina-0.3.0.tgz
```

Codex:

```toml
[mcp_servers.deus]
command = "/opt/deus-mcp/node_modules/.bin/deus-mcp"
args = ["--workspace", "/absolute/existing/workspace"]
tool_timeout_sec = 3600
```

For SSH, replace command/args with:

```toml
command = "ssh"
args = ["-T", "-o", "BatchMode=yes", "dexter-host", "/opt/deus-mcp/start"]
```

The operator-owned launcher configures server-side PATH, Dexter/signing trust and research credentials, then `exec`s the command above. Verify SSH host keys. Stdio only; no workspace initialization or drain.

## MCP additions

- `deus_workspace_info`: canonical workspace and skills.
- `deus_skill_read({name})`: integrity-checked original workflow.
- `deus_artifact_list({path,offset})`: 200 entries/page; initially offset 0.
- `deus_artifact_read({path,offset,maxBytes})`: UTF-8, ≤64 MiB/file; normally offset 0/maxBytes 4096; max 256,000. Redacted offsets/digest.
- `deus_artifact_write({path,content})`: create-only Markdown research/handoffs under `.deus/`; required front matter. Designs use design tools.

Workspace arguments must match the canonical server root; paths are server-relative. Extra properties, traversal, links and special files are rejected. Generic artifacts exclude Forge, bus, Git, node_modules, `.env*` and Dexter configuration; dedicated readers retain their guards.

Calls serialize per connection. Cancellation/disconnect abort foreground processes; interrupted mutations may have happened—inspect, never replay. No durable jobs or cross-process locking; cursors expire with the server. Trusted workspace owner/OS account required, not a hostile-filesystem sandbox.

## Checks

Normal [development checks](../README.md#development) include MCP schema/trust/path tests, cancellation/disconnect fixtures and installed stdio smoke. SSH, interactive Codex, paid models and live remote mutations remain unverified; PR #15's historical results are not evidence here.
