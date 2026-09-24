import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
export const digest = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');
export function redact(value: string): string {
  let text = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const [key, secret] of Object.entries(process.env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) && secret && secret.length >= 6)
      text = text.split(secret).join('[REDACTED]');
  }
  return text
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,"']+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/g, '$1[REDACTED]@');
}
export function redactedJson(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'string' ? redact(item) : item),
    space,
  );
}
export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  error?: string;
}
export interface ProcessOptions {
  cwd: string;
  timeoutMs?: number | null;
  maxBytes?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  truncateOutput?: boolean;
}
export function runProcess(
  executable: string,
  argv: string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  if (argv.some((a) => a.includes('\0')) || executable.includes('\0'))
    throw new Error('Invalid process argument');
  return new Promise((resolve) => {
    const result: ProcessResult = {
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: false,
      truncated: false,
    };
    if (options.signal?.aborted) {
      result.cancelled = true;
      resolve(result);
      return;
    }
    let bytes = 0;
    let finished = false;
    let killTimer: NodeJS.Timeout | undefined;
    const child = spawn(executable, argv, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        /* already exited */
      }
    };
    const stop = () => {
      kill('SIGTERM');
      killTimer ??= setTimeout(() => kill('SIGKILL'), 500);
    };
    const abort = () => {
      result.cancelled = true;
      stop();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer =
      options.timeoutMs === null
        ? undefined
        : setTimeout(() => {
            result.timedOut = true;
            stop();
          }, options.timeoutMs ?? 30_000);
    for (const key of ['stdout', 'stderr'] as const)
      child[key].on('data', (chunk: Buffer) => {
        const remaining = (options.maxBytes ?? 512_000) - bytes;
        bytes += chunk.length;
        if (remaining > 0) result[key] += chunk.subarray(0, remaining).toString();
        if (bytes > (options.maxBytes ?? 512_000)) {
          result.truncated = true;
          if (!options.truncateOutput) stop();
        }
      });
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', abort);
      result.stdout = redact(result.stdout);
      result.stderr = redact(result.stderr);
      resolve(result);
    };
    child.on('error', (error) => {
      result.error = redact(error.message);
      finish();
    });
    child.on('close', (code, signal) => {
      result.exitCode = code;
      result.signal = signal;
      finish();
    });
  });
}
export const succeeded = (r: ProcessResult) =>
  r.exitCode === 0 && !r.error && !r.timedOut && !r.cancelled && !r.truncated;
