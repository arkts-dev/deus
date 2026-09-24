/** Designer: mechanical invariant checks and one-shot writing for design documents. */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { redactedJson } from './process.js';
import {
  banned,
  contradictions,
  duplicates,
  field,
  frontmatter,
  list,
  words,
} from './governance.js';

export const DESIGN_CAP = 15_000;
const REQUIRED = [
  'kind',
  'id',
  'created_at',
  'updated_at',
  'status',
  'references',
  'problem',
  'options',
  'decision',
  'acceptance',
];
const SECTIONS = ['Objective', 'Invariants', 'Boundaries', 'Decisions', 'Acceptance', 'References'];

export function designPath(cwd: string, requested: string) {
  const wanted = requested.trim();
  if (!wanted || isAbsolute(wanted) || wanted.split(/[\\/]/).includes('..'))
    throw new Error('design path must be a workspace-relative path');
  const absolute = resolve(cwd, wanted);
  const rel = relative(cwd, absolute);
  const head = rel.split(sep)[0];
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || head === 'fs' || head === 'forge')
    throw new Error('design path must stay inside the workspace outside fs/ and forge/');
  return { absolute, rel: rel.split(sep).join('/') };
}

export function designCheck(cwd: string, requested: string, content: string) {
  const { rel } = designPath(cwd, requested);
  const fm = frontmatter(content);
  const frontmatterText = [...fm.fields.values()]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .join('\n');
  const errors: string[] = [];
  if (!fm.fields.size) errors.push('missing front matter');
  for (const key of fm.fields.keys())
    if (!REQUIRED.includes(key)) errors.push(`banned field: ${key}`);
  if (field(fm, 'kind') !== 'design') errors.push('kind must be design');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(field(fm, 'id'))) errors.push('id must be a lowercase slug');
  for (const key of ['created_at', 'updated_at', 'status', 'problem', 'decision'])
    if (!field(fm, key)) errors.push(`missing ${key}`);
  for (const key of ['references', 'options', 'acceptance'])
    if (!list(fm, key).length) errors.push(`empty ${key}`);
  const count = words(fm.body);
  if (count > DESIGN_CAP) errors.push(`over word cap: ${count}`);
  errors.push(
    ...banned(frontmatterText),
    ...banned(fm.body),
    ...duplicates(fm.body).map((heading) => `duplicate section: ${heading}`),
    ...contradictions(fm.body),
  );
  const warnings = SECTIONS.filter(
    (section) => !new RegExp(`^#{1,6}\\s+${section}\\b`, 'im').test(fm.body),
  ).map((section) => `missing section: ${section}`);
  return { ok: !errors.length, path: rel, words: count, errors, warnings };
}

export async function designWrite(cwd: string, requested: string, content: string) {
  const { absolute } = designPath(cwd, requested);
  let exists = true;
  try {
    await stat(absolute);
  } catch {
    exists = false;
  }
  if (exists) throw new Error('designer never amends an existing document');
  const check = designCheck(cwd, requested, content);
  if (!check.ok) return { ...check, status: 'rejected' as const };
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return { ...check, status: 'written' as const };
}

const parameters = () => Type.Object({ path: Type.String(), content: Type.String() });
const output = (value: unknown) => ({
  content: [{ type: 'text' as const, text: redactedJson(value, 2) }],
  details: {},
});

export default function designer(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'deus_design_check',
    label: 'Check design document',
    description:
      'Validate a proposed design document: front matter, word cap, banned text, duplicate sections, contradictions. Writes nothing.',
    parameters: parameters(),
    async execute(_id, p, _signal, _update, ctx) {
      return output(designCheck(ctx.cwd, p.path, p.content));
    },
  });
  pi.registerTool({
    name: 'deus_design_write',
    label: 'Write design document',
    description:
      'Validate and write one new design document to a user-named workspace-relative path. Refuses existing, absolute, fs/, and forge/ paths.',
    parameters: parameters(),
    async execute(_id, p, _signal, _update, ctx) {
      return output(await designWrite(ctx.cwd, p.path, p.content));
    },
  });
}
