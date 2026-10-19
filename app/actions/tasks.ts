'use server'

import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { revalidatePath } from 'next/cache'
import type { TaskStatus } from '@/lib/types'

// `withAuth` forwards the browser cookies to the RPC call (Next.js cookie
// detection is built in) and is required for the auth-gated API methods.
// Authorization, status validation and title trimming are enforced
// server-side by the ApiNamespace in aws-blocks/index.ts.

export async function getTasks() {
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
