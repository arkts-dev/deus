import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fetchPublic } from './web.js';
import { searchWithWebAccess } from './web-access.js';
import {
  newReceipt,
  validateFindings,
  briefDigest,
  type SourceReceipt,
  type Finding,
  type ResearchReport,
} from './evidence.js';
import { isolatedLoader, skillsRoot } from './resources.js';
import { redact, redactedJson } from './process.js';

export interface WebConfig {
  searxngUrl?: string;
  exaKey?: string;
  braveKey?: string;
  tavilyKey?: string;
  searchProvider?: 'exa' | 'searxng' | 'brave' | 'tavily' | 'fetch';
}
export function webConfigFromEnv(): WebConfig {
  return {
    exaKey: process.env.EXA_API_KEY,
    searxngUrl: process.env.DEUS_SEARXNG_URL,
    braveKey: process.env.BRAVE_API_KEY,
    tavilyKey: process.env.TAVILY_API_KEY,
    searchProvider: process.env.DEUS_WEB_PROVIDER as WebConfig['searchProvider'],
  };
}
export function webSearchProvider(config: WebConfig) {
  const provider =
    config.searchProvider ?? (config.exaKey ? 'exa' : config.searxngUrl ? 'searxng' : 'fetch');
  if (
    !['exa', 'searxng', 'brave', 'tavily', 'fetch'].includes(provider) ||
    (provider === 'exa' && !config.exaKey) ||
    (provider === 'searxng' && !config.searxngUrl) ||
    (provider === 'brave' && !config.braveKey) ||
    (provider === 'tavily' && !config.tavilyKey)
  )
    throw new Error('web_unavailable: selected search provider is not configured');
  return provider;
}
async function boundedResponse(response: Response, maxBytes = 256_000): Promise<string> {
  if (!response.ok) throw new Error(`Web request failed: HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) throw new Error('Web source exceeds output budget');
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(parts).toString('utf8');
}
export async function searchWeb(
  query: string,
  config: WebConfig,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!query.trim() || query.length > 4000) throw new Error('Invalid search question');
  const provider = webSearchProvider(config);
  const timeout = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
    : AbortSignal.timeout(20_000);
  if (provider === 'brave' || provider === 'tavily')
    return searchWithWebAccess(
      provider,
      query,
      provider === 'brave' ? config.braveKey! : config.tavilyKey!,
      timeout,
    );
  if (provider === 'exa') {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      redirect: 'error',
      signal: timeout,
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.exaKey! },
      body: JSON.stringify({
        query,
        numResults: 5,
        type: 'auto',
        contents: { highlights: { maxCharacters: 2000 } },
      }),
    });
    return JSON.parse(await boundedResponse(response));
  }
  if (provider === 'searxng') {
    const url = new URL('search', config.searxngUrl!.replace(/\/?$/, '/'));
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    const response = await fetch(url, { signal: timeout, redirect: 'error' });
    const data = JSON.parse(await boundedResponse(response));
    return {
      results: (data.results ?? [])
        .slice(0, 5)
        .map((x: Record<string, unknown>) => ({ title: x.title, url: x.url, snippet: x.content })),
    };
  }
  throw new Error('web_unavailable: configure a search provider');
}
const output = (data: unknown) => ({
  content: [{ type: 'text' as const, text: redactedJson(data) }],
  details: {},
});
export function externalResearchTools(
  config: WebConfig,
  receipts: SourceReceipt[],
  consume: () => void,
): ToolDefinition[] {
  return [
    {
      name: 'web_search',
      label: 'Search public sources',
      description: 'Search is discovery only; fetch a source before using it as evidence.',
      parameters: Type.Object({ query: Type.String() }),
      async execute(_id, p: { query: string }, signal) {
        consume();
        return output(await searchWeb(p.query, config, signal));
      },
    },
    {
      name: 'web_fetch',
      label: 'Fetch public source',
      description: 'Fetch with public DNS, redirect, and content guards.',
      parameters: Type.Object({ url: Type.String() }),
      async execute(_id, p: { url: string }, signal) {
        consume();
        const source = await fetchPublic(p.url, signal, consume);
        const receipt = newReceipt({
          kind: 'external',
          locator: p.url,
          sha256: source.sha256,
          text: source.text,
        });
        receipts.push(receipt);
        return output({ ...source, receiptId: receipt.id });
      },
    },
  ];
}

export async function researchWeb(
  question: string,
  config = webConfigFromEnv(),
  runtime?: ModelRuntime,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!question.trim() || question.length > 4000)
    throw new Error('Invalid public research question');
  webSearchProvider(config);
  const cwd = await mkdtemp(join(tmpdir(), 'deus-web-'));
  const agentDir = join(cwd, 'agent');
  await mkdir(agentDir);
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    const methodology = await readFile(join(skillsRoot, 'web-research/SKILL.md'), 'utf8');
    const { loader, settings } = await isolatedLoader(cwd, agentDir, methodology);
    const receipts: SourceReceipt[] = [];
    const began = Date.now();
    let requests = 0,
      turns = 0,
      stopped = false;
    const maxRequests = 12;
    const consume = () => {
      if (requests >= maxRequests) throw new Error('research_request_budget_exhausted');
      requests++;
    };
    const tools = externalResearchTools(config, receipts, consume);
    let submitted:
      | {
          coverage: 'complete' | 'partial';
          findings: Finding[];
          mechanism: string;
          consequences: string;
          applicability: string;
          uncertainty: string[];
          decisionDimensions: string[];
          gaps: string[];
        }
      | undefined;
    tools.push({
      name: 'research_report',
      label: 'Submit evidence report',
      description:
        'Verified findings require a source receipt and exact inspected quote. Separate inference and gaps.',
      parameters: Type.Object({
        coverage: Type.Union([Type.Literal('complete'), Type.Literal('partial')]),
        findings: Type.Array(
          Type.Object({
            statement: Type.String(),
            provenance: Type.Union(
              ['external_verified', 'inference', 'parametric_unverified', 'gap'].map((x) =>
                Type.Literal(x),
              ),
            ),
            sources: Type.Array(Type.String()),
            quote: Type.Optional(Type.String()),
          }),
        ),
        mechanism: Type.String(),
        consequences: Type.String(),
        applicability: Type.String(),
        uncertainty: Type.Array(Type.String()),
        decisionDimensions: Type.Array(Type.String()),
        gaps: Type.Array(Type.String()),
      }),
      async execute(_id, p) {
        const value = p as NonNullable<typeof submitted>;
        validateFindings(value.findings, receipts);
        submitted = value;
        return output({ recorded: true, semanticReview: 'required' });
      },
    });
    const modelRuntime =
      runtime ??
      (await ModelRuntime.create({
        authPath: join(agentDir, 'auth.json'),
        modelsPath: null,
        allowModelNetwork: false,
      }));
    const model = modelRuntime.getAvailableSnapshot()[0];
    if (!model) return { status: 'unavailable', reason: 'No model configured' };
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      resourceLoader: loader,
      settingsManager: settings,
      modelRuntime,
      model,
      tools: tools.map((t) => t.name),
      customTools: tools,
      sessionManager: SessionManager.inMemory(cwd),
    }));
    session.subscribe((event) => {
      if (
        event.type === 'turn_end' &&
        ++turns >= 8 &&
        event.message.role === 'assistant' &&
        event.message.stopReason === 'toolUse'
      ) {
        stopped = true;
        void session!.abort();
      }
    });
    const stop = () => {
      stopped = true;
      void session!.abort();
    };
    signal?.throwIfAborted();
    signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 120_000);
    try {
      await session.prompt(
        JSON.stringify({
          question: redact(question),
          instruction:
            'Use public sources only. Submit research_report with receipt-backed findings, separate inferences, and gaps.',
        }),
        { expandPromptTemplates: false },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }
    const messages = session.messages.filter((m) => m.role === 'assistant');
    const evidence: ResearchReport = {
      id: 'research-' + randomUUID(),
      question,
      briefDigest: briefDigest(question, []),
      status: signal?.aborted
        ? 'cancelled'
        : stopped ||
            !submitted ||
            submitted.coverage === 'partial' ||
            messages.some((m) => m.stopReason === 'error')
          ? 'partial'
          : 'completed',
      ...(submitted ?? {
        findings: [],
        mechanism: 'Not established',
        consequences: 'Not established',
        applicability: 'Not established',
        uncertainty: [],
        decisionDimensions: [],
        gaps: ['No validated report submitted'],
      }),
      receipts,
      limits: {
        requests,
        maxRequests,
        turns,
        elapsedMs: Date.now() - began,
        usage: session.getSessionStats(),
      },
      receiptValidation: 'passed',
      semanticReview: 'required',
      createdAt: new Date().toISOString(),
    };
    return {
      status: stopped ? 'bounded' : 'completed',
      evidence,
      errors: messages
        .filter((m) => m.stopReason === 'error')
        .map((m) => redact(m.errorMessage ?? 'Model error')),
    };
  } finally {
    session?.dispose();
    await rm(cwd, { recursive: true, force: true });
  }
}
