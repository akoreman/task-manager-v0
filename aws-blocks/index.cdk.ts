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
// The app server-renders (App Router server components + 'use server'
// actions), so the Next.js adapter runs the OpenNext build and provisions the
// SSR Lambda plus the static _next/* behaviors. `api: blocksStack` keeps the
// API on the same CloudFront origin (/aws-blocks/api) — same-site session
// cookie, no CORS — and injects BLOCKS_API_URL into the SSR Lambda.
if (!sandboxMode) {
  new Hosting(blocksStack, 'Web', {
    root: join(__dirname, '..'),
    framework: 'nextjs',
    buildOutputDir: '.next',
    buildCommand: 'npm run build',
    api: blocksStack,
  });
}
