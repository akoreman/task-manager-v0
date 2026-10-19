import { startDevServer } from '@aws-blocks/blocks/scripts';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.env.BLOCKS_API_URL ??= 'http://localhost:3000/aws-blocks/api';

startDevServer({
  backendPath: join(__dirname, '..', 'index.ts'),
  frontendCommand: 'npx next dev --port 3100',
  frontendPort: 3100,
});
