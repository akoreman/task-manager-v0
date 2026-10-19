import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  // `withAuth` auto-detects Next.js cookies and forwards them; with no session
  // cookie it throws a 401 ApiError, which just means "signed out" here.
  let signedIn = false
  try {
    const state = await withAuth(() => authApi.getAuthState())
    signedIn = state.state === 'signedIn'
  } catch {
    // no session — fall through and render the form
  }
  // `redirect` throws its own control-flow error, so keep it out of the try.
  if (signedIn) redirect('/')
  return <AuthForm mode="sign-in" />
}
