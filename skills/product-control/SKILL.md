---
name: product-control
description: Keep a Dexter workspace saturated with PRODUCT work without rewriting the forge.
---

# Product control

An issue is PRODUCT if finishing it changes observable behavior: a specification rule, a runtime or backend behavior, a conformance test that fails now and passes later, or an interface another PRODUCT issue consumes. Everything else is NOISE: counters, percentages, coverage, readiness verdicts, evidence, gates, audits, provenance, release bureaucracy. DEAD means canonical state already proves it or a named successor owns it. Never close PRODUCT; saturation is a scheduling measurement, never product completion.

Call `deus_board_snapshot` for the typed graph, frontier, claims, and blockers, then call `deus_board_plan`, which classifies against the live root objective and returns objective-term evidence for every PRODUCT classification. The detector's hits are evidence, not the definition: NOISE means finishing the issue changes no observable behavior, and you must confirm that against the definition before proposing a close. Anything not proven noise is retained as PRODUCT. Mutate existing work only, through `deus_dexter_exec`, one exact command at a time: `nudge-issue`, `relink-issue` removing dependencies, `reprioritize-issue`, or a single exact reopen directive in `cmd`. Never add a dependency; it lengthens the critical path and belongs to the product owner. Never create work with `submit` or `issue`, and never run `accept-architecture` autonomously; those change product scope or override review and require an explicit user instruction. Close NOISE only, and only when the plan proves a leaf with no claim, workdir, merge request, or open child, by calling `deus_board_close` with the exact reason and `confirm: true`; that is the only raw edit, and every other raw-edit case is reported. Never run the `run` drain; the operator issues it. Keep counters out of durable artifacts.
