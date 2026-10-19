export type TaskStatus = 'todo' | 'in_progress' | 'done'

/**
 * Shape of a task as it comes back from the Blocks API over JSON-RPC.
 * Timestamps serialize as ISO strings.
 */
export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
