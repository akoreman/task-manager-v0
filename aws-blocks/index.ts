import { Scope, Database, AuthCognito, ApiError, ApiNamespace, sql } from '@aws-blocks/blocks';
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

type UserRow = { id: string; name: string; email: string };

// Upserts the "user" row for a Cognito user (the old auth library used to create it).
async function ensureUser(user: CognitoUser, deadline: number, name?: string): Promise<UserRow> {
  const sub = user.userSub;
  const email = user.attributes.email ?? '';

  const findBySub = () =>
    withResumeRetry(
      () => db.queryOne<UserRow>(sql`SELECT id, name, email FROM "user" WHERE "cognitoSub" = ${sub}`),
      deadline,
    );

  const existing = await findBySub();
  if (existing) return existing;

  const relinked = await withResumeRetry(
    () =>
      db.queryOne<UserRow>(
        sql`UPDATE "user" SET "cognitoSub" = ${sub}, "updatedAt" = now() WHERE email = ${email} AND "cognitoSub" IS NULL RETURNING id, name, email`,
      ),
    deadline,
  );
  if (relinked) return relinked;

  const inserted = await withResumeRetry(
    () =>
      db.queryOne<UserRow>(
        sql`INSERT INTO "user" (id, name, email, "emailVerified", "cognitoSub") VALUES (${sub}, ${name || email}, ${email}, true, ${sub}) ON CONFLICT DO NOTHING RETURNING id, name, email`,
      ),
    deadline,
  );
  if (inserted) return inserted;

  const raced = await findBySub();
  if (raced) return raced;

  throw new ApiError('An account with this email already exists', 409);
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Task = { id: number; userId: string; title: string; status: string; createdAt: string | Date };

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getMe() {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureUser(user, deadline);
    return { name: me.name, email: me.email };
  },

  async syncUser(name?: string) {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureUser(user, deadline, name?.trim().slice(0, 200) || undefined);
    return { name: me.name, email: me.email };
  },

  async getTasks(): Promise<Task[]> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureUser(user, deadline);
    return withResumeRetry(
      () =>
        db.query<Task>(
          sql`SELECT id, "userId", title, status, "createdAt" FROM tasks WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`,
        ),
      deadline,
    );
  },

  async createTask(title: string): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureUser(user, deadline);
    const trimmed = (title ?? '').trim();
    if (!trimmed) return;
    const value = trimmed.slice(0, 500);
    await withResumeRetry(
      () => db.execute(sql`INSERT INTO tasks ("userId", title) VALUES (${me.id}, ${value})`),
      deadline,
    );
  },

  async updateTaskStatus(id: number, status: string): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    if (!STATUSES.includes(status as TaskStatus)) throw new ApiError('Invalid status', 400);
    const me = await ensureUser(user, deadline);
    await withResumeRetry(
      () => db.execute(sql`UPDATE tasks SET status = ${status} WHERE id = ${id} AND "userId" = ${me.id}`),
      deadline,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await auth.requireAuth(context);
    const me = await ensureUser(user, deadline);
    await withResumeRetry(
      () => db.execute(sql`DELETE FROM tasks WHERE id = ${id} AND "userId" = ${me.id}`),
      deadline,
    );
  },
}));
