import { readOnly, type ToolRegistrar } from './tool-registry.js';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubPlugin } from './github.js';
import { jsonResult as output, pageResult } from './process.js';
import { packageRoot } from './resources.js';
import { researchWeb, webConfigFromEnv } from './research.js';
export function registerGitHubTools(pi: ToolRegistrar) {
  const clients = new Map<string, GitHubPlugin>();
  const client = (cwd: string) => {
    let item = clients.get(cwd);
    if (!item) {
      item = new GitHubPlugin(cwd);
      clients.set(cwd, item);
    }
    return item;
  };
  const repository = Type.String({
      pattern: '^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$',
    }),
    issue = Type.Integer({ minimum: 1 }),
    cursor = Type.Union([Type.String({ maxLength: 2048 }), Type.Null()]),
    limit = Type.Integer({ minimum: 4, maximum: 16384 });
  pi.registerTool({
    name: 'deus_github_submit',
    label: 'Submit engineering contract',
    description:
      'Create one GitHub objective or task with explicit intake labels. Existing gh authentication; no automatic retry.',
    parameters: Type.Object({
      repository,
      kind: Type.Union([Type.Literal('objective'), Type.Literal('task')]),
      title: Type.String({ minLength: 1 }),
      body: Type.String({ minLength: 1 }),
    }),
    async execute(_id, p, signal, _update, ctx) {
      return output(await client(ctx.cwd).submit(p, signal));
    },
  });
  pi.registerTool({
    name: 'deus_github_answer',
    label: 'Answer engineering decision',
    description:
      'Post an immutable input-bound answer as the authenticated GitHub actor. Dexter separately checks authorized actors.',
    parameters: Type.Object({
      repository,
      issue,
      inputKey: Type.String({ pattern: '^[0-9a-f]{64}$' }),
      decisionKey: Type.String({ pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$' }),
      answer: Type.String({ minLength: 1 }),
    }),
    async execute(_id, p, signal, _update, ctx) {
      return output(await client(ctx.cwd).answer(p, signal));
    },
  });
  pi.registerTool({
    name: 'deus_github_product_accept',
    label: 'Record product acceptance',
    description:
      'Record a separate product decision after exact-revision engineering closure. Requires independent product evidence.',
    parameters: Type.Object({
      repository,
      issue,
      revision: Type.String({ pattern: '^[0-9a-f]{40}$' }),
      evidence: Type.String({ minLength: 1 }),
      decision: Type.Union([Type.Literal('accepted'), Type.Literal('rejected')]),
    }),
    async execute(_id, p, signal, _update, ctx) {
      return output(await client(ctx.cwd).accept(p, signal));
    },
  });
  pi.registerTool({
    name: 'deus_github_read',
    annotations: readOnly,
    label: 'Read engineering record',
    description:
      'Read GitHub issue, review comments, or pull request with bounded redacted continuation.',
    parameters: Type.Object({
      repository,
      issue,
      section: Type.Union([
        Type.Literal('issue'),
        Type.Literal('comments'),
        Type.Literal('pull-request'),
      ]),
      cursor,
      limit,
    }),
    async execute(_id, p, signal, _update, ctx) {
      return pageResult(await client(ctx.cwd).read(p, signal));
    },
  });
  pi.registerTool({
    name: 'deus_github_archive_read',
    annotations: readOnly,
    label: 'Read durable execution evidence',
    description:
      'Read an immutable private GitHub archive object or manifest at a commit. No local Dexter access.',
    parameters: Type.Object({
      repository,
      ref: Type.String({ pattern: '^[0-9a-f]{40}$' }),
      path: Type.String(),
      cursor,
      limit,
    }),
    async execute(_id, p, signal, _update, ctx) {
      return pageResult(await client(ctx.cwd).archive(p, signal));
    },
  });
  pi.registerTool({
    name: 'deus_research_web',
    annotations: { ...readOnly, idempotentHint: false },
    label: 'Research public web',
    description:
      'Run one foreground isolated public web research session with source receipts and bounded requests.',
    parameters: Type.Object({
      question: Type.String(),
      provider: Type.Union(
        ['default', 'exa', 'searxng', 'brave', 'tavily', 'fetch'].map((x) => Type.Literal(x)),
        { description: '"default" uses the configured provider.' },
      ),
    }),
    async execute(_id, p, signal) {
      const config = webConfigFromEnv();
      if (p.provider !== 'default') config.searchProvider = p.provider;
      return output(await researchWeb(p.question, config, undefined, signal));
    },
  });
}

export default function extension(pi: ExtensionAPI) {
  registerGitHubTools(pi);
  pi.on('before_agent_start', async (event) => ({
    systemPrompt:
      event.systemPrompt +
      '\n\n' +
      (await readFile(join(packageRoot, 'prompts/kernel.md'), 'utf8')),
  }));
}
