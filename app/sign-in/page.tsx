import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  // A thrown 401 (no cookies forwarded) means "signed out".
  let user: { username: string; name: string } | null = null
  try {
    user = await withAuth(() => api.getCurrentUser())
  } catch {
    user = null
  }
  if (user) redirect('/')
  return <AuthForm mode="sign-in" />
}
