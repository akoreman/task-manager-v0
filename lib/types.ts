/**
 * Shared task types, replacing the deleted Drizzle schema (`lib/db/schema.ts`).
 *
 * `createdAt` is a string because the `tasks.createdAt` Postgres TIMESTAMP is
 * serialized to ISO text by JSON-RPC on its way out of the Blocks API.
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
