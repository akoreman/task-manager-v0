/**
 * Backend — aws-blocks/index.ts
 *
 * Defines the Blocks scope for this app. Data, auth and API blocks are added
 * by the following migration tasks.
 *
 * Only `ApiNamespace` instances may be exported from this file — every other
 * export is turned into an RPC proxy by the generated client.
 */
import {
  Scope,
  Database,
  AuthBasic,
  ApiNamespace,
  ApiError,
  sql,
} from '@aws-blocks/blocks';

// Blocks are attached to this scope by the data/auth/API tasks.
const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 PostgreSQL (PGlite locally, persisted in .bb-data/).
// Migrations live in ./aws-blocks/migrations, resolved from the project root.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// `db` and `sql` are intentionally not exported — only ApiNamespace instances
// may be exported from this file. They are used by the API routes below.

// Email/password auth, replacing the previous self-hosted Better Auth setup.
// - sessionDuration 604800s = 7 days (Better Auth `expiresIn: 60 * 60 * 24 * 7`)
// - minLength 8 matches the sign-up form's `minLength={8}`
// - no `codeDelivery`: the app never had an email-verification/confirmation step,
//   so sign-up signs the user straight in (Better Auth `autoSignIn: true`)
// - no `crossDomain`: frontend and API share one CloudFront domain, so the
//   default `SameSite=Lax` session cookie is correct.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 604800,
  passwordPolicy: { minLength: 8 },
});

// The export name becomes the client namespace: `import { authApi } from 'aws-blocks'`.
// `auth` itself stays unexported; API routes use `await auth.requireAuth(context)`.
export const authApi = auth.createApi();

// --- Tasks + profile API ---------------------------------------------------
// Port of the former `app/actions/tasks.ts` server actions (Drizzle queries
// behind a Better Auth session check). Every method is a *public* endpoint
// unless it calls `requireAuth`, and the local mock enforces nothing — so each
// method starts with `await auth.requireAuth(context)` and every statement is
// scoped by `"userId"`, exactly like the old `and(eq(...), eq(...))` clauses.

type UserProfile = { name: string; email: string };
type TaskRow = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
};

const TASK_STATUSES = ['todo', 'in_progress', 'done'];

export const api = new ApiNamespace(scope, 'api', (context) => ({
  /**
   * Profile row for the signed-in user. The auth block owns credentials, so the
   * `"user"` row is created on first read — this keeps the header's old
   * `session.user.name || session.user.email` display working.
   */
  async getProfile(): Promise<UserProfile> {
    const user = await auth.requireAuth(context);
    const existing = await db.queryOne<UserProfile>(
      sql`SELECT name, email FROM "user" WHERE id = ${user.username}`,
    );
    if (existing) return existing;

    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${user.username}, ${user.username}, ${user.username})`,
    );
    return { name: user.username, email: user.username };
  },

  async saveProfile(name: string): Promise<void> {
    const user = await auth.requireAuth(context);
    const trimmed = name.trim();
    if (!trimmed) return;

    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${user.username}, ${trimmed}, ${user.username}) ON CONFLICT (id) DO UPDATE SET name = ${trimmed}, "updatedAt" = CURRENT_TIMESTAMP`,
    );
  },

  async getTasks(): Promise<TaskRow[]> {
    const user = await auth.requireAuth(context);
    return db.query<TaskRow>(
      sql`SELECT * FROM tasks WHERE "userId" = ${user.username} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string): Promise<void> {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim();
    if (!trimmed) return;
    const value = trimmed.slice(0, 500);

    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.username}, ${value})`,
    );
  },

  async updateTaskStatus(id: number, status: string): Promise<void> {
    const user = await auth.requireAuth(context);
    if (!TASK_STATUSES.includes(status)) {
      throw new ApiError('Invalid status', 400, {
        name: 'InvalidStatusException',
      });
    }

    await db.execute(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${user.username}`,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${user.username}`,
    );
  },
}));

