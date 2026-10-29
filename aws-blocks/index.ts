import {
  Scope,
  Database,
  sql,
  AuthCognito,
  ApiNamespace,
  ApiError,
  type BlocksContext,
} from '@aws-blocks/blocks';

const scope = new Scope('task-manager-v0');

const db = new Database(scope, 'main', { migrationsPath: './aws-blocks/migrations' });

// Replaces better-auth (email + password, 8-char minimum).
// signInWith 'email' is destructive to change after the first deploy.
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

// State machine for the sign-in / sign-up UI.
export const authApi = auth.createApi();

export interface AppUser {
  id: string;
  name: string;
  email: string;
}

export interface Task {
  id: number;
  userId: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  createdAt: string;
}

export type TaskStatus = Task['status'];

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

interface TaskRow {
  id: number | string;
  userId: string;
  title: string;
  status: TaskStatus;
  createdAt: string | Date;
}

/**
 * Resolve the signed-in Cognito user to a row in "user", creating or
 * relinking (by email) as needed. Throws 401 when signed out.
 */
async function ensureUser(context: BlocksContext, name?: string): Promise<AppUser> {
  const u = await auth.requireAuth(context);
  const email = u.attributes.email;
  if (!email) {
    throw new ApiError('Signed-in account has no email address', 400);
  }
  const newName = typeof name === 'string' ? name.trim() : '';

  return db.transaction(async (tx) => {
    // (a) Already linked to this Cognito account.
    const linked = await tx.queryOne<AppUser>(
      sql`SELECT "id", "name", "email" FROM "user" WHERE "cognitoSub" = ${u.userSub}`,
    );
    if (linked) {
      if (newName) {
        await tx.execute(
          sql`UPDATE "user" SET "name" = ${newName}, "updatedAt" = now() WHERE "id" = ${linked.id}`,
        );
        return { ...linked, name: newName };
      }
      return linked;
    }

    // (b) Existing row with the same email (e.g. pre-migration user): relink, keep its id.
    const byEmail = await tx.queryOne<AppUser>(
      sql`SELECT "id", "name", "email" FROM "user" WHERE "email" = ${email}`,
    );
    if (byEmail) {
      if (newName) {
        await tx.execute(
          sql`UPDATE "user" SET "cognitoSub" = ${u.userSub}, "name" = ${newName}, "updatedAt" = now() WHERE "id" = ${byEmail.id}`,
        );
        return { ...byEmail, name: newName };
      }
      await tx.execute(
        sql`UPDATE "user" SET "cognitoSub" = ${u.userSub}, "updatedAt" = now() WHERE "id" = ${byEmail.id}`,
      );
      return byEmail;
    }

    // (c) Brand-new user.
    const created = await tx.queryOne<AppUser>(
      sql`INSERT INTO "user" ("id", "name", "email", "emailVerified", "cognitoSub")
          VALUES (${u.userSub}, ${newName || email}, ${email}, true, ${u.userSub})
          RETURNING "id", "name", "email"`,
    );
    if (!created) {
      throw new ApiError('Failed to create user', 500);
    }
    return created;
  });
}

export const api = new ApiNamespace(scope, 'api', (context) => ({
  /** Called by the sign-up UI after the first sign-in with the name entered at sign-up. */
  async syncUser(name?: string): Promise<AppUser> {
    const user = await ensureUser(context, name);
    return { id: user.id, name: user.name, email: user.email };
  },

  /** Session check + displayed name for server pages. */
  async getCurrentUser(): Promise<AppUser> {
    const user = await ensureUser(context);
    return { id: user.id, name: user.name, email: user.email };
  },

  /** Tasks of the signed-in user, oldest first. */
  async getTasks(): Promise<Task[]> {
    const me = await ensureUser(context);
    const rows = await db.query<TaskRow>(
      sql`SELECT "id", "userId", "title", "status", "createdAt" FROM tasks WHERE "userId" = ${me.id} ORDER BY "createdAt" ASC`,
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
    const me = await ensureUser(context);
    const trimmed = typeof title === 'string' ? title.trim() : '';
    if (!trimmed) return;
    await db.execute(
      sql`INSERT INTO tasks ("userId", "title") VALUES (${me.id}, ${trimmed.slice(0, 500)})`,
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const me = await ensureUser(context);
    if (!STATUSES.includes(status)) {
      throw new ApiError('Invalid status', 400);
    }
    await db.execute(
      sql`UPDATE tasks SET "status" = ${status} WHERE "id" = ${id} AND "userId" = ${me.id}`,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const me = await ensureUser(context);
    await db.execute(sql`DELETE FROM tasks WHERE "id" = ${id} AND "userId" = ${me.id}`);
  },
}));
