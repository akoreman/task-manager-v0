/**
 * Backend — aws-blocks/index.ts
 *
 * Define your API, auth, data model and other Building Blocks here.
 * Only ApiNamespace instances may be exported from this file: the generated
 * client turns every other export into an RPC proxy.
 */
import {
  Scope,
  Database,
  AuthBasic,
  AuthBasicErrors,
  ApiNamespace,
  ApiError,
  sql,
} from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 PostgreSQL in AWS, PGlite locally. Migrations in
// ./aws-blocks/migrations run automatically and are tracked in _migrations.
// NOTE: migrationsPath is resolved from the directory cdk/deploy runs in, so it
// must stay repo-root relative. `db` is intentionally NOT exported.
const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
});

// Email/password auth, replacing Better Auth. Email is the identifier.
// No `codeDelivery`: Better Auth sent no verification code, so sign-up must
// stay immediate. No `crossDomain`: the frontend and the API share one
// CloudFront domain, so the default SameSite=Lax session cookie is correct.
// `auth` is intentionally NOT exported.
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 60 * 60 * 24 * 7, // 7 days, matching Better Auth expiresIn
  passwordPolicy: { minLength: 8 },
});

// Messages the current shadcn forms render via `error.message`.
const AUTH_ERRORS: Record<string, { message: string; status: number }> = {
  [AuthBasicErrors.InvalidCredentials]: {
    message: 'Invalid email or password',
    status: 401,
  },
  [AuthBasicErrors.UserAlreadyExists]: {
    message: 'An account with this email already exists',
    status: 409,
  },
  [AuthBasicErrors.InvalidPassword]: {
    message: 'Password must be at least 8 characters',
    status: 400,
  },
};

function rethrowAuthError(error: unknown): never {
  const name = (error as { name?: string } | null)?.name;
  const mapped = name ? AUTH_ERRORS[name] : undefined;
  if (mapped) {
    throw new ApiError(mapped.message, mapped.status, { name });
  }
  throw error;
}

// Auth RPC used by the app's own /sign-in and /sign-up pages (the Blocks
// Authenticator component is deliberately not used so the shadcn UI stays).
// Every method is public; `getSession` returns null when there is no session.
export const authApi = new ApiNamespace(scope, 'authApi', (context) => ({
  async signUp(email: string, password: string, name: string) {
    try {
      await auth.signUp(email, password);
      // Matches Better Auth's autoSignIn: set the session cookie right away.
      await auth.signIn(email, password, context);
    } catch (error) {
      rethrowAuthError(error);
    }

    await db.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${email}, ${name}, ${email}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    );

    return { userId: email, name };
  },

  async signIn(email: string, password: string) {
    try {
      const user = await auth.signIn(email, password, context);
      return { userId: user.userId };
    } catch (error) {
      rethrowAuthError(error);
    }
  },

  async signOut() {
    await auth.signOut(context);
  },

  async getSession() {
    const user = await auth.getCurrentUser(context);
    if (!user) return null;

    const profile = await db.queryOne<{ name: string; email: string }>(
      sql`SELECT name, email FROM "user" WHERE id = ${user.userId}`,
    );

    return {
      userId: user.userId,
      name: profile?.name ?? user.username,
      email: profile?.email ?? user.username,
    };
  },
}));

// Task CRUD, ported from app/actions/tasks.ts (Drizzle -> SQL). Every method
// calls auth.requireAuth first: it throws 401, replacing the old
// `throw new Error('Unauthorized')`. `user.userId` is the account email, which
// is what the old `session.user.id` held. Each statement keeps the per-user
// "userId" predicate — it is the app's only authorization check.
const TASK_STATUSES = ['todo', 'in_progress', 'done'];

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getTasks() {
    const user = await auth.requireAuth(context);
    // "createdAt" crosses the wire as an ISO string, so it is typed string.
    return db.query<{
      id: number;
      userId: string;
      title: string;
      status: string;
      createdAt: string;
    }>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${user.userId} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string) {
    const user = await auth.requireAuth(context);
    const trimmed = title.trim().slice(0, 500);
    if (!trimmed) return;
    // status defaults to 'todo' in the migration.
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${user.userId}, ${trimmed})`,
    );
  },

  async updateTaskStatus(id: number, status: string) {
    const user = await auth.requireAuth(context);
    if (!TASK_STATUSES.includes(status)) {
      throw new ApiError('Invalid status', 400, {
        name: 'InvalidStatusException',
      });
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
}));



