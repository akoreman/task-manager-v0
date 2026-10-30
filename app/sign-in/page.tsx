import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  let me = null
  try {
    me = await withAuth(() => api.getMe())
  } catch (e) {
    if ((e as { status?: number })?.status !== 401) throw e
  }
  if (me) redirect('/')
  return <AuthForm mode="sign-in" />
}
