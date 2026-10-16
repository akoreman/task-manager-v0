/**
 * Backend — aws-blocks/index.ts
 *
 * Building Blocks for the task-manager app are defined here.
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * Only export `ApiNamespace` instances from this file. Any other export
 * (db, sql, auth, ...) is turned into a bogus RPC proxy in the generated
 * frontend client.
 *
 * Do NOT use local files, in-memory arrays, or local databases for
 * persistence — use Building Blocks for cloud persistence and other common
 * cloud abstractions. They work locally with automatic mocks and deploy to
 * AWS with zero configuration.
 *
 * For the full list of blocks and how to use them, see:
 *   node_modules/@aws-blocks/blocks/README.md
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Scope, Database, AuthBasic, ApiNamespace, ApiError, sql } from '@aws-blocks/blocks';

// Not exported: only ApiNamespace instances may be exported from this file.
const scope = new Scope('task-manager-v0');
void scope;

// PostgreSQL database (Aurora Serverless v2 on deploy, PGlite locally).
// migrationsPath is resolved from the directory cdk/deploy runs in (project root).
const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });

// Email + password auth (replaces better-auth). sessionDuration matches the old
// `session.expiresIn` (7 days); minLength matches the sign-up form's minLength={8}.
// No `crossDomain`: frontend and API share one CloudFront domain, so the default
// SameSite=Lax cookie is correct. No `codeDelivery`: the old flow had no email
// confirmation, so signup stays immediate.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7,
  passwordPolicy: { minLength: 8 },
});

// The username is the email, so the user id is the email string — it fits the
// existing TEXT `user.id` column and `tasks."userId"` unchanged.
export const authApi = new ApiNamespace(scope, 'authApi', (context) => ({
  async signUp(name: string, email: string, password: string) {
    await auth.signUp(email, password);
    const user = await auth.signIn(email, password, context); // preserves autoSignIn
    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${user.userId}, ${name}, ${email}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now()`,
    );
    return { userId: user.userId, name, email };
  },

  async signIn(email: string, password: string) {
    const u = await auth.signIn(email, password, context);
    return { userId: u.userId };
  },

  async signOut() {
    await auth.signOut(context);
  },

  async getSession() {
    const u = await auth.getCurrentUser(context);
    if (!u) return null;
    const row = await db.queryOne<{ name: string; email: string }>(
      sql`SELECT name, email FROM "user" WHERE id = ${u.userId}`,
    );
    return { userId: u.userId, name: row?.name ?? u.username, email: row?.email ?? u.username };
  },
}));

// Task data operations (ported from app/actions/tasks.ts). Every method requires
// a session: the old actions threw `Unauthorized`, `requireAuth` throws 401.
// `createdAt` is normalized to an ISO string because it crosses the RPC boundary
// as JSON. `sql` tagged templates do not compose, so each statement is inline and
// only scalar values are interpolated (each becomes a bind parameter).
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getTasks() {
    const user = await auth.requireAuth(context);
    const rows = await db.query<{
      id: number;
      userId: string;
      title: string;
      status: string;
      createdAt: Date | string;
    }>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`,
    );
    return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
  },

  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim();
    if (!trimmed) return; // silent no-op, matching the old action
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.userId}, ${trimmed.slice(0, 500)})`,
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
    await db.execute(sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${user.userId}`);
  },
}));
