import {
  ApiError,
  ApiNamespace,
  AuthBasic,
  Database,
  Scope,
  sql,
} from '@aws-blocks/blocks';

/**
 * Backend scope for the task manager app.
 *
 * Only ApiNamespace instances may be exported from this file — the generated
 * client turns any other export into an RPC proxy.
 */
const scope = new Scope('task-manager-v0');

/**
 * Aurora Serverless v2 PostgreSQL in AWS, PGlite locally.
 *
 * `migrationsPath` is relative to the project root (the directory `cdk` /
 * deploy runs in) and is resolved at synth time. Keep `db` module-local: the
 * generated client would turn any non-ApiNamespace export into an RPC proxy.
 */
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

/**
 * Email + password sign-in with JWT sessions, replacing Better Auth.
 *
 * - no `codeDelivery` → sign-up needs no email confirmation, so the user can
 *   be signed in immediately afterwards (Better Auth's `autoSignIn: true`).
 * - `sessionDuration: 604800` → the previous 7-day session expiry.
 * - `crossDomain` stays at its default `false`: Hosting serves the site and
 *   the API from one CloudFront origin, so the `SameSite=Lax` session cookie
 *   is same-origin.
 */
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 604800,
  passwordPolicy: { minLength: 8 },
});

/**
 * The app's only API namespace. Every method is a public internet endpoint
 * unless it starts with `await auth.requireAuth(context)`; sign-up, sign-in,
 * sign-out and session lookup are intentionally public.
 *
 * AuthBasic errors (`AuthBasicErrors.InvalidCredentials`,
 * `UserAlreadyExists`, `InvalidPassword`) travel to the client with their
 * structured names, so they are deliberately not caught or re-wrapped.
 */
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async signUp(name: string, email: string, password: string) {
    await auth.signUp(email, password);
    // Sets the session cookie on the response — matches `autoSignIn: true`.
    const user = await auth.signIn(email, password, context);

    await db.sql`INSERT INTO "user" (id, name, email) VALUES (${user.userId}, ${name.trim().slice(0, 200)}, ${email}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now()`;

    return { userId: user.userId, name: name.trim().slice(0, 200), email };
  },

  async signIn(email: string, password: string) {
    const user = await auth.signIn(email, password, context);

    const rows = await db.sql<{
      name: string
    }>`SELECT name FROM "user" WHERE id = ${user.userId}`;
    const name = rows[0]?.name;

    return {
      userId: user.userId,
      name: name ?? user.username,
      email: user.username,
    };
  },

  async signOut() {
    await auth.signOut(context);
  },

  /** Replaces `auth.api.getSession({ headers: await headers() })`. */
  async getSession() {
    const user = await auth.getCurrentUser(context);
    if (!user) return null;

    const rows = await db.sql<{
      name: string
    }>`SELECT name FROM "user" WHERE id = ${user.userId}`;

    return {
      userId: user.userId,
      name: rows[0]?.name ?? user.username,
      email: user.username,
    };
  },

  /**
   * Replaces `getTasks()` in `app/actions/tasks.ts`.
   *
   * `requireAuth` throws a 401 before the body runs, so it replaces the old
   * `if (!session?.user) throw new Error('Unauthorized')` guard. Rows come
   * back scoped to the caller, oldest first (Drizzle's `asc(tasks.createdAt)`).
   * `createdAt` is a TIMESTAMP, which JSON-RPC serializes to an ISO string;
   * `id` stays a number (SERIAL).
   */
  async listTasks() {
    const user = await auth.requireAuth(context);

    return db.query<{
      id: number
      userId: string
      title: string
      status: string
      createdAt: string
    }>(sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`);
  },

  /**
   * Replaces `createTask(title)`. Empty titles are ignored (the old action
   * returned early) and titles are capped at 500 characters. `id` keeps its
   * SERIAL default and `status` its `'todo'` default.
   */
  async createTask(title: string) {
    const user = await auth.requireAuth(context);

    const trimmed = title.trim();
    if (!trimmed) return;

    await db.query(sql`INSERT INTO tasks ("userId", title) VALUES (${user.userId}, ${trimmed.slice(0, 500)})`);
  },

  /**
   * Replaces `updateTaskStatus(id, status)`. The status whitelist is the same
   * as the old `STATUSES` array; an invalid value is a client error (400), not
   * a 500. The `"userId"` predicate keeps the update scoped to the caller.
   */
  async updateTaskStatus(id: number, status: string) {
    const user = await auth.requireAuth(context);

    if (!['todo', 'in_progress', 'done'].includes(status)) {
      throw new ApiError('Invalid status', 400);
    }

    await db.query(sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${user.userId}`);
  },

  /** Replaces `deleteTask(id)`, scoped to the caller's own tasks. */
  async deleteTask(id: number) {
    const user = await auth.requireAuth(context);

    await db.query(sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${user.userId}`);
  },
}));
