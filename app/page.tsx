import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { authApi } from 'aws-blocks'
import { getTasks } from '@/app/actions/tasks'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // withAuth throws a 401 ApiError when the request carries no cookies.
  let session: Awaited<ReturnType<typeof authApi.getSession>> = null
  try {
    session = await withAuth(() => authApi.getSession())
  } catch {
    session = null
  }

  // redirect() must stay outside the try/catch: Next implements it by throwing.
  if (!session) redirect('/sign-in')

  const tasks = await getTasks()

  return (
    <TaskManager
      initialTasks={tasks}
      userName={session.name || session.email}
    />
  )
}
