export type TaskStatus = 'todo' | 'in_progress' | 'done'

/**
 * Shape returned by the Blocks API (`api.getTasks()`).
 * `createdAt` is a string because the RPC response is JSON — the UI never
 * renders it; ordering happens server-side.
 */
export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
