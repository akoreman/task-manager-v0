import { redirect } from 'next/navigation'
import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  // withAuth throws a 401 ApiError when no session cookies are present —
  // that just means "not signed in", so swallow it and render the form.
  let state: Awaited<ReturnType<typeof authApi.getAuthState>> | null = null
  try {
    state = await withAuth(() => authApi.getAuthState())
  } catch {
    state = null
  }

  if (state?.state === 'signedIn') redirect('/')

  return <AuthForm mode="sign-in" />
}
