import { ApiNamespace, ApiError, sql } from '@aws-blocks/blocks';
import { scope, db, auth } from './resources.js';
import { getAppUser } from './users.js';
import { withResumeRetry } from './resume-retry.js';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: number;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
}

const STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];

interface TaskRow {
  id: number | string;
  userId: string;
  title: string;
  status: string;
  createdAt: string | Date;
}

// "createdAt" is `timestamp` (no time zone, written by now() in UTC).
// Deployed (Data API) it arrives as a string like "2024-01-01 12:00:00.123";
// locally it arrives as a Date.
function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim().replace(' ', 'T');
  const hasZone = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(s);
  const d = new Date(hasZone ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getMe() {
    const deadline = Date.now() + 27_000;
    const user = await getAppUser(context, deadline);
    return { name: user.name, email: user.email };
  },

  async ensureUser(name?: string) {
    const deadline = Date.now() + 27_000;
    const user = await getAppUser(
      context,
      deadline,
      typeof name === 'string' ? name.slice(0, 200) : undefined,
    );
    return { name: user.name, email: user.email };
  },

  async getTasks(): Promise<Task[]> {
    const deadline = Date.now() + 27_000;
    const user = await getAppUser(context, deadline);
    const rows = await withResumeRetry(
      () => db.query<TaskRow>(
        sql`SELECT "id", "userId", "title", "status", "createdAt" FROM "tasks"
            WHERE "userId" = ${user.id} ORDER BY "createdAt" ASC`,
      ),
      deadline,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      userId: r.userId,
      title: r.title,
      status: r.status,
      createdAt: toIso(r.createdAt),
    }));
  },

  async createTask(title: string): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await getAppUser(context, deadline);
    const trimmed = typeof title === 'string' ? title.trim() : '';
    if (!trimmed) return;
    await withResumeRetry(
      () => db.execute(
        sql`INSERT INTO "tasks" ("userId", "title") VALUES (${user.id}, ${trimmed.slice(0, 500)})`,
      ),
      deadline,
    );
  },

  async updateTaskStatus(id: number, status: TaskStatus): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await getAppUser(context, deadline);
    if (!STATUSES.includes(status)) throw new ApiError('Invalid status', 400);
    await withResumeRetry(
      () => db.execute(
        sql`UPDATE "tasks" SET "status" = ${status} WHERE "id" = ${id} AND "userId" = ${user.id}`,
      ),
      deadline,
    );
  },

  async deleteTask(id: number): Promise<void> {
    const deadline = Date.now() + 27_000;
    const user = await getAppUser(context, deadline);
    await withResumeRetry(
      () => db.execute(
        sql`DELETE FROM "tasks" WHERE "id" = ${id} AND "userId" = ${user.id}`,
      ),
      deadline,
    );
  },
}));

export const authApi = auth.createApi();
