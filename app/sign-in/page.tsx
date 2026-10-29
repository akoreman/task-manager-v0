import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { ApiError } from '@aws-blocks/blocks/client'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  let signedOut = false
  try {
    await withAuth(() => api.getCurrentUser())
  } catch (e) {
    const status =
      e instanceof ApiError ? e.status : (e as { status?: unknown } | null)?.status
    if (status === 401) signedOut = true
    else throw e
  }
  if (signedOut) return <AuthForm mode="sign-in" />
  redirect('/')
}
