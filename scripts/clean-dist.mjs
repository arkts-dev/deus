import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// dist is generated exclusively by this package's TypeScript build.
await rm(fileURLToPath(new URL('../dist/', import.meta.url)), { recursive: true, force: true });
