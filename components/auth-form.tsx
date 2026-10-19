'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authApi } from 'aws-blocks'
import { hasAuthError } from '@aws-blocks/blocks/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

// Structured `AuthBasic` error names, matching `AuthBasicErrors` from the
// backend package. They are declared here because `@aws-blocks/blocks` has no
// browser entry exports — only `@aws-blocks/blocks/client` is bundlable in a
// client component — and these names are part of the wire contract
// (`AuthState.errorName`), never the human-facing `error` string.
const AuthErrors = {
  InvalidCredentials: 'InvalidCredentialsException',
  UserAlreadyExists: 'UserAlreadyExistsException',
  InvalidPassword: 'InvalidPasswordException',
} as const

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // `setAuthState` drives the auth state machine: the input is flat
    // (`{ action, ...fields }`) and it returns the next `AuthState` instead of
    // throwing. Sign-up is immediate (no `codeDelivery` is configured), so
    // there is no `confirmSignUp` step to handle.
    const next = isSignUp
      ? await authApi.setAuthState({
          action: 'signUp',
          username: email,
          password,
        })
      : await authApi.setAuthState({
          action: 'signIn',
          username: email,
          password,
        })

    setLoading(false)

    if (next.state === 'signedIn') {
      router.push('/')
      router.refresh()
      return
    }

    // Branch on the structured error names, never on the human-facing string.
    if (hasAuthError(next, AuthErrors.InvalidCredentials)) {
      setError('Incorrect email or password')
    } else if (hasAuthError(next, AuthErrors.UserAlreadyExists)) {
      setError('An account with that email already exists')
    } else if (hasAuthError(next, AuthErrors.InvalidPassword)) {
      setError('Password must be at least 8 characters')
    } else {
      setError(next.error ?? 'Something went wrong')
    }
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
