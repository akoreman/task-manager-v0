import { redirect } from 'next/navigation'
import { withAuth } from '@aws-blocks/blocks/server'
import { authApi } from 'aws-blocks'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  let signedIn = false
  try {
    signedIn = (await withAuth(() => authApi.getAuthState())).state === 'signedIn'
  } catch (e) {
    if ((e as { status?: number })?.status !== 401) throw e
  }
  if (signedIn) redirect('/')

  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  return <AuthForm mode="sign-up" next={next} />
}
