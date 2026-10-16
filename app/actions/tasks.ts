'use server'

/**
 * Server actions — same names/signatures as before, but the bodies now call the
 * Blocks API instead of Drizzle. `withAuth` forwards the browser's cookies from
 * `next/headers` to the RPC call and throws a 401 `ApiError` when there are
 * none, so the old `getUserId()` session check is no longer needed. Status
 * validation and title trimming live in the API method now.
 */
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { revalidatePath } from 'next/cache'
import type { Task, TaskStatus } from '@/lib/types'

export async function getTasks(): Promise<Task[]> {
  return withAuth(() => api.getTasks())
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
