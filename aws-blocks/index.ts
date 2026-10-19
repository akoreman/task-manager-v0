/**
 * Backend — aws-blocks/index.ts
 *
 * Blocks are defined here. Only `ApiNamespace` instances may be exported from
 * this file — any other export becomes a bogus RPC proxy in the generated
 * client.
 */
import {
  ApiError,
  ApiNamespace,
  AuthBasic,
  Database,
  Scope,
  sql,
} from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 PostgreSQL in AWS, PGlite locally.
// `migrationsPath` is resolved from the directory `cdk`/deploy runs in, so it
// must stay exactly './aws-blocks/migrations'.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// `db` is intentionally NOT exported: only ApiNamespace instances may be
// exported from this file. API blocks defined here close over `db`.

// Email + password auth on Cognito, replacing the self-hosted Better Auth
// instance. No `codeDelivery` => sign-up completes immediately with no email
// verification step (Better Auth ran with `autoSignIn: true` and no
// verification). `crossDomain` stays at its default `false`: the frontend and
// API share one CloudFront domain, so the SameSite=Lax HttpOnly session cookie
// is correct.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7, // matches Better Auth session.expiresIn (7 days)
  passwordPolicy: { minLength: 8 },  // matches the sign-up form's minLength=8
});

// `auth` stays module-local so API blocks can call `auth.requireAuth(context)`.
// `authApi` is the only auth export; the client namespace comes from this name.
export const authApi = auth.createApi();

// App data types mirroring `aws-blocks/migrations/001_init.sql`.

type Task = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
};

type Profile = { name: string; email: string };

const STATUSES = ['todo', 'in_progress', 'done'];

/**
 * Task + profile RPC methods, ported from `app/actions/tasks.ts`.
 *
 * Every method is a public internet endpoint with no auth by default, so each
 * one starts with `auth.requireAuth(context)` — it throws 401
 * `SessionExpiredException`, matching the old `throw new Error('Unauthorized')`
 * guard. `user.username` (the sign-in email) is the owner key that now keys
 * `tasks."userId"`, the way Better Auth's `session.user.id` did.
 */
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getTasks(): Promise<Task[]> {
    const user = await auth.requireAuth(context);
    return db.query<Task>(
      sql`SELECT * FROM tasks WHERE "userId" = ${user.username} ORDER BY "createdAt" ASC`,
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

  async getProfile(): Promise<Profile | null> {
    const user = await auth.requireAuth(context);
    const row = await db.queryOne<Profile>(
      sql`SELECT name, email FROM "user" WHERE id = ${user.username}`,
    );
    return row ?? null;
  },

  async saveProfile(name: string): Promise<void> {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${user.username}, ${name}, ${user.username}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = CURRENT_TIMESTAMP`,
    );
  },
}));

