/**
 * Backend — aws-blocks/index.ts
 *
 * Defines the Building Blocks for this app (data, auth, API).
 *
 * IMPORTANT: only export `ApiNamespace` instances from this file. Every other
 * export is turned into an RPC proxy by the generated client, which breaks it.
 */
import { Scope, Database, AuthBasic, ApiNamespace, ApiError, sql } from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 PostgreSQL in AWS, PGlite locally. Migrations in
// ./aws-blocks/migrations run automatically (first local query / deploy-time
// CustomResource). `db` and `sql` stay module-local on purpose.
const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });

// Username/password auth with an HttpOnly signed-JWT session cookie.
// 7-day sessions mirror the old Better Auth `session.expiresIn`; `minLength: 8`
// mirrors the sign-up form. No `codeDelivery` => sign-up completes immediately
// (equivalent to Better Auth's `autoSignIn: true`). `crossDomain` stays at its
// default `false`: the frontend and API share one CloudFront domain via
// Hosting's `/aws-blocks/*` proxy, so `SameSite=Lax` is correct.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7,
  passwordPolicy: { minLength: 8 },
});

// State-machine auth API for the frontend: `import { authApi } from 'aws-blocks'`.
// `auth` itself stays module-local so task methods can call
// `await auth.requireAuth(context)`.
export const authApi = auth.createApi();

// Task + profile API. Replaces the Next.js server actions in
// app/actions/tasks.ts (Drizzle queries + Better Auth session lookup).
// Methods are public unless they call `auth.requireAuth(context)` first, so
// every task method is gated on its first statement.
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async listTasks() {
    const user = await auth.requireAuth(context);
    return db.query<{
      id: number;
      userId: string;
      title: string;
      status: string;
      createdAt: string;
    }>(
      sql`SELECT * FROM tasks WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim().slice(0, 500);
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.userId}, ${trimmed})`,
    );
  },

  async updateTaskStatus(id: number, status: string) {
    const user = await auth.requireAuth(context);
    if (!['todo', 'in_progress', 'done'].includes(status)) {
      throw new ApiError('Invalid status', 400);
    }
    await db.execute(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${user.userId}`,
    );
  },

  async deleteTask(id: number) {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${user.userId}`,
    );
  },

  // Intentionally ungated: the sign-in, sign-up and home pages call this for
  // signed-out visitors and need `null` instead of a 401.
  async getCurrentUser() {
    const u = await auth.getCurrentUser(context);
    if (!u) return null;
    const profile = await db.queryOne<{ name: string }>(
      sql`SELECT name FROM profile WHERE "userId" = ${u.userId}`,
    );
    return { userId: u.userId, username: u.username, name: profile?.name ?? u.username };
  },

  // Called by the sign-up form after a successful sign-up so the display name
  // collected there is preserved (previously Better Auth `user.name`).
  async setProfileName(name: string) {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`INSERT INTO profile ("userId", name) VALUES (${user.userId}, ${name}) ON CONFLICT ("userId") DO UPDATE SET name = ${name}`,
    );
  },
}));
