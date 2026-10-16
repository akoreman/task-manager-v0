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

// Add static site hosting only when deploying (not in sandbox mode)
if (!sandboxMode) {
  // Next.js SSR frontend: server components + `'use server'` actions, so keep
  // the Node server rendering path (`framework: 'nextjs'`), not 'spa'/'static'.
  // `api: blocksStack` makes CloudFront proxy `/aws-blocks/*` to the API on the
  // same domain — no CORS, and the auth `SameSite=Lax` session cookie works.
  new Hosting(blocksStack, 'Web', {
    root: join(__dirname, '..'),
    framework: 'nextjs',
    buildOutputDir: '.next',
    buildCommand: 'npm run build',
    api: blocksStack
  });
}
