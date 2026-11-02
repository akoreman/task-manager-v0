import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import type { Task } from 'aws-blocks'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let data: { me: { name: string; email: string }; tasks: Task[] } | undefined
  let signedOut = false

  // withAuth throws when the request carries no cookies at all.
  if ((await cookies()).getAll().length === 0) {
    signedOut = true
  } else {
    try {
      data = await withAuth(async () => ({
        me: await api.getMe(),
        tasks: await api.getTasks(),
      }))
    } catch (e) {
      if ((e as any)?.status === 401) signedOut = true
      else throw e
    }
  }

  // redirect() works by throwing, so it must stay outside the try.
  if (signedOut || !data) redirect('/sign-in')

  return (
    <TaskManager
      initialTasks={data.tasks}
      userName={data.me.name || data.me.email}
    />
  )
}
