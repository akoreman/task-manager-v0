import { Scope, Database, sql } from '@aws-blocks/blocks';
import { AuthCognito, ApiNamespace, ApiError, DatabaseErrors, isBlocksError } from '@aws-blocks/blocks';
import type { BlocksContext } from '@aws-blocks/blocks';

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

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Task = { id: number; userId: string; title: string; status: string; createdAt: string };

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

type TaskRow = {
  id: number | string;
  userId: string;
  title: string;
  status: string;
  createdAt: string | Date;
};

/**
 * Resolve (or create) the app's "user" row for the signed-in Cognito user.
 * Existing better-auth rows are relinked by email so their id (tasks.userId) is kept.
 */
async function getAppUser(context: BlocksContext, name?: string): Promise<AppUser> {
  const cu = await auth.requireAuth(context);
  const sub = cu.userSub;
  const email = cu.attributes.email;
  if (!sub || !email) {
    throw new ApiError('Signed-in user has no email address', 400);
  }
  const wantedName = (name ?? '').trim().slice(0, 200);

  for (let attempt = 0; attempt < 2; attempt++) {
    // 1. Already linked to this Cognito identity.
    const linked = await db.queryOne<AppUser>(
      sql`SELECT "id","name","email" FROM "user" WHERE "cognitoSub" = ${sub}`
    );
    if (linked) {
      if (wantedName && !(linked.name ?? '').trim()) {
        await db.execute(
          sql`UPDATE "user" SET "name" = ${wantedName}, "updatedAt" = now() WHERE "id" = ${linked.id}`
        );
        return { id: linked.id, name: wantedName, email: linked.email };
      }
      return { id: linked.id, name: linked.name ?? '', email: linked.email };
    }

    // 2. Existing (better-auth) row with the same email: link it, keep its id.
    const byEmail = await db.queryOne<AppUser>(
      sql`SELECT "id","name","email" FROM "user" WHERE "email" = ${email}`
    );
    if (byEmail) {
      await db.execute(
        sql`UPDATE "user" SET "cognitoSub" = ${sub}, "updatedAt" = now() WHERE "id" = ${byEmail.id}`
      );
      let rowName = byEmail.name ?? '';
      if (wantedName && !rowName.trim()) {
        await db.execute(
          sql`UPDATE "user" SET "name" = ${wantedName}, "updatedAt" = now() WHERE "id" = ${byEmail.id}`
        );
        rowName = wantedName;
      }
      return { id: byEmail.id, name: rowName, email: byEmail.email };
    }

    // 3. Brand-new user.
    try {
      await db.execute(
        sql`INSERT INTO "user" ("id","name","email","emailVerified","cognitoSub") VALUES (${sub}, ${wantedName}, ${email}, ${true}, ${sub})`
      );
      return { id: sub, name: wantedName, email };
    } catch (e) {
      // A concurrent request (or a same-email row) won the race: re-run the lookups.
      if (isBlocksError(e, DatabaseErrors.UniqueConstraintViolation)) continue;
      throw e;
    }
  }
  throw new ApiError('Could not resolve user record', 409);
}

export const api = new ApiNamespace(scope, 'api', (context) => ({
  /** Called by the frontend after sign-in / sign-up to create or link the user row. */
  async ensureUser(name?: string) {
    const u = await getAppUser(context, name);
    return { name: u.name, email: u.email };
  },

  /** Current user's display info; the page shows `name || email`. */
  async getMe() {
    const u = await getAppUser(context);
    return { name: u.name, email: u.email };
  },

  /** Signed-in user's tasks, oldest first. */
  async listTasks(): Promise<Task[]> {
    const u = await getAppUser(context);
    const rows = await db.query<TaskRow>(
      sql`SELECT "id", "userId", "title", "status", "createdAt" FROM "tasks" WHERE "userId" = ${u.id} ORDER BY "createdAt" ASC`
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
    const u = await getAppUser(context);
    const trimmed = (title ?? '').trim();
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO "tasks" ("userId", "title") VALUES (${u.id}, ${trimmed.slice(0, 500)})`
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const u = await getAppUser(context);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await db.execute(
      sql`UPDATE "tasks" SET "status" = ${status} WHERE "id" = ${id} AND "userId" = ${u.id}`
    );
  },

  async deleteTask(id: number): Promise<void> {
    const u = await getAppUser(context);
    await db.execute(
      sql`DELETE FROM "tasks" WHERE "id" = ${id} AND "userId" = ${u.id}`
    );
  },
}));
