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

if (sandboxMode) {
  // Tell the runtime that cookies need cross-domain attributes: the client
  // (browser frontend, mobile app, or CLI) and the API on API Gateway sit on
  // different registrable domains.
  blocksStack.handler.addEnvironment('BLOCKS_SANDBOX', 'true');
}

// Host the Next.js app only when deploying (not in sandbox mode).
// The app stays SSR (App Router server components, server actions,
// revalidatePath), so the Next.js adapter runs an OpenNext build — no 'spa' /
// 'static' mode and no `output: 'export'`. `api: blocksStack` makes CloudFront
// proxy /aws-blocks/* to API Gateway on the same domain, so there is no CORS
// and the session cookie stays same-origin.
if (!sandboxMode) {
  new Hosting(blocksStack, 'Hosting', {
    // Repo root: package.json and next.config.mjs live here.
    root: join(__dirname, '..'),
    framework: 'nextjs',
    // pnpm workspace: root deps use workspace:*, and no bare pnpm/yarn/next
    // binary is on PATH at deploy time, so go through corepack.
    buildCommand: 'corepack pnpm run build',
    api: blocksStack,
  });
}