import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { redirect } from 'next/navigation'
import { getTasks } from '@/app/actions/tasks'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // `withAuth` throws a 401 `ApiError` when there are no cookies, so a missing
  // session surfaces as a thrown error rather than `null`.
  let session = null
  try {
    session = await withAuth(() => authApi.getSession())
  } catch {
    session = null
  }

  // Must stay OUTSIDE the try/catch: `redirect()` works by throwing a
  // control-flow error that must not be swallowed by the catch above.
  if (!session) redirect('/sign-in')

  const tasks = await getTasks()

  return (
    <TaskManager
      initialTasks={tasks}
      userName={session.name || session.email}
    />
  )
}
