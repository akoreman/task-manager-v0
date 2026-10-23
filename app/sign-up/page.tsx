import { Suspense } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { api } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  const cookieHeader = (await headers()).get('cookie')
  let signedIn = false
  if (cookieHeader) {
    try {
      await withAuth(() => api.getMe(), cookieHeader)
      signedIn = true
    } catch (e) {
      if ((e as { status?: number })?.status !== 401) throw e
    }
  }
  if (signedIn) redirect('/')
  return (
    <Suspense>
      <AuthForm mode="sign-up" />
    </Suspense>
  )
}
