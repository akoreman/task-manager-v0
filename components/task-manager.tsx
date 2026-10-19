'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from 'aws-blocks'
import { broadcastAuthChange } from '@aws-blocks/blocks/ui'
import {
  createTask,
  updateTaskStatus,
  deleteTask,
} from '@/app/actions/tasks'
import type { Task, TaskStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, LogOut } from 'lucide-react'

const STATUS_META: Record<TaskStatus, { label: string; dot: string }> = {
  todo: { label: 'To do', dot: 'bg-muted-foreground' },
  in_progress: { label: 'In progress', dot: 'bg-primary' },
  done: { label: 'Done', dot: 'bg-chart-2' },
}

export function TaskManager({
  initialTasks,
  userName,
}: {
  initialTasks: Task[]
  userName: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [, startTransition] = useTransition()

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const value = title.trim()
    if (!value) return
    setTitle('')
    startTransition(async () => {
      await createTask(value)
      router.refresh()
    })
  }

  const handleStatus = (id: number, status: TaskStatus) => {
    startTransition(async () => {
      await updateTaskStatus(id, status)
      router.refresh()
    })
  }

  const handleDelete = (id: number) => {
    startTransition(async () => {
      await deleteTask(id)
      router.refresh()
    })
  }

  const handleSignOut = async () => {
    await authApi.setAuthState({ action: 'signOut' })
    broadcastAuthChange(null)
    router.push('/sign-in')
    router.refresh()
  }

  const remaining = initialTasks.filter((t) => t.status !== 'done').length

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-16">
        <header className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground text-balance">
              Tasks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {userName} · {remaining} remaining
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-muted-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </header>

        <form onSubmit={handleAdd} className="flex items-center gap-2 mb-8">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a new task..."
            aria-label="Task title"
            maxLength={500}
          />
          <Button type="submit" disabled={!title.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </form>

        <ul className="flex flex-col gap-2">
          {initialTasks.length === 0 && (
            <li className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No tasks yet. Add your first one above.
            </li>
          )}

          {initialTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <span
                className={`size-2 shrink-0 rounded-full ${STATUS_META[task.status as TaskStatus].dot}`}
                aria-hidden
              />
              <span
                className={`flex-1 text-sm text-card-foreground ${
                  task.status === 'done'
                    ? 'line-through text-muted-foreground'
                    : ''
                }`}
              >
                {task.title}
              </span>

              <Select
                value={task.status}
                onValueChange={(value) =>
                  handleStatus(task.id, value as TaskStatus)
                }
              >
                <SelectTrigger className="w-36" aria-label="Task status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(STATUS_META) as TaskStatus[]
                  ).map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(task.id)}
                aria-label={`Delete ${task.title}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
