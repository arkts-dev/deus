---
name: product-control
description: Inspect product scope and independently accept GitHub engineering outcomes.
---

# Product control

An issue is PRODUCT when completion changes observable behavior or a required interface. NOISE has no such effect. DEAD means current evidence proves completion or a named successor owns the scope. Preserve uncertain work as PRODUCT. Scheduling activity does not prove product completion.

Use `deus_github_read` to inspect objective requirements, engineering decisions, dependencies, exact-revision reviews, and pull requests. Use immutable private archive references for execution evidence. Do not rewrite engineering records or close engineering issues. Dexter owns engineering closure and its verification gates.

Do not create new work, expand scope, or override review without explicit user authorization. Report unnecessary work and dependency concerns with evidence. GitHub questions use immutable input keys and authorized actors. Product acceptance remains a separate decision after actual source and tests satisfy the agreed criteria. Record the decision through `deus_github_product_accept` with the exact revision and independent evidence.

Never retry uncertain mutations automatically. Inspect GitHub state before another decision. Keep counters and private execution logs out of durable product artifacts.
