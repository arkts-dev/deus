---
name: web-research
description: Answer a public question with bounded web research and source receipts.
---

# Web research

Use `deus_research_web` for a self-contained public question. Its research session is isolated from the current workspace. Never include repository contents, credentials, or other private context in the question. A configured Exa, SearXNG, Brave, or Tavily provider can discover pages; fetching a public URL supplies the evidence. Search results alone do not establish a claim. Distinguish verified source content, your interpretation, and unanswered questions. Describe a partial result as partial.

If a durable report is requested, save `.deus/research/<slug>.md` with YAML front matter: `kind: research`, lowercase `id`, ISO `created_at` and `updated_at`, `status`, list `references`, string `question`, `mode: web`, string `provider`, list `sources`, and list `gaps`. In the body, link each material finding to its inspected source receipt and note relevant limits.

Use only the public research tool inside this workflow; do not dispatch Dexter from it. The saved report must not contain secrets, absolute machine paths, live logs, or private operation state.
