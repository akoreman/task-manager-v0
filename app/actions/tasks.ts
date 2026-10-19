'use server'

/**
 * Server actions — thin wrappers over the Blocks API.
 *
 * The rendering model is unchanged: `components/task-manager.tsx` still calls
 * these same functions and the page still re-renders through
 * `revalidatePath('/')` + `router.refresh()`. Only the data access moved:
 * instead of Drizzle + Better Auth, each action forwards the incoming request
 * cookies with `withAuth` and calls the generated RPC client.
 *
 * Ownership checks and input validation live in `aws-blocks/index.ts`
 * (`auth.requireAuth`, title trimming, status allow-list), so nothing is
 * duplicated here.
 */

import { revalidatePath } from 'next/cache'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
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
