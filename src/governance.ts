/** Shared parsing and governance primitives. */
export type Fields = Map<string, string | string[]>;
const FIELD = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const ITEM = /^\s+-\s+(.*)$/;
const unquote = (value: string) => (/^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value);

export function frontmatter(text: string): { fields: Fields; body: string } {
  const fields: Fields = new Map();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) return { fields, body: text };
  let key: string | undefined;
  for (const line of lines.slice(1, end)) {
    const item = ITEM.exec(line);
    if (item && key) {
      const list = fields.get(key);
      if (Array.isArray(list)) list.push(unquote(item[1] ?? ''));
      else fields.set(key, [unquote(item[1] ?? '')]);
      continue;
    }
    const match = FIELD.exec(line);
    if (!match?.[1]) continue;
    key = match[1];
    const raw = (match[2] ?? '').trim();
    fields.set(
      key,
      raw === '[]'
        ? []
        : raw.startsWith('[') && raw.endsWith(']')
          ? raw
              .slice(1, -1)
              .split(',')
              .map((part) => unquote(part.trim()))
              .filter(Boolean)
          : unquote(raw),
    );
  }
  return {
    fields,
    body: lines
      .slice(end + 1)
      .join('\n')
      .replace(/^\n/, ''),
  };
}

export const field = (fm: { fields: Fields }, key: string): string => {
  const value = fm.fields.get(key);
  return typeof value === 'string' ? value : '';
};
export const list = (fm: { fields: Fields }, key: string): string[] => {
  const value = fm.fields.get(key);
  return Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
};

const strip = (text: string) => text.replace(/```[^\n]*\n[\s\S]*?```/g, '\n');
export const words = (text: string) =>
  strip(text)
    .replace(/`[^`]*`/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

const BANNED: [string, RegExp][] = [
  ['percentage', /\b\d+(?:\.\d+)?\s?%/g],
  ['coverage', /\b(coverage|covered)\b/gi],
  ['readiness', /\b(readiness|ready rate|pass rate|failure rate|success rate)\b/gi],
  [
    'gate',
    /\b(gate|gates|exit code|exit-code|green build|ci (?:passes|is green)|checks? pass(?:ed)?)\b/gi,
  ],
  [
    'provenance',
    /\b(provenance|audit trail|historical catalog|revision history|changelog|previously delivered|prior cycle)\b/gi,
  ],
  ['counter', /\b(counters?|totals?|how many)\b/gi],
];
export const banned = (text: string): string[] =>
  BANNED.flatMap(([name, re]) =>
    [...text.matchAll(re)].map((match) => `${name}: ${match[0]}`),
  ).slice(0, 8);

export function duplicates(body: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const match of strip(body).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const heading = (match[1] ?? '').trim().toLowerCase();
    if (seen.has(heading)) found.push(match[1] ?? '');
    else seen.add(heading);
  }
  return found;
}

const STOP = new Set(
  'the and for with that this from into when then than are was were must shall may can its it a an of to in on or as is be not never no without cannot issue title task epic'.split(
    ' ',
  ),
);
export const terms = (text: string, limit = 200): string[] =>
  [
    ...new Set(
      strip(text)
        .replace(/^#{1,6}.*$/gm, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word)),
    ),
  ].slice(0, limit);

const negative = (sentence: string) => /\b(not|never|no|without|cannot)\b/i.test(sentence);
export function contradictions(body: string, limit = 10): string[] {
  const sentences = strip(body)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
  const sets = sentences.map((sentence) => new Set(terms(sentence)));
  const found: string[] = [];
  for (let left = 0; left < sentences.length && found.length < limit; left += 1)
    for (let right = left + 1; right < sentences.length && found.length < limit; right += 1) {
      const a = sets[left]!;
      const b = sets[right]!;
      if (!a.size || !b.size) continue;
      let shared = 0;
      for (const token of a) if (b.has(token)) shared += 1;
      if (
        shared / (a.size + b.size - shared) >= 0.8 &&
        negative(sentences[left]!) !== negative(sentences[right]!)
      )
        found.push(`"${sentences[left]}" vs "${sentences[right]}"`);
    }
  return found;
}
