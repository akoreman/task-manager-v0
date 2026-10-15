import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { authApi } from 'aws-blocks'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  let session: Awaited<ReturnType<typeof authApi.getSession>> = null
  try {
    session = await withAuth(() => authApi.getSession())
  } catch {
    session = null
  }

  if (session) redirect('/')

  return <AuthForm mode="sign-in" />
}
