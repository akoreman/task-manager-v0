import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { ApiError } from '@aws-blocks/blocks'
import { TaskManager } from '@/components/task-manager'
import type { Task } from '@/lib/types'

type Profile = { name: string; email: string } | null

/**
 * Still an SSR server component: the session check is now the API call itself.
 * `withAuth` forwards the request cookies to the Blocks API, which throws a 401
 * `ApiError` when there is no (or an expired) session — including when the
 * browser sent no cookies at all. That replaces `auth.api.getSession`.
 */
export default async function Page() {
  let tasks: Task[] = []
  let profile: Profile = null
  let unauthorized = false

  try {
    const [loadedTasks, loadedProfile] = await Promise.all([
      withAuth(() => api.getTasks()),
      withAuth(() => api.getProfile()),
    ])
    tasks = (loadedTasks ?? []) as Task[]
    profile = (loadedProfile ?? null) as Profile
  } catch (error) {
    const err = error as { statusCode?: number; status?: number } | null
    const status = err?.statusCode ?? err?.status
    const isAuthFailure =
      status === 401 || (error instanceof ApiError && status === undefined)
    if (!isAuthFailure) throw error
    unauthorized = true
  }

  // `redirect()` works by throwing, so it stays outside the try/catch.
  if (unauthorized) redirect('/sign-in')

  return (
    <TaskManager
      initialTasks={tasks}
      userName={profile?.name || profile?.email || ''}
    />
  )
}
