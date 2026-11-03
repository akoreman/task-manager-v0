import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!(await cookies()).toString()) redirect('/sign-in')

  let data
  let unauth = false
  try {
    data = await withAuth(async () => ({
      me: await api.getMe(),
      tasks: await api.getTasks(),
    }))
  } catch (e) {
    if ((e as any)?.status === 401) unauth = true
    else throw e
  }
  if (unauth || !data) redirect('/sign-in')

  return (
    <TaskManager initialTasks={data.tasks} userName={data.me.userName} />
  )
}
