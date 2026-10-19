'use server'

import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { revalidatePath } from 'next/cache'
import type { Task, TaskStatus } from '@/lib/types'

export async function getTasks(): Promise<Task[]> {
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
