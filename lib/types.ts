export type TaskStatus = 'todo' | 'in_progress' | 'done'

// `createdAt` is an ISO string over JSON-RPC.
export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
