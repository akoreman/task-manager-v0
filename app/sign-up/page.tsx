import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'

export default async function SignUpPage() {
  // `withAuth` forwards the request cookies and throws a 401 `ApiError` when
  // there is no session, so a signed-out visitor surfaces as a thrown error.
  let session = null
  try {
    session = await withAuth(() => authApi.getSession())
  } catch {
    session = null
  }

  // Must stay OUTSIDE the try/catch: `redirect()` works by throwing a
  // control-flow error that must not be swallowed by the catch above.
  if (session) redirect('/')

  return <AuthForm mode="sign-up" />
}
