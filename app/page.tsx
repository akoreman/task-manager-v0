import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let data = null
  try {
    data = await withAuth(async () => ({
      me: await api.getMe(),
      tasks: await api.getTasks(),
    }))
  } catch (e) {
    if ((e as { status?: number })?.status !== 401) throw e
  }
  if (!data) redirect('/sign-in?next=/')

  return (
    <TaskManager
      initialTasks={data.tasks}
      userName={data.me.name || data.me.email}
    />
  )
}
