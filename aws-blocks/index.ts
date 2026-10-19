/**
 * Backend — aws-blocks/index.ts
 *
 * Building Blocks for the task-manager app.
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * Only export `ApiNamespace` instances from this file. Any other export
 * (tables, auth helpers, `db`, `sql`, ...) is turned into a bogus RPC proxy by
 * the generated frontend client.
 *
 * Do NOT use local files, in-memory arrays, or local databases for
 * persistence — use Building Blocks for cloud persistence. They work locally
 * with automatic mocks and deploy to AWS with zero configuration.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  Scope,
  Database,
  AuthBasic,
  ApiNamespace,
  ApiError,
  sql,
} from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

// Relational data: Aurora Serverless v2 PostgreSQL in AWS, PGlite locally.
// Migrations in ./aws-blocks/migrations run automatically (PGlite on first
// local query, a CustomResource Lambda on deploy).
// Keep `db` module-local — only ApiNamespace instances may be exported.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// Email + password auth with JWT cookie sessions — replaces the previous
// better-auth setup (emailAndPassword, autoSignIn, no email verification, no
// social providers). The username is the user's email address. No
// `codeDelivery` (nothing is confirmed by email) and no `crossDomain`
// (Hosting serves the frontend and proxies /aws-blocks/* through the same
// CloudFront domain, so the default SameSite=Lax session cookie is correct).
// Keep `auth` module-local — only ApiNamespace instances may be exported.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7, // 7 days, matching session.expiresIn
  passwordPolicy: { minLength: 8 }, // matches the sign-up form's minLength={8}
});

export const authApi = auth.createApi();

type TaskRow = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
};

// Mirrors the previous TaskStatus union from lib/db/schema.ts.
const STATUSES = ['todo', 'in_progress', 'done'];

// Replaces the `use server` actions in app/actions/tasks.ts. ApiNamespace
// methods are public internet endpoints with no auth by default, so every
// method starts with `auth.requireAuth(context)` (throws 401) — that replaces
// the old `throw new Error('Unauthorized')` in getUserId().
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async listTasks() {
    const user = await auth.requireAuth(context);
    return await db.query<TaskRow>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim();
    if (!trimmed) return;
    await db.query(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.userId}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: string) {
    const user = await auth.requireAuth(context);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await db.query(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${user.userId}`,
    );
  },

  async deleteTask(id: number) {
    const user = await auth.requireAuth(context);
    await db.query(
      sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${user.userId}`,
    );
  },
}));
