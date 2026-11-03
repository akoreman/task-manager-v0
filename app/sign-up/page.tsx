import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { api } from 'aws-blocks'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  if ((await cookies()).toString()) {
    let signedIn = false
    try {
      await withAuth(() => api.getMe())
      signedIn = true
    } catch (e) {
      if ((e as any)?.status !== 401) throw e
    }
    if (signedIn) redirect('/')
  }
  return <AuthForm mode="sign-up" />
}
