import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { redirect } from 'next/navigation'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // `withAuth` forwards the browser cookies to the API during server
  // rendering; it throws a 401 `ApiError` when there are none.
  const user = await withAuth(() => api.getCurrentUser()).catch(() => null)
  if (!user) redirect('/sign-in')

  const tasks = await withAuth(() => api.listTasks())

  return <TaskManager initialTasks={tasks} userName={user.name} />
}
