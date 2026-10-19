import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { AuthForm } from '@/components/auth-form'

export default async function SignUpPage() {
  const session = await withAuth(() => api.getSession()).catch(() => null)
  if (session) redirect('/')
  return <AuthForm mode="sign-up" />
}
