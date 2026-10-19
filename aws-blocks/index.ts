/**
 * Backend — aws-blocks/index.ts
 *
 * Building Blocks for the task manager app.
 *
 * Only export `ApiNamespace` instances from this file: the generated client
 * turns any other export (e.g. `db`, `sql`, `auth`) into a bogus RPC proxy.
 *
 * A later task wires the Next.js frontend to the exported `api` namespace.
 */
import {
  Scope,
  Database,
  AuthBasic,
  ApiNamespace,
  ApiError,
  sql,
} from '@aws-blocks/blocks';

// Note: not exported — only ApiNamespace instances may be exported from here.
const scope = new Scope('task-manager-v0');

// Relational data lives in the Database block. Migrations in
// ./aws-blocks/migrations are applied on first query locally (PGlite) and
// during deploy on AWS (Aurora Serverless v2). Path is relative to the
// project root, resolved at synth time.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// Email/password auth replaces the former Better Auth setup in lib/auth.ts:
// the Database block only exposes Aurora through the RDS Data API, so there is
// no DATABASE_URL connection string for Better Auth's `pg` adapter.
//
// The username is the user's email address (the sign-in/sign-up forms collect
// email + password, so the email is passed as `username` on every auth call).
//
// No `codeDelivery`: the old config used
// `emailAndPassword: { enabled: true, autoSignIn: true }` with no email
// verification, so sign-up stays immediate with no confirmation step.
//
// `crossDomain` stays at its default `false`: the frontend and
// /aws-blocks/api are served from the same CloudFront front door, so the
// SameSite=Lax session cookie is correct (the dev-only `sameSite: 'none'`
// override and the trustedOrigins/VERCEL_* URL logic are not ported).
//
// Not exported: the generated client would turn it into a bogus RPC proxy.
// The API block uses it via auth.requireAuth(context) / auth.getCurrentUser(context).
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7, // matches the previous session.expiresIn of 7 days
  passwordPolicy: { minLength: 8 }, // matches the form's minLength={8}
});

// The export name becomes the client namespace: `import { authApi } from 'aws-blocks'`.
export const authApi = auth.createApi();

// Status values ported from lib/db/schema.ts / app/actions/tasks.ts.
const STATUSES = ['todo', 'in_progress', 'done'];

type TaskRow = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
};

/**
 * Port of app/actions/tasks.ts plus the session/profile reads in app/page.tsx.
 *
 * ApiNamespace methods are public internet endpoints with no auth by default,
 * so every method except getProfile() calls auth.requireAuth(context) first
 * (this replaces the old getUserId() helper that threw 'Unauthorized').
 *
 * `sql` tagged templates do not compose: each statement is written inline and
 * only scalar values are interpolated.
 */
export const api = new ApiNamespace(scope, 'api', (context) => ({
  // Replaces `auth.api.getSession()` in app/page.tsx: returns null when there
  // is no session so the pages can redirect to /sign-in.
  async getProfile(): Promise<{ userId: string; name: string } | null> {
    const user = await auth.getCurrentUser(context);
    if (!user) return null;

    const row = await db.queryOne<{ name: string }>(
      sql`SELECT "name" FROM "user" WHERE "id" = ${user.userId}`,
    );

    // Reproduces `session.user.name || session.user.email`
    // (username is the email address).
    return { userId: user.userId, name: row?.name || user.username };
  },

  // Keeps the display name the sign-up form collects, which Better Auth used
  // to persist into the "user" table on sign-up.
  async saveProfile(name: string): Promise<void> {
    const user = await auth.requireAuth(context);

    await db.execute(
      sql`INSERT INTO "user" ("id", "name", "email") VALUES (${user.userId}, ${name}, ${user.username}) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
    );
  },

  async getTasks(): Promise<TaskRow[]> {
    const user = await auth.requireAuth(context);

    return db.query<TaskRow>(
      sql`SELECT "id", "userId", "title", "status", "createdAt" FROM "tasks" WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string): Promise<void> {
    const user = await auth.requireAuth(context);

    const trimmed = title.trim();
    if (!trimmed) return; // same no-op as the server action
    const bounded = trimmed.slice(0, 500);

    // "status" and "createdAt" come from the schema defaults.
    await db.execute(
      sql`INSERT INTO "tasks" ("userId", "title") VALUES (${user.userId}, ${bounded})`,
    );
  },

  async updateTaskStatus(id: number, status: string): Promise<void> {
    const user = await auth.requireAuth(context);

    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);

    await db.execute(
      sql`UPDATE "tasks" SET "status" = ${status} WHERE "id" = ${id} AND "userId" = ${user.userId}`,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const user = await auth.requireAuth(context);

    await db.execute(
      sql`DELETE FROM "tasks" WHERE "id" = ${id} AND "userId" = ${user.userId}`,
    );
  },
}));
