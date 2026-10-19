import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // `withAuth` forwards the browser cookies to the Blocks API and throws a
  // 401 ApiError when there are none — treat that like a signed-out user.
  let user: { username: string; name: string } | null = null
  try {
    user = await withAuth(() => api.getCurrentUser())
  } catch {
    user = null
  }
  if (!user) redirect('/sign-in')

  const tasks = await withAuth(() => api.getTasks())

  return (
    <TaskManager
      initialTasks={tasks}
      userName={user.name || user.username}
    />
  )
}
