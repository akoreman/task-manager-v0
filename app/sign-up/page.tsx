import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'

export default async function SignUpPage() {
  // `withAuth` forwards the request cookies to the API; it throws a 401
  // `ApiError` when the browser sent no cookies at all, which means signed out.
  let session = null
  try {
    session = await withAuth(() => api.getSession())
  } catch {
    session = null
  }
  if (session) redirect('/')
  return <AuthForm mode="sign-up" />
}
