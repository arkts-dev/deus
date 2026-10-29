---
name: web-research
description: Answer a public question with bounded web research and source receipts.
---

# Web research

Use the host agent's available web search and fetch tools for a self-contained public question. Deus provides this methodology, not a research API or nested model session. Never include repository contents, credentials, or other private context in public requests. Bound the search to relevant queries and inspect public source pages for evidence. If no web tools are available, report the gap. Search results alone do not establish a claim. Distinguish verified source content, your interpretation, and unanswered questions. Describe a partial result as partial.

If a durable report is requested, save `.deus/research/<slug>.md` with YAML front matter: `kind: research`, lowercase `id`, ISO `created_at` and `updated_at`, `status`, list `references`, string `question`, `mode: web`, string `provider`, list `sources`, and list `gaps`. In the body, link each material finding to its inspected source receipt and note relevant limits.

Use only public web tools inside this workflow; do not dispatch Dexter from it. The saved report must not contain secrets, absolute machine paths, live logs, or private operation state.
