import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  // `withAuth` forwards the browser cookies to the API during server
  // rendering; it throws a 401 `ApiError` when there are none.
  const user = await withAuth(() => api.getCurrentUser()).catch(() => null)
  if (user) redirect('/')
  return <AuthForm mode="sign-in" />
}
