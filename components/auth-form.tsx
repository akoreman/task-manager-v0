'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi, api } from 'aws-blocks'
import { hasAuthError } from '@aws-blocks/blocks/client'
import { broadcastAuthChange } from '@aws-blocks/blocks/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

const NOT_AUTHORIZED = 'NotAuthorizedException'
const USERNAME_EXISTS = 'UsernameExistsException'
const INVALID_PASSWORD = 'InvalidPasswordException'
const USER_NOT_CONFIRMED = 'UserNotConfirmedException'
const CODE_MISMATCH = 'CodeMismatchException'

type AuthResult = Awaited<ReturnType<typeof authApi.setAuthState>>

function describeError(state: AuthResult): string {
  if (hasAuthError(state, NOT_AUTHORIZED)) return 'Invalid email or password'
  if (hasAuthError(state, USERNAME_EXISTS))
    return 'User already exists. Use another email.'
  if (hasAuthError(state, INVALID_PASSWORD))
    return state.error ?? 'Password does not meet the requirements'
  if (hasAuthError(state, USER_NOT_CONFIRMED))
    return 'Please verify your email to continue'
  if (hasAuthError(state, CODE_MISMATCH)) return 'Invalid verification code'
  return state.error ?? 'Something went wrong'
}

function safeNext(value: string | null): string {
  if (
    value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  ) {
    return value
  }
  return '/'
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong'
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return (
    <Suspense fallback={null}>
      <AuthFormInner mode={mode} />
    </Suspense>
  )
}

function AuthFormInner({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'credentials' | 'confirm'>('credentials')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const finishSignIn = async (next: AuthResult, displayName?: string) => {
    await api.syncUser(displayName)
    broadcastAuthChange(next.user ?? null)
    router.push(safeNext(searchParams.get('next')))
    router.refresh()
  }

  const signIn = async (displayName?: string): Promise<boolean> => {
    const next = await authApi.setAuthState({
      action: 'signIn',
      username: email,
      password,
    })
    if (next.state === 'signedIn') {
      await finishSignIn(next, displayName)
      return true
    }
    if (hasAuthError(next, USER_NOT_CONFIRMED)) {
      setStep('confirm')
      setError('Enter the verification code sent to your email')
      return false
    }
    setError(describeError(next))
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (!isSignUp) {
        await signIn()
        return
      }
      const next = await authApi.setAuthState({
        action: 'signUp',
        username: email,
        password,
        email,
      })
      if (next.state === 'confirmingSignUp') {
        setCode('')
        setStep('confirm')
        return
      }
      if (next.state === 'signedIn') {
        await finishSignIn(next, name)
        return
      }
      setError(describeError(next))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const next = await authApi.setAuthState({
        action: 'confirmSignUp',
        username: email,
        code: code.trim(),
      })
      const displayName = isSignUp ? name : undefined
      if (next.state === 'signedIn') {
        await finishSignIn(next, displayName)
        return
      }
      if (next.state === 'signedOut' && !next.error) {
        await signIn(displayName)
        return
      }
      setError(describeError(next))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (step === 'confirm') {
    return (
      <main className="min-h-svh bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
              Verify your email
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              We sent a verification code to {email}
            </p>
          </div>

          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Please wait...' : 'Verify'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            <button
              type="button"
              onClick={() => {
                setStep('credentials')
                setError(null)
              }}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              Back
            </button>
          </p>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp
              ? 'Sign up to start managing your tasks'
              : 'Sign in to your account to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? 'Please wait...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground text-center mt-6">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Link
            href={isSignUp ? '/sign-in' : '/sign-up'}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </Link>
        </p>
      </Card>
    </main>
  )
}

