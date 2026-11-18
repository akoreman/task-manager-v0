import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import type { Task } from 'aws-blocks'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let me: { name: string; email: string } | null = null
  let tasks: Task[] = []
  let unauthorized = false
  try {
    me = await withAuth(() => api.getMe())
    tasks = await withAuth(() => api.getTasks())
  } catch (e) {
    if ((e as { status?: number }).status === 401) {
      unauthorized = true
    } else {
      throw e
    }
  }
  if (unauthorized || !me) redirect('/sign-in')

  return <TaskManager initialTasks={tasks} userName={me.name || me.email} />
}
