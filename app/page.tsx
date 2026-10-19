import { redirect } from 'next/navigation'
import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { getTasks } from '@/app/actions/tasks'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // withAuth throws a 401 ApiError when no session cookies are present.
  let state: Awaited<ReturnType<typeof authApi.getAuthState>> | null = null
  try {
    state = await withAuth(() => authApi.getAuthState())
  } catch {
    redirect('/sign-in')
  }

  if (!state || state.state !== 'signedIn') redirect('/sign-in')

  const tasks = await getTasks()

  // AuthBasic stores no display name, so the header shows the signed-in email.
  return (
    <TaskManager initialTasks={tasks} userName={state.user?.username ?? ''} />
  )
}
