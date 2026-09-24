import { readFile, rm } from 'node:fs/promises';

type Request =
  | { kind: 'brave' | 'tavily'; query: string }
  | { kind: 'pdf'; bytes: string; url: string; outputDir: string };

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const request = JSON.parse(input) as Request;
  if (request.kind === 'brave' || request.kind === 'tavily') {
    const origin =
      request.kind === 'brave' ? 'https://api.search.brave.com' : 'https://api.tavily.com';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (target, init) => {
      if (
        new URL(target instanceof globalThis.Request ? target.url : String(target)).origin !==
        origin
      )
        throw new Error('Selected search provider origin changed');
      return originalFetch(target, { ...init, redirect: 'error' });
    };
  }
  if (request.kind === 'brave') {
    const path: string = 'pi-web-access/brave.ts';
    const module = await import(path);
    const value = await module.searchWithBrave(request.query, { numResults: 5 });
    return { results: value.results };
  }
  if (request.kind === 'tavily') {
    const path: string = 'pi-web-access/tavily.ts';
    const module = await import(path);
    const value = await module.searchWithTavily(request.query, {
      numResults: 5,
      includeContent: false,
    });
    return { results: value.results };
  }
  if (request.kind !== 'pdf') throw new Error('Invalid web access request');
  const path: string = 'pi-web-access/pdf-extract.ts';
  const module = await import(path);
  const bytes = Buffer.from(request.bytes, 'base64');
  const value = await module.extractPDFToMarkdown(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    request.url,
    {
      maxPages: 30,
      outputDir: request.outputDir,
      filename: 'source.md',
    },
  );
  try {
    return { text: await readFile(value.outputPath, 'utf8') };
  } finally {
    await rm(value.outputPath, { force: true });
  }
}

main().then(
  (value) => process.stdout.write(JSON.stringify(value)),
  (error: unknown) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
