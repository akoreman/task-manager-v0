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

const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });

// better-auth only enforced 8+ characters; keep that rule so the sign-up form stays valid.
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

export type AppUser = { id: string; name: string; email: string };

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export type Task = { id: number; userId: string; title: string; status: string; createdAt: string };

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

type BlocksContext = Parameters<typeof auth.requireAuth>[0];

/**
 * Resolve (and create or relink if needed) the app's "user" row for the
 * signed-in Cognito user. Returns the app user id used as tasks."userId".
 */
async function ensureAppUser(context: BlocksContext, name?: string): Promise<AppUser> {
  const user = await auth.requireAuth(context);
  const sub = user.userSub;
  const email = user.attributes.email;
  if (!email) {
    throw new ApiError('Signed-in user has no email address', 400);
  }

  const applyName = async (row: AppUser): Promise<AppUser> => {
    if (name && name !== row.name) {
      const updated = await db.queryOne<AppUser>(
        sql`UPDATE "user" SET name = ${name}, "updatedAt" = now() WHERE id = ${row.id} RETURNING id, name, email`,
      );
      return updated ?? row;
    }
    return row;
  };

  // (a) already linked
  const linked = await db.queryOne<AppUser>(
    sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${sub}`,
  );
  if (linked) return applyName(linked);

  // (b) relink an existing (better-auth era) row by email, keeping its id
  const relinked = await db.queryOne<AppUser>(
    sql`UPDATE "user" SET "cognitoSub" = ${sub}, "updatedAt" = now() WHERE email = ${email} AND "cognitoSub" IS NULL RETURNING id, name, email`,
  );
  if (relinked) return applyName(relinked);

  // (c) brand-new user
  try {
    const created = await db.queryOne<AppUser>(
      sql`INSERT INTO "user" (id, name, email, "emailVerified", "cognitoSub") VALUES (${crypto.randomUUID()}, ${name ?? ''}, ${email}, ${true}, ${sub}) RETURNING id, name, email`,
    );
    if (created) return created;
  } catch (e) {
    if (!isBlocksError(e, DatabaseErrors.UniqueConstraintViolation)) throw e;
    // A concurrent request created/linked the row (email or cognitoSub unique) — re-select.
    const bySub = await db.queryOne<AppUser>(
      sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${sub}`,
    );
    if (bySub) return applyName(bySub);
    const byEmail = await db.queryOne<AppUser>(
      sql`SELECT id, name, email FROM "user" WHERE email = ${email}`,
    );
    if (byEmail) return applyName(byEmail);
    throw e;
  }
  throw new ApiError('Could not create user record', 500);
}

export const api = new ApiNamespace(scope, 'api', (context) => ({
  /** Called by the sign-up UI after the first sign-in to store the name typed at sign-up. */
  async syncUser(name?: string): Promise<{ name: string; email: string }> {
    const u = await ensureAppUser(context, name?.trim() || undefined);
    return { name: u.name, email: u.email };
  },

  async getMe(): Promise<{ name: string; email: string; userName: string }> {
    const u = await ensureAppUser(context);
    return { name: u.name, email: u.email, userName: u.name || u.email };
  },

  async getTasks(): Promise<Task[]> {
    const me = await ensureAppUser(context);
    return db.query<Task>(
      sql`SELECT id, "userId", title, status, "createdAt"::text AS "createdAt" FROM tasks WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`,
    );
  },

  async createTask(title: string): Promise<void> {
    const me = await ensureAppUser(context);
    const trimmed = String(title ?? '').trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", title) VALUES (${me.id}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const me = await ensureAppUser(context);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await db.execute(
      sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${me.id}`,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const me = await ensureAppUser(context);
    await db.execute(sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${me.id}`);
  },
}));
