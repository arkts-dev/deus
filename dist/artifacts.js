/** Read-only adapter for the current local Forge format. Public cursors contain no file paths. */
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { SignedCursor } from './cursor.js';
import { parse, stringify } from 'yaml';
import { digest, redact } from './process.js';
import { bytePage } from './receipt.js';
export const SECTIONS = {
    issue: ['summary', 'metadata', 'body', 'notes'],
    mr: ['summary', 'metadata', 'body', 'reviews', 'notes'],
    wiki: ['summary', 'metadata', 'body'],
    run: ['metadata', 'assignment', 'system', 'transcript', 'stderr'],
};
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const inside = (root, path) => {
    const rel = relative(root, path);
    return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
export async function safePath(root, ...parts) {
    const path = await realpath(join(root, ...parts));
    if (!inside(root, path))
        throw new Error('Artifact path escapes the Forge');
    return path;
}
export async function source(root, parts) {
    const path = await safePath(root, ...parts);
    if ((await stat(path)).size > MAX_SOURCE_BYTES)
        throw new Error('Artifact exceeds the local reader size limit; use ordinary read-only inspection');
    const data = await readFile(path);
    if (data.length > MAX_SOURCE_BYTES)
        throw new Error('Artifact grew beyond the reader size limit');
    try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
    }
    catch {
        throw new Error('Artifact is not valid UTF-8');
    }
}
export function document(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!match)
        throw new Error('Artifact has no valid front matter');
    const metadata = parse(match[1], { uniqueKeys: true });
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        throw new Error('Artifact metadata must be a mapping');
    return { metadata: metadata, body: match[2].replace(/^\r?\n/, '') };
}
async function history(root, folder, id) {
    let files;
    try {
        const dir = await safePath(root, folder, id);
        files = (await readdir(dir))
            .filter((file) => /^\d+\.md$/.test(file))
            .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return '';
        throw error;
    }
    const pieces = [];
    let bytes = 0;
    for (const file of files) {
        const text = await source(root, [folder, id, file]);
        bytes += Buffer.byteLength(text);
        if (bytes > MAX_SOURCE_BYTES)
            throw new Error('History exceeds the local reader size limit');
        pieces.push(text);
    }
    return pieces.join('\n');
}
export class ArtifactReader {
    cursor = new SignedCursor();
    async read(kind, p) {
        const section = p.section ?? (kind === 'run' ? 'metadata' : 'summary');
        const limit = p.limit ?? 4096;
        if (!Number.isInteger(limit) || limit < 4 || limit > 16384)
            throw new Error('limit must be 4..16384 UTF-8 bytes');
        if (!SECTIONS[kind].includes(section))
            throw new Error('Invalid section');
        const validId = kind === 'wiki'
            ? /^[a-z0-9][a-z0-9-]*$/
            : kind === 'run'
                ? /^RUN-[a-z0-9]+-\d+$/
                : kind === 'issue'
                    ? /^ISSUE-\d+$/
                    : /^MR-\d+$/;
        if (!validId.test(p.id))
            throw new Error('Invalid artifact ID');
        if (!isAbsolute(p.workspace))
            throw new Error('workspace must be an absolute path');
        const workspace = await realpath(p.workspace);
        const root = await realpath(join(workspace, 'forge'));
        if (!inside(workspace, root))
            throw new Error('Forge escapes the workspace');
        let text;
        if (kind === 'run') {
            const file = {
                metadata: 'run.json',
                assignment: 'prompt.txt',
                system: 'system.txt',
                transcript: 'stdout.txt',
                stderr: 'stderr.txt',
            }[section];
            const metadata = JSON.parse(await source(root, ['runs', p.id, 'run.json']));
            if (metadata.run !== p.id)
                throw new Error('Run metadata identity mismatch');
            text =
                section === 'metadata'
                    ? JSON.stringify(metadata, null, 2)
                    : await source(root, ['runs', p.id, file]);
        }
        else {
            const dir = kind === 'issue' ? 'issues' : kind === 'mr' ? 'merge_requests' : 'wiki';
            let file = `${p.id}.md`;
            if (kind === 'issue') {
                const directory = await safePath(root, dir);
                const matches = (await readdir(directory)).filter((name) => name === file || (name.startsWith(`${p.id}-`) && name.endsWith('.md')));
                if (matches.length !== 1)
                    throw new Error('Issue not found or ambiguous');
                file = matches[0];
            }
            const doc = document(await source(root, [dir, file]));
            if (doc.metadata[kind === 'wiki' ? 'slug' : 'id'] !== p.id)
                throw new Error('Artifact metadata identity mismatch');
            if (section === 'notes' || section === 'reviews')
                text = await history(root, section, p.id);
            else if (section === 'body')
                text = doc.body;
            else {
                text = stringify(doc.metadata);
                if (section === 'summary')
                    text += `\n${doc.body}`;
            }
        }
        text = redact(text);
        const revision = digest(text);
        const identity = digest(JSON.stringify([workspace, kind, p.id, section]));
        let offset = 0;
        if (p.cursor) {
            const cursor = this.cursor.decode(p.cursor);
            if (cursor.identity !== identity)
                throw new Error('Cursor belongs to another artifact or section');
            if (cursor.revision !== revision)
                throw new Error('Artifact changed; restart without a cursor');
            const next = cursor.offset;
            if (typeof next !== 'number' ||
                !Number.isSafeInteger(next) ||
                next < 0 ||
                next > Buffer.byteLength(text))
                throw new Error('Invalid cursor offset');
            offset = next;
        }
        const page = bytePage(text, offset, limit);
        const nextCursor = page.nextOffset === null
            ? null
            : this.cursor.encode({ identity, revision, offset: page.nextOffset });
        return { id: p.id, section, text: page.text, revision, nextCursor };
    }
}
