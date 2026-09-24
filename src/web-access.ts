import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Invoke selected pi-web-access components without loading its Pi extension or ambient config. */
async function invoke(
  request: Record<string, unknown>,
  credential: { name: 'BRAVE_API_KEY' | 'TAVILY_API_KEY'; value: string } | undefined,
  signal?: AbortSignal,
): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), 'deus-web-access-'));
  try {
    await writeFile(join(dir, 'web-search.json'), JSON.stringify({ pdf: { provider: 'unpdf' } }));
    const timeout = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000);
    timeout.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('./web-access-worker.js', import.meta.url))],
        {
          env: {
            PI_CODING_AGENT_DIR: dir,
            ...(credential ? { [credential.name]: credential.value } : {}),
          },
          signal: timeout,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 512_000) child.kill();
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk.slice(0, Math.max(0, 2000 - stderr.length));
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) reject(new Error('pi_web_access_failed: ' + stderr.slice(0, 300)));
        else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('pi_web_access_failed: invalid output'));
          }
        }
      });
      child.stdin.end(JSON.stringify({ ...request, outputDir: dir }));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function searchWithWebAccess(
  provider: 'brave' | 'tavily',
  query: string,
  key: string,
  signal?: AbortSignal,
) {
  return invoke(
    { kind: provider, query },
    { name: provider === 'brave' ? 'BRAVE_API_KEY' : 'TAVILY_API_KEY', value: key },
    signal,
  );
}

export async function extractPublicPdf(bytes: Buffer, url: string, signal?: AbortSignal) {
  const value = (await invoke(
    { kind: 'pdf', bytes: bytes.toString('base64'), url },
    undefined,
    signal,
  )) as {
    text: string;
  };
  const body = value.text?.split('---\n\n')[1]?.split('\n---\n\n*[Truncated')[0]?.trim();
  if (!body) throw new Error('source_inaccessible: PDF has no extractable text');
  if (body.length > 256_000)
    throw new Error('source_inaccessible: extracted PDF exceeds output budget');
  return body;
}
