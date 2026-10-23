'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi, api } from 'aws-blocks'
import { hasAuthError } from '@aws-blocks/blocks/client'
import { broadcastAuthChange } from '@aws-blocks/blocks/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

// Cognito error names as they arrive on the wire (AuthState.errorName).
const USERNAME_EXISTS = 'UsernameExistsException'
const NOT_AUTHORIZED = 'NotAuthorizedException'
const INVALID_PASSWORD = 'InvalidPasswordException'
const USER_NOT_CONFIRMED = 'UserNotConfirmedException'
const CODE_MISMATCH = 'CodeMismatchException'

type AuthResult = Awaited<ReturnType<typeof authApi.setAuthState>>

/** Only allow same-origin paths: one leading `/` not followed by `/` or `\`. */
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && next[1] !== '/' && next[1] !== '\\') {
    return next
  }
  return '/'
}

function errorMessage(state: AuthResult): string {
  if (hasAuthError(state, USERNAME_EXISTS)) {
    return 'An account with this email already exists'
  }
  if (hasAuthError(state, NOT_AUTHORIZED)) return 'Invalid email or password'
  if (hasAuthError(state, CODE_MISMATCH)) return 'Invalid verification code'
  if (hasAuthError(state, INVALID_PASSWORD)) {
    return state.error ?? 'Password does not meet the requirements'
  }
  return state.error ?? 'Something went wrong'
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'form' | 'code'>('form')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  /** Finish a successful sign-in: create/link the user row, broadcast, navigate. */
  const finishSignIn = async (state: AuthResult, displayName?: string) => {
    await api.ensureUser(displayName)
    broadcastAuthChange(state.user ?? null)
    router.push(safeNext(searchParams.get('next')))
    router.refresh()
  }

  /** Sign in with the current email/password. Returns true when navigation started. */
  const signIn = async (displayName?: string): Promise<boolean> => {
    const state = await authApi.setAuthState({
      action: 'signIn',
      username: email,
      password,
    })
    if (state.state === 'signedIn') {
      await finishSignIn(state, displayName)
      return true
    }
    if (hasAuthError(state, USER_NOT_CONFIRMED)) {
      try {
        await authApi.setAuthState({ action: 'resendSignUpCode', username: email })
      } catch {
        // Best effort: the user may still have the original code.
      }
      setCode('')
      setStep('code')
      return false
    }
    setError(errorMessage(state))
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const state = await authApi.setAuthState({
          action: 'signUp',
          username: email,
          password,
          email,
        })
        if (state.state === 'confirmingSignUp' && !state.error) {
          setCode('')
          setStep('code')
        } else if (state.state === 'signedIn') {
          await finishSignIn(state, name)
        } else {
          setError(errorMessage(state))
        }
      } else {
        await signIn()
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const state = await authApi.setAuthState({
        action: 'confirmSignUp',
        username: email,
        code: code.trim(),
      })
      if (state.error) {
        setError(errorMessage(state))
        return
      }
      if (state.state === 'signedIn') {
        await finishSignIn(state, name || undefined)
        return
      }
      // Confirmed (signedOut): sign in automatically with the credentials in state.
      await signIn(name || undefined)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'code') {
    return (
      <main className="min-h-svh bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
              Verify your email
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              We emailed a verification code to {email}. Enter it below to continue.
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
