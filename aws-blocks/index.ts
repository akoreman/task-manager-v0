/**
 * Backend — aws-blocks/index.ts
 *
 * Define your Building Blocks (auth, tables, buckets, APIs) here.
 *
 * Only export `ApiNamespace` instances from this file — every other export
 * becomes a bogus RPC proxy in the generated `aws-blocks` client.
 */
import {
  Scope,
  Database,
  AuthBasic,
  ApiNamespace,
  ApiError,
  sql,
} from '@aws-blocks/blocks';

// Scope groups all blocks for this app. Blocks and ApiNamespaces are added below.
const scope = new Scope('task-manager-v0');

// Full PostgreSQL (Aurora Serverless v2 in AWS, PGlite locally).
// `migrationsPath` is repo-root relative — resolved at synth from the directory
// `cdk` / `npm run deploy` runs in.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// Username/password auth with an HttpOnly signed-JWT session cookie.
// Replaces Better Auth: the email address is used as the `username`.
// No `codeDelivery` → sign-up is immediate (Better Auth had `autoSignIn: true`
// and no confirmation step). No `crossDomain` → frontend and API share the
// same CloudFront domain.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7, // matches Better Auth's 7-day session
  passwordPolicy: { minLength: 8 }, // matches the sign-up form's minLength={8}
});

// State-machine auth API consumed by the frontend. The client namespace comes
// from this export name: `import { authApi } from 'aws-blocks'`.
export const authApi = auth.createApi();

// --- Task + session API ----------------------------------------------------
// Port of app/actions/tasks.ts. Drizzle queries become `sql` templates and the
// Better Auth session check becomes `auth.requireAuth(context)`.
// NOTE: ApiNamespace methods are public internet endpoints with no auth by
// default (the local mock enforces nothing), so every method that touches user
// data must call `requireAuth` itself.

const STATUSES = ['todo', 'in_progress', 'done'];

type TaskRow = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
};

export const api = new ApiNamespace(scope, 'api', (context) => ({
  /** Returns null when there is no session — pages redirect to /sign-in. */
  async getSession(): Promise<{
    userId: string;
    email: string;
    name: string;
  } | null> {
    const user = await auth.getCurrentUser(context);
    if (!user) return null;
    const profile = await db.queryOne<{ name: string }>(
      sql`SELECT name FROM "user" WHERE id = ${user.username}`,
    );
    return {
      userId: user.username,
      email: user.username,
      name: profile?.name ?? user.username,
    };
  },

  /** Upsert of the display name used by the header greeting. */
  async saveProfile(name: string): Promise<void> {
    const user = await auth.requireAuth(context);
    const trimmed = name.trim().slice(0, 255);
    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${user.username}, ${
        trimmed || user.username
      }, ${user.username}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now()`,
    );
  },

  async listTasks(): Promise<TaskRow[]> {
    const user = await auth.requireAuth(context);
    return db.query<TaskRow>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${user.username} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string): Promise<void> {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.username}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: string): Promise<void> {
    const user = await auth.requireAuth(context);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
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