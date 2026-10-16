import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { AuthForm } from '@/components/auth-form'

// Reads the session cookie per request — must not be prerendered.
export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  let signedIn = false
  try {
    // `withAuth` throws a 401 when there is no session cookie.
    await withAuth(() => api.getProfile())
    signedIn = true
  } catch {
    signedIn = false
  }

  // `redirect` is called outside the try so its control-flow error is not caught.
  if (signedIn) redirect('/')

  return <AuthForm mode="sign-up" />
}
