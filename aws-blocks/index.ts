import { AuthCognito, ApiError, sql, Database, Scope, ApiNamespace } from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

// Aurora Serverless v2 (RDS Data API) on AWS; PGlite in .bb-data/ locally.
// Query rules: every query is an inline `sql` tagged template (interpolations are
// bind parameters and do not compose). Timestamps come back as strings on AWS
// but as Date locally — normalize before returning.
const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });


// Replaces better-auth (email + password). The email is the Cognito username.
// better-auth's only password rule was min length 8. `signInWith` is destructive
// to change after the first deploy.
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

// State machine for sign-in / sign-up / confirm / sign-out (client namespace = `authApi`).
export const authApi = auth.createApi();

type AppUser = { id: string; name: string; email: string };

/**
 * Resolve the signed-in Cognito user to the app's "user" row, creating or
 * relinking it as needed. better-auth used to insert this row at sign-up; this
 * upsert replaces that and must run before any task insert (FK on tasks.userId).
 * Existing rows are linked via "cognitoSub" (user.id is never rewritten because
 * FKs referencing it are not ON UPDATE CASCADE).
 */
async function ensureUser(
  context: Parameters<typeof auth.requireAuth>[0],
  name?: string,
): Promise<AppUser> {
  const u = await auth.requireAuth(context); // 401 NotAuthenticatedException when signed out
  const sub = u.userSub;
  const email = (u.attributes.email ?? '').trim().toLowerCase();
  if (!email) throw new ApiError('Signed-in user has no email address', 400);

  // 1. Already linked.
  const linked = await db.queryOne<AppUser>(
    sql`SELECT "id","name","email" FROM "user" WHERE "cognitoSub" = ${sub}`,
  );
  if (linked) {
    if (name && name !== linked.name) {
      await db.execute(
        sql`UPDATE "user" SET "name" = ${name}, "updatedAt" = now() WHERE "id" = ${linked.id}`,
      );
      return { ...linked, name };
    }
    return linked;
  }

  // 2. Relink an existing (copied) row by email — keeps its old id so tasks stay linked.
  const relinked = await db.queryOne<AppUser>(
    sql`UPDATE "user" SET "cognitoSub" = ${sub}, "updatedAt" = now() WHERE "email" = ${email} AND "cognitoSub" IS NULL RETURNING "id","name","email"`,
  );
  if (relinked) return relinked;

  // 3. New user. ON CONFLICT DO NOTHING covers id, email, and cognitoSub uniqueness.
  const displayName = name || u.attributes.name || email;
  const inserted = await db.queryOne<AppUser>(
    sql`INSERT INTO "user" ("id","name","email","emailVerified","cognitoSub") VALUES (${sub}, ${displayName}, ${email}, ${true}, ${sub}) ON CONFLICT DO NOTHING RETURNING "id","name","email"`,
  );
  if (inserted) return inserted;

  // Lost a race with a concurrent request, or the email belongs to another identity.
  const again = await db.queryOne<AppUser>(
    sql`SELECT "id","name","email" FROM "user" WHERE "cognitoSub" = ${sub}`,
  );
  if (again) return again;
  throw new ApiError('An account with this email already exists', 409);
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Task = {
  id: number;
  userId: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
};

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

// Replaces app/actions/tasks.ts ('use server'). Every method is gated by
// ensureUser → auth.requireAuth (401 when signed out). revalidatePath is dropped;
// the client calls router.refresh() after mutations.
export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getMe(): Promise<{ name: string; email: string }> {
    const me = await ensureUser(context);
    return { name: me.name, email: me.email };
  },

  async syncUser(name?: string): Promise<{ name: string; email: string }> {
    const me = await ensureUser(
      context,
      (typeof name === 'string' ? name.trim().slice(0, 200) : '') || undefined,
    );
    return { name: me.name, email: me.email };
  },

  async getTasks(): Promise<Task[]> {
    const me = await ensureUser(context);
    const rows = await db.query<Omit<Task, 'createdAt'> & { createdAt: string | Date }>(
      sql`SELECT "id","userId","title","status","createdAt" FROM "tasks" WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      userId: r.userId,
      title: r.title,
      status: r.status,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  },

  async createTask(title: string): Promise<void> {
    const me = await ensureUser(context);
    const trimmed = typeof title === 'string' ? title.trim() : '';
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO "tasks" ("userId","title") VALUES (${me.id}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const me = await ensureUser(context);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await db.execute(
      sql`UPDATE "tasks" SET "status" = ${status} WHERE "id" = ${Number(id)} AND "userId" = ${me.id}`,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const me = await ensureUser(context);
    await db.execute(
      sql`DELETE FROM "tasks" WHERE "id" = ${Number(id)} AND "userId" = ${me.id}`,
    );
  },
}));

