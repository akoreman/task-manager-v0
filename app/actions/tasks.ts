'use server'

import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { revalidatePath } from 'next/cache'
import type { Task, TaskStatus } from '@/lib/types'

// All data access goes through the Blocks API. `withAuth` forwards the
// browser's cookies to the API (Next.js cookie detection is built in) and
// throws a 401 ApiError when there are none; the API itself enforces auth.

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
