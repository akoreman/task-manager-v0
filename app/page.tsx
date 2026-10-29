import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import type { AppUser } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { ApiError } from '@aws-blocks/blocks/client'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

function isUnauthorized(e: unknown): boolean {
  return (
    (e instanceof ApiError && e.status === 401) ||
    (typeof e === 'object' && e !== null && (e as { status?: unknown }).status === 401)
  )
}

export default async function Page() {
  let me: AppUser | null = null
  let unauthorized = false
  try {
    me = await withAuth(() => api.getCurrentUser())
  } catch (e) {
    if (isUnauthorized(e)) unauthorized = true
    else throw e
  }
  if (unauthorized || !me) redirect('/sign-in?next=/')

  const tasks = await withAuth(() => api.getTasks())

  return <TaskManager initialTasks={tasks} userName={me.name || me.email} />
}
