import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { digest, redact } from './process.js';
import { extractPublicPdf } from './web-access.js';
const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  denied.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001:db8::', 32],
  ['2001::', 32],
  ['2002::', 16],
] as const)
  denied.addSubnet(address, prefix, 'ipv6');
const global6 = new BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !denied.check(address, 'ipv4')
    : family === 6 && global6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}
export async function pinDestination(url: URL, resolve = lookup) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('source_inaccessible: only public HTTP(S) URLs');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolve(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('source_inaccessible: private/local network destination');
  return addresses[0]!;
}
export function readableText(raw: string, type: string) {
  if (/^(text\/(plain|markdown|x-)|application\/(json|[^;]+\+json|javascript))/.test(type))
    return raw;
  if (!/^(text\/html|application\/xhtml\+xml)/.test(type))
    throw new Error('source_inaccessible: unsupported content type ' + type);
  return raw
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|pre)>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (x) =>
        ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[
          x
        ]!,
    )
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, s) => {
      const n = Number(s.startsWith('x') ? '0' + s : s);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}
/** Resolve once and pin the actual socket lookup; redirects repeat validation. No global agent/DNS reuse. */
export async function fetchPublic(url: string, signal?: AbortSignal, consume = () => {}) {
  const timeout = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
  let target = new URL(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    timeout.throwIfAborted();
    const pinned = await new Promise<Awaited<ReturnType<typeof pinDestination>>>(
      (resolve, reject) => {
        const aborted = () => reject(timeout.reason);
        timeout.addEventListener('abort', aborted, { once: true });
        pinDestination(target)
          .then(resolve, reject)
          .finally(() => timeout.removeEventListener('abort', aborted));
      },
    );
    timeout.throwIfAborted();
    consume();
    const response = await new Promise<{
      status: number;
      location?: string;
      type: string;
      body: Buffer;
    }>((resolve, reject) => {
      const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
        target,
        {
          agent: false,
          signal: timeout,
          headers: {
            Accept: 'text/html, text/plain, application/json',
            'Accept-Encoding': 'identity',
          },
          lookup: ((_host: unknown, options: unknown, callback: Function) => {
            if ((options as { all?: boolean }).all) callback(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          }) as import('node:net').LookupFunction,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('error', reject);
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (
              size >
              (/application\/pdf/i.test(String(res.headers['content-type'] ?? ''))
                ? 2_000_000
                : 256_000)
            )
              res.destroy(new Error('source_inaccessible: size limit'));
            else chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              location: res.headers.location,
              type: String(res.headers['content-type'] ?? '').toLowerCase(),
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      request.on('error', reject);
      request.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
      target = new URL(response.location, target);
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error('source_inaccessible: HTTP ' + response.status);
    const raw = /application\/pdf/i.test(response.type)
      ? await extractPublicPdf(response.body, target.href, timeout)
      : readableText(response.body.toString('utf8'), response.type);
    const text = redact(raw);
    if (!text.trim()) throw new Error('source_inaccessible: empty readable source');
    return {
      url: target.href,
      text,
      sha256: digest(text),
      contentType: response.type,
      locator: 'readable-text lines',
      redirects,
    };
  }
  throw new Error('source_inaccessible: redirect limit');
}
