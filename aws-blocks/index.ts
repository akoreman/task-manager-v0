import { Scope, Database, AuthCognito, ApiNamespace, ApiError, sql, type BlocksContext } from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });

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

export const authApi = auth.createApi();

type AppUser = { id: string; name: string; email: string };

/**
 * Resolve (or create) the app's "user" row for the signed-in Cognito user.
 * Every gated API method calls this first so the row exists before task inserts.
 */
async function getAppUser(context: BlocksContext, name?: string): Promise<AppUser> {
  const u = await auth.requireAuth(context);
  const sub = u.userSub;
  const email = u.attributes.email ?? '';

  // (a) Already linked
  let row = await db.queryOne<AppUser>(
    sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${sub}`
  );

  // (b) Relink a pre-existing (better-auth) row by email; never rewrite id
  if (!row && email) {
    row = await db.queryOne<AppUser>(
      sql`UPDATE "user" SET "cognitoSub" = ${sub}, "updatedAt" = now() WHERE lower(email) = lower(${email}) AND "cognitoSub" IS NULL RETURNING id, name, email`
    );
  }

  // (c) Create a fresh row
  if (!row) {
    await db.execute(
      sql`INSERT INTO "user" (id, name, email, "emailVerified", "cognitoSub") VALUES (${sub}, ${name?.trim() ?? ''}, ${email}, true, ${sub}) ON CONFLICT DO NOTHING`
    );
    row = await db.queryOne<AppUser>(
      sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${sub}`
    );
    if (!row) {
      throw new ApiError('An account with this email already exists', 409);
    }
  }

  // (d) Backfill an empty name
  const trimmed = name?.trim() ?? '';
  if (trimmed && row.name === '') {
    await db.execute(
      sql`UPDATE "user" SET name = ${trimmed}, "updatedAt" = now() WHERE id = ${row.id}`
    );
    row = { ...row, name: trimmed };
  }

  return { id: row.id, name: row.name, email: row.email };
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export type Task = {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string | Date;
};

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async me() {
    const me = await getAppUser(context);
    return { id: me.id, name: me.name, email: me.email };
  },

  async ensureUser(name?: string) {
    const me = await getAppUser(context, name);
    return { id: me.id, name: me.name, email: me.email };
  },

  async getTasks(): Promise<Task[]> {
    const me = await getAppUser(context);
    return db.query<Task>(
      sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`
    );
  },

  async createTask(title: string): Promise<void> {
    const me = await getAppUser(context);
    const trimmed = (title ?? '').trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${me.id}, ${trimmed.slice(0, 500)})`
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const me = await getAppUser(context);
    if (!STATUSES.includes(status)) {
      throw new ApiError('Invalid status', 400);
    }
    await db.execute(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${me.id}`
    );
  },

  async deleteTask(id: number): Promise<void> {
    const me = await getAppUser(context);
    await db.execute(
      sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${me.id}`
    );
  },
}));

