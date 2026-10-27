import { redirect } from 'next/navigation'
import { api, type Task } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let me: { id: string; name: string; email: string } | null = null
  let tasks: Task[] = []
  let unauthorized = false
  try {
    me = await withAuth(() => api.me())
    tasks = await withAuth(() => api.getTasks())
  } catch (e) {
    if ((e as { status?: number }).status === 401) {
      unauthorized = true
    } else {
      throw e
    }
  }

  if (unauthorized || !me) redirect('/sign-in')

  return (
    <TaskManager
      initialTasks={tasks}
      userName={me.name || me.email}
    />
  )
}
