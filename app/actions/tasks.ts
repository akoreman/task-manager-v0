'use server'

import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { revalidatePath } from 'next/cache'
import type { TaskStatus } from '@/lib/types'

// `withAuth` forwards the browser cookies (Next.js detection is built in) to
// the RPC call — that cookie carries the session. It throws a 401 `ApiError`
// when no cookies are present, replacing the old `getUserId()` guard.
// The `requireAuth` gate, the status validation, the trim and the 500-char cap
// now live in the backend methods (`aws-blocks/index.ts`).

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
