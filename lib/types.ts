/**
 * Shared types previously declared alongside the Drizzle schema.
 *
 * Rows now cross the Blocks RPC boundary as JSON, so timestamps arrive as
 * ISO strings rather than `Date` instances.
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
