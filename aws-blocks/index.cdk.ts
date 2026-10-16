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

// Add hosting only when deploying (not in sandbox mode)
if (!sandboxMode) {
  /**
   * Server-rendered Next.js 16 App Router site.
   *
   * - `framework: 'nextjs'` → the adapter runs OpenNext over `.next` and
   *   deploys the SSR Lambda; the pages read the session per request and
   *   redirect, so they cannot be prerendered as a SPA/static bundle.
   *   `buildOutputDir` is therefore unused and omitted.
   * - `buildCommand` runs at deploy time from the repo root, outside the
   *   execution sandbox, where only `corepack` is on PATH — and this is a
   *   pnpm workspace (`aws-blocks` is a `workspace:*` dependency).
   * - `api` adds the CloudFront behaviors that proxy `/aws-blocks/*` to the
   *   API Gateway origin, making site and API same-origin (so the AuthBasic
   *   `SameSite=Lax` session cookie works) and injecting `BLOCKS_API_URL` /
   *   `BLOCKS_CONFIG` into the SSR Lambda for the `withAuth` server calls.
   *
   * No `ssrDefaultTtl`: every route is per-user and must not be cached at
   * the edge.
   */
  new Hosting(blocksStack, 'Web', {
    root: projectRoot,
    framework: 'nextjs',
    buildCommand: 'corepack pnpm run build',
    api: blocksStack
  });
}
