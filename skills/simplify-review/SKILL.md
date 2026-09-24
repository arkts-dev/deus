---
name: simplify-review
description: Check whether a proposed result meets its product contract with avoidable scope.
---

# Simplify review

Review project source read-only. Compare the proposed design, handoff, or completed result with the authorized objective and its acceptance criteria. Call out unnecessary work, repeated requirements, assumptions presented as facts, and changes outside the agreed boundary. Preserve requirements that protect real product behavior. Report whether each finding blocks acceptance, can wait, or needs a new product decision.

Do not call `deus_dexter_probe` or `deus_dexter_exec` during this review. Do not edit project source as part of the review. Recommend an action and its evidence; let the user or the authorized execution workflow decide whether to act. Stop once the observable outcome is established, and never relax acceptance merely to make a result appear complete.

If the user requests a persistent review, write Markdown under `.deus/` or amend the related design or handoff while keeping its required front matter. Leave out credentials, absolute paths, live logs, and private state.
