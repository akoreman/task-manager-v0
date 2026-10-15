export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: string
}
