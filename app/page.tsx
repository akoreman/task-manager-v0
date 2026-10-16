import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { TaskManager } from '@/components/task-manager'
import type { Task } from '@/lib/types'

// Reads the session cookie per request — must not be prerendered.
export const dynamic = 'force-dynamic'

export default async function Page() {
  let data:
    | { profile: { name: string; email: string }; tasks: Task[] }
    | null = null

  try {
    // One authenticated scope: the cookies are forwarded to both RPC calls.
    data = await withAuth(async () => ({
      profile: await api.getProfile(),
      tasks: await api.getTasks(),
    }))
  } catch {
    data = null
  }

  // No session (or an expired one) — same redirect as the old session check.
  if (!data) redirect('/sign-in')

  return (
    <TaskManager
      initialTasks={data.tasks}
      userName={data.profile.name || data.profile.email}
    />
  )
}
