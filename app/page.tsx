import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import type { Task } from 'aws-blocks'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const cookie = (await headers()).get('cookie')
  if (!cookie) redirect('/sign-in')

  let unauthorized = false
  let me: { name: string; email: string } = { name: '', email: '' }
  let tasks: Task[] = []
  try {
    const result = await withAuth(
      async () => ({ me: await api.getMe(), tasks: await api.listTasks() }),
      cookie
    )
    me = result.me
    tasks = result.tasks
  } catch (e) {
    if ((e as { status?: number })?.status === 401) {
      unauthorized = true
    } else {
      throw e
    }
  }
  if (unauthorized) redirect('/sign-in')

  return <TaskManager initialTasks={tasks} userName={me.name || me.email} />
}
