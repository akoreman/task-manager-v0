import { Scope, Database, sql, AuthCognito, ApiNamespace, ApiError } from '@aws-blocks/blocks';
import type { CognitoUser } from '@aws-blocks/blocks';
import { withResumeRetry } from './resume-retry.js';

const scope = new Scope('task-manager-v0');

const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations', minCapacity: 0 });

const auth = new AuthCognito(scope, 'auth', {
  signInWith: 'email',
  selfSignUp: true,
  passwordPolicy: {
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireDigits: false,
    requireSymbols: false,
  },
});

export const authApi = auth.createApi();

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Task = { id: number; userId: string; title: string; status: string; createdAt: string | Date };

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

type AppUser = { id: string; name: string; email: string };

// better-auth created the "user" row; Cognito does not. Find it by the Cognito link,
// relink an existing row by email, or create a new one.
async function ensureAppUser(user: CognitoUser, deadline: number, name?: string): Promise<AppUser> {
  const email = user.attributes.email ?? user.username;

  const selectBySub = () =>
    withResumeRetry(
      () => db.queryOne<AppUser>(
        sql`SELECT "id", "name", "email" FROM "user" WHERE "cognitoSub" = ${user.userSub}`,
      ),
      deadline,
    );

  const existing = await selectBySub();
  if (existing) return existing;

  const relinked = await withResumeRetry(
    () => db.queryOne<AppUser>(
      sql`UPDATE "user" SET "cognitoSub" = ${user.userSub}, "emailVerified" = true, "updatedAt" = now()
          WHERE lower("email") = lower(${email}) AND "cognitoSub" IS NULL
          RETURNING "id", "name", "email"`,
    ),
    deadline,
  );
  if (relinked) return relinked;

  await withResumeRetry(
    () => db.execute(
      sql`INSERT INTO "user" ("id", "name", "email", "emailVerified", "cognitoSub")
          VALUES (${crypto.randomUUID()}, ${name?.trim() || email}, ${email}, true, ${user.userSub})
          ON CONFLICT DO NOTHING`,
    ),
    deadline,
  );

  const created = await selectBySub();
  if (!created) throw new ApiError('Account conflict', 409);
  return created;
}

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async syncUser(name?: string) {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const row = await ensureAppUser(user, deadline, name);
    const trimmed = name?.trim();
    if (trimmed && trimmed !== row.name) {
      await withResumeRetry(
        () => db.execute(
          sql`UPDATE "user" SET "name" = ${trimmed}, "updatedAt" = now() WHERE "id" = ${row.id}`,
        ),
        deadline,
      );
      return { name: trimmed, email: row.email };
    }
    return { name: row.name, email: row.email };
  },

  async getMe() {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const row = await ensureAppUser(user, deadline);
    return { name: row.name, email: row.email };
  },

  async getTasks(): Promise<Task[]> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureAppUser(user, deadline);
    return withResumeRetry(
      () => db.query<Task>(
        sql`SELECT "id", "userId", "title", "status", "createdAt" FROM tasks WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`,
      ),
      deadline,
    );
  },

  async createTask(title: string): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureAppUser(user, deadline);
    const trimmed = String(title ?? '').trim();
    if (!trimmed) return;
    const value = trimmed.slice(0, 500);
    await withResumeRetry(
      () => db.execute(sql`INSERT INTO tasks ("userId", "title") VALUES (${me.id}, ${value})`),
      deadline,
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureAppUser(user, deadline);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await withResumeRetry(
      () => db.execute(
        sql`UPDATE tasks SET "status" = ${status} WHERE "id" = ${id} AND "userId" = ${me.id}`,
      ),
      deadline,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureAppUser(user, deadline);
    await withResumeRetry(
      () => db.execute(sql`DELETE FROM tasks WHERE "id" = ${id} AND "userId" = ${me.id}`),
      deadline,
    );
  },
}));
