#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDeusServer } from './mcp.js';
import { redact } from './process.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(
    'Usage: deus-mcp --workspace /absolute/server/workspace\nMCP over stdio; supports SSH without a TTY. Requires Node >=22.19.',
  );
} else {
  try {
    if (args.length !== 2 || args[0] !== '--workspace' || !args[1])
      throw new Error('Usage: deus-mcp --workspace /absolute/server/workspace');
    const app = await createDeusServer(args[1]);
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      void app.close().catch((error) => {
        console.error(redact(String(error)));
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    process.once('SIGHUP', shutdown);
    process.stdin.once('end', shutdown);
    process.stdout.once('error', shutdown);
    await app.server.connect(new StdioServerTransport());
  } catch (error) {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
