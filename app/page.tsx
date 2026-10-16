import { redirect } from 'next/navigation'
import { api, authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  let session = null
  try {
    session = await withAuth(() => authApi.getSession())
  } catch {
    session = null
  }
  if (!session) redirect('/sign-in')

  const tasks = await withAuth(() => api.getTasks())

  return (
    <TaskManager
      initialTasks={tasks}
      userName={session.name || session.email}
    />
  )
}
