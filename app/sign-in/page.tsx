import { redirect } from 'next/navigation'
import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  let session = null
  try {
    session = await withAuth(() => authApi.getSession())
  } catch {
    session = null
  }
  if (session) redirect('/')
  return <AuthForm mode="sign-in" />
}
