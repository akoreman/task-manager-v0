import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { authApi } from 'aws-blocks'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  let signedIn = false
  try {
    const state = await withAuth(() => authApi.getAuthState())
    signedIn = state.state === 'signedIn'
  } catch (e) {
    if ((e as { status?: number }).status !== 401) throw e
  }
  if (signedIn) redirect('/')
  return <AuthForm mode="sign-in" />
}
