import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { getTasks } from '@/app/actions/tasks'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  const session = await withAuth(() => api.getSession()).catch(() => null)
  if (!session) redirect('/sign-in')

  const tasks = await getTasks()

  return <TaskManager initialTasks={tasks} userName={session.name} />
}
