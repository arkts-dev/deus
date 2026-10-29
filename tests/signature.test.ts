import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { DexterPlugin } from '../src/dexter.js';
import { verifyCommitSignature } from '../src/dexter-signature.js';
import { fixture, environment, program } from './fixture.js';

const signer = 'A'.repeat(40);
test('installed key verification is offline, allowlist changes are honored at the same commit, no mutations on refusal', async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, '.git'));
  environment(t, 'PATH', `${root}${delimiter}${process.env.PATH ?? ''}`);
  environment(t, 'DEUS_DEXTER_TRUSTED_FINGERPRINTS', signer);
  const marker = join(root, 'mutations');
  const executable = join(root, 'fixture-cli');
  await program(
    executable,
    `import { appendFileSync } from 'node:fs';
    if(process.argv[2] === '--version') console.log('fixture');
    else appendFileSync(${JSON.stringify(marker)}, 'x');`,
  );
  await program(
    join(root, 'git'),
    `
    if(process.argv.includes('rev-parse')) console.log('f'.repeat(40));
    else { console.error('[GNUPG:] VALIDSIG ${signer} 2026-10-27'); }
  `,
  );
  await program(
    join(root, 'gpg'),
    "throw new Error('Keyserver must not be contacted for an installed key');",
  );
  const client = new DexterPlugin(executable, root);
  assert.equal((await client.probe()).profile, 'dexter-signed');
  assert.equal(
    (await client.nudgeIssue({ workspace: root, issue: 'ISSUE-0001' })).status,
    'completed',
  );
  process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS = 'B'.repeat(40);
  const refused = await client.nudgeIssue({ workspace: root, issue: 'ISSUE-0001' });
  assert.equal(refused.status, 'rejected');
  assert.equal(refused.profile, 'unknown');
  assert.equal(await readFile(marker, 'utf8'), 'x');
  process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS = signer;
  await program(
    join(root, 'git'),
    `if(process.argv.includes('rev-parse')) console.log('f'.repeat(40));
    else { console.error('[GNUPG:] BADSIG invalid'); process.exitCode=1; }`,
  );
  assert.equal((await client.probe()).profile, 'unknown');
});

test('missing public keys are fetched only into an isolated keyring before verification', async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, '.git'));
  environment(t, 'PATH', `${root}${delimiter}${process.env.PATH ?? ''}`);
  environment(t, 'DEUS_DEXTER_TRUSTED_FINGERPRINTS', signer);
  environment(t, 'GNUPGHOME');
  const executable = join(root, 'fixture-cli');
  await program(executable, '');
  await program(
    join(root, 'git'),
    `if(process.argv.includes('rev-parse')) console.log('f'.repeat(40));
    else if(process.env.GNUPGHOME) console.error('[GNUPG:] VALIDSIG ${signer} 2026-10-27');
    else { console.error('[GNUPG:] NO_PUBKEY AAAAAAAAAAAAAAAA'); process.exitCode=1; }`,
  );
  const marker = join(root, 'keyring');
  await program(
    join(root, 'gpg'),
    `import {writeFileSync} from 'node:fs';
    writeFileSync(${JSON.stringify(marker)}, process.env.GNUPGHOME);`,
  );
  assert.equal((await verifyCommitSignature(executable, root)).error, null);
  const keyring = await readFile(marker, 'utf8');
  assert.match(keyring, /deus-gpg-/);
  await assert.rejects(readFile(join(keyring, 'pubring.kbx')), { code: 'ENOENT' });
});
