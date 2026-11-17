import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let data
  try {
    data = await withAuth(async () => ({
      me: await api.getMe(),
      tasks: await api.getTasks(),
    }))
  } catch (e) {
    if ((e as { status?: number })?.status === 401) data = null
    else throw e
  }
  if (!data) redirect('/sign-in')

  return (
    <TaskManager
      initialTasks={data.tasks}
      userName={data.me.name || data.me.email}
    />
  )
}
