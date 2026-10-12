import { Type } from 'typebox';
import { Check } from 'typebox/value';
import { runProcess, succeeded, redact, digest } from './process.js';
import { mutationReceipt, bytePage } from './receipt.js';
import { SignedCursor } from './cursor.js';
const repoPattern = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const object = Type.Record(Type.String(), Type.Unknown());
function decode(schema, value) {
    if (!Check(schema, value))
        throw new Error('Malformed GitHub response');
    return value;
}
export class GitHubPlugin {
    cwd;
    repositories;
    executable;
    cursor = new SignedCursor();
    constructor(cwd = process.cwd(), repositories = (process.env.DEUS_GITHUB_REPOSITORIES ?? '').split(',').filter(Boolean), executable = 'gh') {
        this.cwd = cwd;
        this.repositories = repositories;
        this.executable = executable;
    }
    allowed(repository) {
        if (!repoPattern.test(repository) || !this.repositories.includes(repository))
            throw new Error('Repository is not in DEUS_GITHUB_REPOSITORIES');
    }
    async json(args, signal) {
        const result = await runProcess(this.executable, args, {
            cwd: this.cwd,
            signal,
            timeoutMs: 60000,
        });
        if (!succeeded(result))
            throw new Error(redact(result.stderr || result.error || 'GitHub command failed'));
        return JSON.parse(result.stdout);
    }
    async mutation(repository, args, signal) {
        try {
            this.allowed(repository);
            if (signal?.aborted)
                throw new Error('Cancelled before mutation');
            const auth = await runProcess(this.executable, ['auth', 'status'], { cwd: this.cwd, signal });
            if (!succeeded(auth))
                throw new Error('Existing gh authentication is unavailable');
            const permission = decode(Type.Object({ viewerPermission: Type.String() }), await this.json(['repo', 'view', repository, '--json', 'viewerPermission'], signal));
            if (!['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission.viewerPermission))
                throw new Error('GitHub write permission is unavailable');
        }
        catch (error) {
            return mutationReceipt('rejected', {
                reasons: [error instanceof Error ? error.message : 'Access denied'],
            });
        }
        const raw = await runProcess(this.executable, args, {
            cwd: this.cwd,
            signal,
            truncateOutput: true,
            timeoutMs: 60000,
        });
        return mutationReceipt(succeeded(raw) ? 'completed' : 'outcome_unknown', {
            exitCode: raw.exitCode,
            signal: raw.signal,
            timedOut: raw.timedOut,
            cancelled: raw.cancelled,
            stdout: raw.stdout,
            stderr: raw.stderr,
            diagnosticsTruncated: raw.truncated,
            reasons: succeeded(raw)
                ? []
                : ['Inspect GitHub state before another decision; never retry automatically'],
        });
    }
    submit(p, signal) {
        if (!p.title.trim() || p.title.includes('\0') || p.body.includes('\0'))
            return Promise.resolve(mutationReceipt('rejected', { reasons: ['Invalid product contract'] }));
        return this.mutation(p.repository, [
            'issue',
            'create',
            '--repo',
            p.repository,
            '--title',
            p.title,
            '--body',
            p.body,
            '--label',
            `dexter:ready,dexter:${p.kind}`,
        ], signal);
    }
    answer(p, signal) {
        return this.mutation(p.repository, [
            'api',
            `repos/${p.repository}/issues/${p.issue}/comments`,
            '--method',
            'POST',
            '-f',
            `body=${JSON.stringify({ version: 2, type: 'answer', inputKey: p.inputKey, decisionKey: p.decisionKey, answer: p.answer })}`,
        ], signal);
    }
    async accept(p, signal) {
        this.allowed(p.repository);
        const issue = decode(Type.Object({ state: Type.String() }), await this.json(['issue', 'view', String(p.issue), '--repo', p.repository, '--json', 'state'], signal));
        const pages = decode(Type.Array(Type.Array(Type.Object({ body: Type.String() }))), await this.json(['api', `repos/${p.repository}/issues/${p.issue}/comments`, '--paginate', '--slurp'], signal));
        if (issue.state !== 'CLOSED' ||
            !pages
                .flat()
                .some((comment) => comment.body.startsWith(`<!-- dexter:v2:engineering-complete:${p.revision} -->`)))
            return mutationReceipt('rejected', {
                reasons: ['Exact-revision engineering closure is not confirmed'],
            });
        return this.mutation(p.repository, [
            'api',
            `repos/${p.repository}/issues/${p.issue}/comments`,
            '--method',
            'POST',
            '-f',
            `body=${JSON.stringify({ version: 2, type: 'product-acceptance', revision: p.revision, decision: p.decision, evidence: p.evidence })}`,
        ], signal);
    }
    async read(p, signal) {
        this.allowed(p.repository);
        if (!Number.isSafeInteger(p.issue) || p.issue < 1)
            throw new Error('Invalid GitHub issue number');
        const value = p.section === 'comments'
            ? await this.json(['api', `repos/${p.repository}/issues/${p.issue}/comments`, '--paginate', '--slurp'], signal)
            : await this.json([
                'api',
                `repos/${p.repository}/${p.section === 'issue' ? 'issues' : 'pulls'}/${p.issue}`,
            ], signal);
        if (p.section === 'comments') {
            decode(Type.Array(Type.Array(object)), value);
        }
        else {
            decode(object, value);
        }
        return this.page(JSON.stringify(value, null, 2), `${p.repository}/${p.issue}/${p.section}`, p.cursor, p.limit);
    }
    async archive(p, signal) {
        this.allowed(p.repository);
        if (!/^[0-9a-f]{40}$/.test(p.ref) ||
            !/^(?:LATEST|manifests\/[0-9a-f]{64}\.json|objects\/[0-9a-f]{64})$/.test(p.path))
            throw new Error('Archive requires an immutable commit and manifest/object path');
        const repo = decode(Type.Object({ isPrivate: Type.Boolean() }), await this.json(['repo', 'view', p.repository, '--json', 'isPrivate'], signal));
        if (!repo.isPrivate)
            throw new Error('Execution archive must remain private');
        const response = await runProcess(this.executable, [
            'api',
            `repos/${p.repository}/contents/${p.path}?ref=${p.ref}`,
            '-H',
            'Accept: application/vnd.github.raw+json',
        ], { cwd: this.cwd, signal, timeoutMs: 60000, maxBytes: 64 * 1024 * 1024 });
        if (!succeeded(response))
            throw new Error(redact(response.stderr || response.error || 'Archive read exceeded its bound or failed'));
        const content = response.stdout;
        const expected = /^(?:objects|manifests)\/([0-9a-f]{64})(?:\.json)?$/.exec(p.path)?.[1];
        if (expected && digest(content) !== expected)
            throw new Error('Archive content hash mismatch');
        return this.page(content, `${p.repository}/${p.ref}/${p.path}`, p.cursor, p.limit);
    }
    page(content, identity, cursor, limit) {
        if (!Number.isInteger(limit) || limit < 4 || limit > 16384)
            throw new Error('Invalid byte limit');
        const safe = redact(content), revision = digest(safe), key = digest(identity);
        let offset = 0;
        if (cursor) {
            const value = this.cursor.decode(cursor);
            if (value.identity !== key || value.revision !== revision || typeof value.offset !== 'number')
                throw new Error('Changed content or wrong section');
            offset = value.offset;
        }
        const page = bytePage(safe, offset, limit);
        return {
            text: page.text,
            revision,
            nextCursor: page.nextOffset === null
                ? null
                : this.cursor.encode({ identity: key, revision, offset: page.nextOffset }),
        };
    }
}
