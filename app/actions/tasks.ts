'use server'

import { revalidatePath } from 'next/cache'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import type { TaskStatus } from '@/lib/types'

// Thin pass-throughs to the Blocks API. The API validates input and gates on
// the session, so these actions only forward cookies (`withAuth`) and
// revalidate the page the client refreshes.

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
