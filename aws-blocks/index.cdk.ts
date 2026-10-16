import * as cdk from 'aws-cdk-lib';

import { Hosting, BlocksStack, BlocksPresets } from '@aws-blocks/blocks/cdk';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getStackName } from '@aws-blocks/blocks/scripts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new cdk.App();

cdk.Tags.of(app).add("aws-mcp:deploy:sop", "migrate-to-blocks-freeform");

const sandboxMode = app.node.tryGetContext('sandboxMode') === 'true';
const projectRoot = app.node.tryGetContext('projectRoot') || process.cwd();

const stackName = getStackName({ sandbox: sandboxMode, projectRoot });
export const blocksStack = await BlocksStack.create(app, stackName, {
  backendHandlerPath: join(__dirname, 'index.handler.ts'),
  backendCDKPath: join(__dirname, 'index.ts'),
  defaults: sandboxMode ? BlocksPresets.sandbox : BlocksPresets.production,
});

// Add Next.js SSR hosting only when deploying (not in sandbox mode)
if (!sandboxMode) {
  new Hosting(blocksStack, 'Hosting', {
    // The Next.js app lives at the repository root (app/, components/, next.config.mjs).
    root: join(__dirname, '..'),
    // Server rendering: async server components, 'use server' actions and
    // per-request cookie checks/redirects — keep SSR (not 'spa'/'static').
    framework: 'nextjs',
    // pnpm-only workspace syntax ("workspace:*") and no bare pnpm/next on PATH
    // at deploy time; corepack resolves the pinned `packageManager` version.
    buildCommand: 'corepack pnpm run build',
    // CloudFront proxies /aws-blocks/* to the API on the same domain: keeps the
    // session cookie first-party, avoids CORS, injects BLOCKS_API_URL into SSR.
    api: blocksStack,
  });
}
