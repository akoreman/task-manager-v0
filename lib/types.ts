export type TaskStatus = 'todo' | 'in_progress' | 'done'

// The RPC wire format serializes timestamps as strings.
export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
