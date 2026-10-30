import {
  Scope,
  Database,
  sql,
  AuthCognito,
  ApiNamespace,
  ApiError,
  isBlocksError,
  DatabaseErrors,
} from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 via RDS Data API (PGlite locally). Schema in ./aws-blocks/migrations.
const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });

export type TaskStatus = 'todo' | 'in_progress' | 'done';
const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

// createdAt normalized to ISO string (Data API returns strings, PGlite returns Date).
export type Task = { id: number; userId: string; title: string; status: string; createdAt: string };

// Cognito replaces better-auth email+password. Email is the username; the policy
// mirrors better-auth's default (min 8, no complexity) and the form's minLength={8}.
const auth = new AuthCognito(scope, 'auth', {
  signInWith: 'email',
  passwordPolicy: {
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireDigits: false,
    requireSymbols: false,
  },
});

// State machine for sign-up / confirm / sign-in / sign-out.
export const authApi = auth.createApi();

type AppUser = { id: string; name: string; email: string };
type AuthContext = Parameters<typeof auth.requireAuth>[0];

// Maps the signed-in Cognito user to the app's "user" row (created by better-auth
// previously). Lookup by cognitoSub → relink legacy row by email → insert.
async function resolveAppUser(context: AuthContext, name?: string): Promise<AppUser> {
  const cu = await auth.requireAuth(context); // 401 when signed out
  const email = cu.attributes.email;
  if (!email) throw new ApiError('Signed-in user has no email', 400);
  const newName = name?.trim();

  let row = await db.queryOne<AppUser>(
    sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${cu.userSub}`,
  );

  if (!row) {
    row = await db.queryOne<AppUser>(
      sql`UPDATE "user" SET "cognitoSub" = ${cu.userSub}, "updatedAt" = now()
          WHERE email = ${email} AND "cognitoSub" IS NULL
          RETURNING id, name, email`,
    );
  }

  if (!row) {
    const id = crypto.randomUUID();
    const displayName = newName || email;
    try {
      await db.execute(
        sql`INSERT INTO "user" (id, name, email, "emailVerified", "cognitoSub", "createdAt", "updatedAt")
            VALUES (${id}, ${displayName}, ${email}, ${true}, ${cu.userSub}, now(), now())`,
      );
      return { id, name: displayName, email };
    } catch (e) {
      if (!isBlocksError(e, DatabaseErrors.UniqueConstraintViolation)) throw e;
      row = await db.queryOne<AppUser>(
        sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${cu.userSub}`,
      );
      if (!row) throw new ApiError('An account with this email already exists', 409);
    }
  }

  if (newName && newName !== row.name) {
    await db.execute(
      sql`UPDATE "user" SET name = ${newName}, "updatedAt" = now() WHERE id = ${row.id}`,
    );
    row = { ...row, name: newName };
  }

  return { id: row.id, name: row.name, email: row.email };
}

export const api = new ApiNamespace(scope, 'api', (context) => ({
  // Called by the frontend right after sign-in / sign-up to link/create the app user row.
  async syncUser(name?: string) {
    const u = await resolveAppUser(context, name);
    return { name: u.name, email: u.email };
  },

  // Replaces `session.user.name || session.user.email`.
  async getMe() {
    const u = await resolveAppUser(context);
    return { name: u.name, email: u.email };
  },

  // Ported from app/actions/tasks.ts (revalidatePath → frontend router.refresh()).
  async getTasks(): Promise<Task[]> {
    const me = await resolveAppUser(context);
    const rows = await db.query<{
      id: number | string;
      userId: string;
      title: string;
      status: string;
      createdAt: string | Date;
    }>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      userId: row.userId,
      title: row.title,
      status: row.status,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  },

  async createTask(title: string): Promise<void> {
    const me = await resolveAppUser(context);
    const trimmed = String(title ?? '').trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${me.id}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const me = await resolveAppUser(context);
    if (!TASK_STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await db.execute(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${me.id}`,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const me = await resolveAppUser(context);
    await db.execute(sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${me.id}`);
  },
}));
