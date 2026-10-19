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

// Add hosting only when deploying (not in sandbox mode).
// Next.js SSR: async server components (app/page.tsx) and 'use server' actions
// (app/actions/tasks.ts) need server rendering, so the framework is pinned to
// 'nextjs' rather than relying on auto-detection. The Next.js adapter derives
// the output location from the build, so no `buildOutputDir`. Passing `api`
// makes CloudFront proxy `/aws-blocks/*` to the Blocks backend on the same
// domain (single origin, no CORS, first-party session cookie), and Hosting
// injects BLOCKS_API_URL into the SSR compute at synth.
if (!sandboxMode) {
  new Hosting(blocksStack, 'Hosting', {
    root: join(__dirname, '..'),
    framework: 'nextjs',
    buildCommand: 'npm run build',
    api: blocksStack
  });
}
