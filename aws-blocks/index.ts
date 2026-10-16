/**
 * Backend — aws-blocks/index.ts
 *
 * Defines the Building Blocks for this app (API, auth, data, storage).
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * Do NOT use local files, in-memory arrays, or local databases for persistence.
 * Use Building Blocks for cloud persistence and other common cloud abstractions.
 *
 * Only export `ApiNamespace` instances from this file — any other export
 * becomes a bogus RPC proxy in the generated client.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ApiError, ApiNamespace, AuthBasic, Database, Scope, sql } from '@aws-blocks/blocks';

// Blocks are attached to this scope by later tasks. Only `ApiNamespace`
// instances may be exported from this module.
const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 PostgreSQL in AWS, PGlite locally.
// `migrationsPath` stays relative to the project root: it is resolved at synth
// time from the directory `cdk` runs in (do NOT use `import.meta.url` — this
// module is ESM locally but bundled to CommonJS in Lambda).
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// NOTE: `db` and `sql` are intentionally NOT exported — only `ApiNamespace`
// instances may be exported from this module. Later tasks use them directly
// from this module scope (or via a local helper) inside route handlers.

// Replaces the self-hosted Better Auth setup (`lib/auth.ts`):
// email + password, 7-day session, immediate sign-up (no email confirmation,
// mirroring `emailAndPassword.autoSignIn: true`). The block signs its own JWT
// session cookie, so `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` are gone.
// No `crossDomain`: frontend and API share the same CloudFront domain.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7, // 7 days
  passwordPolicy: { minLength: 8 },
});

// Auth RPC for the app's existing custom sign-in / sign-up forms (the generic
// `Authenticator` UI component is intentionally not used).
//
// AuthBasic identifies users by `username`; we use the email address as the
// username, so `user.userId === user.username === email`. The display `name`
// lives in the `"user"` table.
//
// Typed AuthBasic errors (InvalidCredentials, UserAlreadyExists,
// InvalidPassword) propagate as `ApiError` with a readable `message` so the
// forms can keep showing `error.message`.
export const authApi = new ApiNamespace(scope, 'authApi', (context) => ({
  async signUp(name: string, email: string, password: string) {
    await auth.signUp(email, password);
    await db.execute(
      sql`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES (${email}, ${name}, ${email}, false) ON CONFLICT ("id") DO UPDATE SET "name" = ${name}, "updatedAt" = now()`,
    );
    // Reproduces Better Auth's `autoSignIn: true`.
    await auth.signIn(email, password, context);
    return { email, name };
  },

  async signIn(email: string, password: string) {
    const u = await auth.signIn(email, password, context);
    const row = await db.queryOne<{ name: string }>(
      sql`SELECT "name" FROM "user" WHERE "id" = ${u.userId}`,
    );
    return { email: u.username, name: row?.name ?? u.username };
  },

  async signOut() {
    await auth.signOut(context);
  },

  async getSession() {
    const u = await auth.getCurrentUser(context);
    if (!u) return null;
    const row = await db.queryOne<{ name: string }>(
      sql`SELECT "name" FROM "user" WHERE "id" = ${u.userId}`,
    );
    return { userId: u.userId, email: u.username, name: row?.name ?? u.username };
  },
}));

// Shape of a row in the "tasks" table. `"createdAt"` serializes as an ISO
// string over JSON-RPC; `"id"` stays a number. Not exported — only
// `ApiNamespace` instances may be exported from this module.
type Task = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
};

const TASK_STATUSES = ['todo', 'in_progress', 'done'];

// Replaces the four Drizzle server actions in `app/actions/tasks.ts`.
//
// Every `ApiNamespace` method is a public internet endpoint with no auth by
// default (and the local mock enforces nothing), so each method starts with
// `auth.requireAuth(context)` — the equivalent of the actions' `getUserId()`
// guard — and scopes every statement by `"userId" = user.userId` (the user id
// is the signed-in email). `revalidatePath` has no equivalent here: the client
// refetches after each mutation.
export const api = new ApiNamespace(scope, 'api', (context) => ({
  // Replaces `getTasks` — same `"createdAt"` ascending ordering.
  async listTasks() {
    const user = await auth.requireAuth(context);
    return db.query<Task>(
      sql`SELECT "id", "userId", "title", "status", "createdAt" FROM "tasks" WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`,
    );
  },

  // `"status"` keeps its 'todo' default and `"id"` stays the SERIAL value.
  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO "tasks" ("userId", "title") VALUES (${user.userId}, ${trimmed.slice(0, 500)})`,
    );
  },

  // The action threw `Error('Invalid status')`; `ApiError` carries a 400 status.
  async updateTaskStatus(id: number, status: string) {
    const user = await auth.requireAuth(context);
    if (!TASK_STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await db.execute(
      sql`UPDATE "tasks" SET "status" = ${status} WHERE "id" = ${id} AND "userId" = ${user.userId}`,
    );
  },

  async deleteTask(id: number) {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`DELETE FROM "tasks" WHERE "id" = ${id} AND "userId" = ${user.userId}`,
    );
  },
}));
