---
name: local-research
description: Inspect local project evidence and produce a traceable research report.
---

# Local research

Investigate a local question with the host agent's normal filesystem tools. Select the smallest useful set of source files, tests, or artifacts. Give repository-relative references and line numbers where practical. Identify what was directly observed, what follows by inference, and what remains unknown. A status message from a worker or task board is a lead to verify, not a substitute for inspecting the result.

Do not pass local code or documents to `deus_research_web`. When the user asks to retain findings, create `.deus/research/<slug>.md` with YAML front matter: `kind: research`, lowercase `id`, ISO `created_at` and `updated_at`, `status`, list `references`, string `question`, `mode: local`, string `provider`, list `sources`, and list `gaps`. The body should state the evidence, conclusions, and limits in readable English.

Keep the report within `.deus/research/` unless directed otherwise. Exclude credentials, absolute local paths, raw live logs, and private execution state.
