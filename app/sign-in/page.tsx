import { redirect } from 'next/navigation'
import { authApi } from 'aws-blocks'
import { withAuth } from '@aws-blocks/blocks/server'
import { ApiError } from '@aws-blocks/blocks/client'
import { AuthForm } from '@/components/auth-form'

export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined

  let state: Awaited<ReturnType<typeof authApi.getAuthState>> | undefined
  try {
    state = await withAuth(() => authApi.getAuthState())
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e
  }

  if (state?.state === 'signedIn') redirect('/')

  return <AuthForm mode="sign-in" next={next} />
}
