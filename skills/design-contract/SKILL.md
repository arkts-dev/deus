---
name: design-contract
description: Define a product decision and observable acceptance before engineering work begins.
---

# Design contract

Use this skill when a product request needs a durable decision. Establish the user's intended outcome, the evidence that authorizes it, the boundary of the work, and the conditions under which the result will be accepted. Discuss alternatives at the product level; leave engineering decomposition to Dexter. Resolve conflicting requirements with the user before creating an execution handoff.

For a persistent contract, create `.deus/design/<slug>.md`. Its YAML front matter contains `kind: design`, a lowercase `id`, ISO `created_at` and `updated_at`, `status`, a `references` list, a `problem` string, an `options` list, a `decision` string, and an `acceptance` list. Explain the chosen option and any open product questions in the body. Acceptance items should describe results that can be checked against artifacts or user-visible behavior.

Unless the user names another location, write only tracked Markdown under `.deus/design/`. Keep credentials, absolute machine paths, live process output, and operational secrets out of the contract.
