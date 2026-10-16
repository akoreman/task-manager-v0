'use server'

import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { revalidatePath } from 'next/cache'
import type { TaskStatus } from '@/lib/types'

/**
 * Server actions kept as thin proxies over the Blocks API so that
 * `components/task-manager.tsx` keeps calling them unchanged.
 *
 * `withAuth` forwards the incoming request's session cookie to the API, so the
 * old `getUserId()` helper is gone: authorization now lives in
 * `auth.requireAuth(context)` inside each `api` method, which throws a 401
 * instead of the old `new Error('Unauthorized')`.
 */
export async function getTasks() {
  return withAuth(() => api.listTasks())
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
