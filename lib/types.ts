/**
 * Shared app types.
 *
 * Replaces the Drizzle-inferred types that used to live in `lib/db/schema.ts`.
 * Shapes match the `tasks` table in `aws-blocks/migrations/001_init.sql`.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: Date | string
}
