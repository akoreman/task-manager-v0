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

// Next.js SSR hosting (CloudFront + OpenNext compute), deploy-time only
// (not in sandbox mode). `api: blocksStack` proxies `/aws-blocks/*` through the
// same CloudFront domain, so there is no CORS and `BLOCKS_API_URL` is injected
// into the SSR compute automatically.
if (!sandboxMode) {
  new Hosting(blocksStack, 'Hosting', {
    root: join(__dirname, '..'),
    framework: 'nextjs',
    buildCommand: 'corepack pnpm run build',
    api: blocksStack
  });
}
