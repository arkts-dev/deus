# Deus

Deus is a Pi package for product design, research, GitHub handoffs, and independent acceptance. Dexter owns engineering delivery. Both products use GitHub as independent actors.

Install Node.js 22.19 or newer and the package dependencies. Configure existing `gh` authentication. Set `DEUS_GITHUB_REPOSITORIES=owner/product,owner/private-archive` for permitted repositories. No Dexter executable, Temporal connection, or local engineering storage is required.

The package exposes typed tools to submit objectives or tasks, answer immutable engineering questions, read GitHub records and private archive objects, and record product acceptance. Product acceptance requires exact-revision engineering closure and independent evidence. It does not close engineering issues.

`deus-mcp --workspace /absolute/product/path` exposes the same tools to MCP clients. Product files remain bound to that workspace. GitHub identity is independent of the workspace path. Mutation receipts are bounded and redacted. An uncertain mutation is never retried automatically.

The six packaged skills cover design, GitHub coordination, product control, local research, web research, and simplification review. They create tracked product documents only when authorized. They do not install into managed target repositories.

Run `npm ci --ignore-scripts`, `npm run check`, `npm run skills:verify`, `npm run format:check`, and `npm run test:package`. Tests use executable fixtures and make no live model or GitHub calls. Commit generated `dist/` with source changes.
