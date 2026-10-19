import {
  Scope,
  Database,
  AuthBasic,
  ApiNamespace,
  ApiError,
  sql,
} from '@aws-blocks/blocks';

// Blocks for this app are defined here.
// Only export ApiNamespace instances from this file.
const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 PostgreSQL in AWS, PGlite locally.
// `migrationsPath` is resolved from the directory `cdk` / deploy runs in.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// `db` and `sql` stay module-local (never exported) — the API routes below use
// them directly via the `sql` tagged-template API.

// Email/password authentication (replaces Better Auth).
// The username IS the user's email address, and `user.userId === user.username`.
// No `codeDelivery` → sign-up is immediate with no confirmation step, matching
// the previous `emailAndPassword: { enabled: true, autoSignIn: true }` setup.
// No `crossDomain` → frontend and API share the same CloudFront domain.
const auth = new AuthBasic(scope, 'auth', {
  passwordPolicy: { minLength: 8 },
  sessionDuration: 60 * 60 * 24 * 7, // matches the previous 7-day session
});

// State-machine auth API (`getAuthState` / `setAuthState`). The client
// namespace comes from this export name, so it must stay `authApi`.
export const authApi = auth.createApi();

// Task + profile RPC API (replaces the Next.js server actions in
// `app/actions/tasks.ts` and the session/profile read in the page header).
// ApiNamespace methods are public internet endpoints with no auth by default,
// so every method that touches user data calls `auth.requireAuth(context)`
// first. `user.username` is the email address and is used as the `"userId"`
// value, replacing the old Better Auth session user id.
type TaskStatus = 'todo' | 'in_progress' | 'done';
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

export const api = new ApiNamespace(scope, 'api', (context) => ({
  // Replaces `auth.api.getSession()` in the page header. Returns null when
  // there is no session; `name` falls back to the username (the email), which
  // reproduces `session.user.name || session.user.email`.
  async getCurrentUser() {
    const current = await auth.getCurrentUser(context);
    if (!current) return null;
    const profile = await db.queryOne<{ name: string }>(
      sql`SELECT name FROM "user" WHERE id = ${current.username}`,
    );
    return { username: current.username, name: profile?.name || current.username };
  },

  // Called by the sign-up form so the collected display name keeps showing in
  // the header. Upserts the signed-in user into the app profile table.
  async setDisplayName(name: string) {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${user.username}, ${name}, ${user.username})
          ON CONFLICT (id) DO UPDATE SET name = ${name}, "updatedAt" = NOW()`,
    );
    return { username: user.username, name };
  },

  async getTasks() {
    const user = await auth.requireAuth(context);
    return db.query<{
      id: number;
      userId: string;
      title: string;
      status: string;
      createdAt: Date | string;
    }>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks
          WHERE "userId" = ${user.username} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.username}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: string) {
    const user = await auth.requireAuth(context);
    if (!STATUSES.includes(status as TaskStatus)) {
      throw new ApiError('Invalid status', 400);
    }
    await db.execute(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${user.username}`,
    );
  },

  async deleteTask(id: number) {
    const user = await auth.requireAuth(context);
    await db.execute(
      sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${user.username}`,
    );
  },
}));
