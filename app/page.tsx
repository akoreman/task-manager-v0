import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { redirect } from 'next/navigation'
import { getTasks } from '@/app/actions/tasks'
import { TaskManager } from '@/components/task-manager'

export default async function Page() {
  // Replaces `auth.api.getSession({ headers: await headers() })`. A thrown
  // error (expired / missing session cookie) or a `null` result both mean the
  // visitor is signed out.
  let session: Awaited<ReturnType<typeof api.getSession>> = null
  try {
    session = await withAuth(() => api.getSession())
  } catch {
    session = null
  }
  if (!session) redirect('/sign-in')

  const tasks = await getTasks()

  return (
    <TaskManager
      initialTasks={tasks}
      userName={session.name || session.email}
    />
  )
}
