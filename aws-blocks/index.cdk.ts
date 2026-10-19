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

// Add web hosting only when deploying (not in sandbox mode).
// Next.js SSR: the app uses App Router server components, `'use server'`
// actions and `redirect()`, and next.config.mjs has no `output: 'export'`,
// so the OpenNext adapter (framework: 'nextjs') builds assets + SSR compute.
// Passing `api: blocksStack` proxies the Blocks API through the same
// CloudFront domain (single origin, no CORS) and injects BLOCKS_API_URL
// into the SSR compute at deploy.
if (!sandboxMode) {
  new Hosting(blocksStack, 'Web', {
    root: join(__dirname, '..'),
    framework: 'nextjs',
    // Runs from the repo root via corepack (packageManager pins the pnpm
    // version); the root package.json uses pnpm-only `workspace:*` syntax.
    buildCommand: 'corepack pnpm run build',
    api: blocksStack,
  });
}
