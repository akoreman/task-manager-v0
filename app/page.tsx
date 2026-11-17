import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { ApiError } from '@aws-blocks/blocks/client'
import { TaskManager } from '@/components/task-manager'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let unauthenticated = false
  let data: Awaited<ReturnType<typeof loadData>> | undefined

  try {
    data = await loadData()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      unauthenticated = true
    } else {
      throw e
    }
  }

  if (unauthenticated || !data) redirect('/sign-in?next=%2F')

  return (
    <TaskManager
      initialTasks={data.tasks}
      userName={data.me.name || data.me.email}
    />
  )
}

function loadData() {
  return withAuth(async () => {
    const me = await api.getMe()
    const tasks = await api.getTasks()
    return { me, tasks }
  })
}
