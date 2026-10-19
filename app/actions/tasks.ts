'use server'

import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { revalidatePath } from 'next/cache'
import type { TaskStatus } from '@/lib/types'

// Authorization lives in the API methods (auth.requireAuth), so there is no
// local getUserId() helper any more. `withAuth` forwards the browser's cookies
// to the Blocks API during server rendering and server actions.

export async function getTasks() {
  return await withAuth(() => api.listTasks())
}

export async function createTask(title: string) {
  await withAuth(() => api.createTask(title))
  revalidatePath('/')
}

export async function updateTaskStatus(id: number, status: TaskStatus) {
  await withAuth(() => api.updateTaskStatus(id, status))
  revalidatePath('/')
}

export async function deleteTask(id: number) {
  await withAuth(() => api.deleteTask(id))
  revalidatePath('/')
}
