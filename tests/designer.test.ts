import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { designCheck, designPath, designWrite } from '../src/designer.js';

const VALID = `---
kind: design
id: reject-invalid
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-01T00:00:00Z
status: draft
references:
  - docs/spec.md:1
problem: The compiler accepts invalid programs.
options:
  - Reject at parse time.
  - Reject at type-check time.
decision: Reject at type-check time.
acceptance:
  - An invalid program reports a diagnostic.
---

# Reject invalid programs

## Objective
Reject invalid programs before execution.

## Invariants
Every input either compiles or reports a diagnostic.

## Boundaries
The parser is unchanged.

## Decisions
Selected: type-check time. Evidence: docs/spec.md:1.

## Acceptance
An invalid program reports a diagnostic.

## References
docs/spec.md:1
`;

test('designer paths stay workspace-relative and out of fs/ and forge/', () => {
  assert.deepEqual(designPath('/w', 'design/a.md'), {
    absolute: '/w/design/a.md',
    rel: 'design/a.md',
  });
  for (const path of ['/etc/x', '../x', 'fs/x.md', 'forge/x.md'])
    assert.throws(() => designPath('/w', path));
});

test('a valid design passes and each violated invariant fails', () => {
  assert.equal(designCheck('/w', 'design/a.md', VALID).ok, true);
  const bad = [
    '# no front matter',
    VALID.replace('kind: design', 'kind: note'),
    VALID.replace('status: draft', 'status: draft\ncoverage: 100'),
    VALID.replace('The parser is unchanged.', 'Coverage is 100%.'),
    VALID.replace('problem: The compiler accepts invalid programs.', 'problem: Coverage is 100%.'),
    VALID.replace('## Acceptance', '## Objective'),
    VALID.replace(
      'Every input either compiles or reports a diagnostic.',
      'The compiler rejects valid programs. The compiler never rejects valid programs.',
    ),
  ];
  for (const content of bad)
    assert.equal(designCheck('/w', 'design/a.md', content).ok, false, content.slice(0, 40));
});

test('writeDesign writes once and refuses to amend', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deus-designer-'));
  try {
    assert.equal((await designWrite(root, 'design/a.md', VALID)).status, 'written');
    assert.match(await readFile(join(root, 'design/a.md'), 'utf8'), /kind: design/);
    await assert.rejects(designWrite(root, 'design/a.md', VALID), /never amends/);
    await assert.rejects(designWrite(root, 'fs/a.md', VALID), /fs\//);
    assert.equal((await designWrite(root, 'design/b.md', '# x')).status, 'rejected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
