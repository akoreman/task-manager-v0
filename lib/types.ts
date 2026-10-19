// Plain app types (previously inferred from the Drizzle schema).

export type Task = {
  id: number
  userId: string
  title: string
  status: string
  createdAt: Date | string
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'
