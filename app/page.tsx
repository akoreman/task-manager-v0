import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // `.catch(() => null)`: withAuth throws a 401 ApiError when the request
  // carries no cookies at all.
  const profile = await withAuth(() => api.getProfile()).catch(() => null)
  if (!profile) redirect('/sign-in')

  const tasks = await withAuth(() => api.getTasks())

  return <TaskManager initialTasks={tasks} userName={profile.name} />
}
