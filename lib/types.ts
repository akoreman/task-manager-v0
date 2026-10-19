export type TaskStatus = 'todo' | 'in_progress' | 'done'

// `createdAt` is a string because JSON-RPC serializes the timestamp.
export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
