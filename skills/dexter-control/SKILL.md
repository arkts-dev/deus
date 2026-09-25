---
name: dexter-control
description: Coordinate the verified native Dexter CLI through Deus tools.
---

# Dexter control

Dexter owns implementation planning, work assignment, review, and integration. Start by calling `deus_dexter_probe`. Its version and help fingerprints determine whether the installed executable matches the sole supported profile. If the profile is unknown, use the diagnostics to explain the mismatch and do not run a workspace command. A recognized profile permits one command through `deus_dexter_exec` with an exact `command`, string `args`, and an absolute `workspace`. Deus supplies workspace binding as argv; `init` takes the workspace positionally. Never build a shell command or retry a failed, cancelled, or uncertain mutation automatically.

The native `dexter-3fb8d375` profile is pinned to `arkts-dev/dexter` commit `3fb8d3753d57dbb28affd540b99b45ba9097e15f`. It resolves `dexter` on `PATH` unless `DEXTER_BIN` names a different executable. The separate `dexter-web` server and `config` command are outside this integration. Commands such as `run`, `submit`, and `cmd` can change state; `doctor` can contact providers; even inspection commands can initialize local layout. Consult probe diagnostics and command help before action.

Use the pinned `deus_dexter_*` tools for Dexter control operations. The existing `deus_board_*` tools are the explicit product-control exception: snapshot and plan read `forge/**`, and close performs one approval-gated raw edit. Do not read, parse, or edit Dexter-owned state outside these tools. If the CLI lacks another required operation, report the gap and leave Dexter state unchanged. Direct product artifact inspection remains available for acceptance.

Ground any handoff in the user's desired result, source authority, scope, exclusions, and observable acceptance. A board state or worker exit does not prove the product works: inspect the resulting files and run proportionate checks. If output is ambiguous, inspect live state before deciding what to do next. Ask the user to decide a new product behavior, publication, or expansion of external access.

For a durable handoff, create `.deus/handoffs/<slug>.md` with YAML front matter: `kind: handoff`, lowercase `id`, ISO `created_at` and `updated_at`, `status`, list `references`, string `design_ref`, string `objective`, list `scope`, list `exclusions`, and list `acceptance`. Put the full product requirements in the body. Keep credentials, absolute paths, logs, executable paths, and private replay state out of tracked artifacts.

When the user authorizes submission, read the agreed handoff and pass its complete product text as `submit` arguments `[title, '--body', body]`, with the absolute workspace supplied separately to `deus_dexter_exec`. Dexter does not automatically read it from the Markdown file. After submission, verify from live evidence that the intended objective was received and later satisfied. An exit code alone cannot establish that outcome.
