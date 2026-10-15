'use server'

import { revalidatePath } from 'next/cache'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import type { TaskStatus } from '@/lib/types'

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
