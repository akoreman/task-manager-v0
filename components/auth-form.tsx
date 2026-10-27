'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authApi, api } from 'aws-blocks'
import { hasAuthError } from '@aws-blocks/blocks/client'
import { broadcastAuthChange } from '@aws-blocks/blocks/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

const USERNAME_EXISTS = 'UsernameExistsException'
const NOT_AUTHORIZED = 'NotAuthorizedException'
const INVALID_PASSWORD = 'InvalidPasswordException'
const USER_NOT_CONFIRMED = 'UserNotConfirmedException'
const CODE_MISMATCH = 'CodeMismatchException'
const EXPIRED_CODE = 'ExpiredCodeException'

const GENERIC_ERROR = 'Something went wrong'

type AuthStateResult = Awaited<ReturnType<typeof authApi.setAuthState>>

/** Same-origin `next` path from the query string, or '/'. */
function getNextTarget(): string {
  if (typeof window === 'undefined') return '/'
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && next[1] !== '/' && next[1] !== '\\') {
    return next
  }
  return '/'
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'credentials' | 'code'>('credentials')
  const [code, setCode] = useState('')

  const isSignUp = mode === 'sign-up'

  const finish = async (state: AuthStateResult) => {
    await api.ensureUser(isSignUp ? name : undefined)
    broadcastAuthChange(state.user ?? null)
    router.push(getNextTarget())
    router.refresh()
  }

  /** Sign in with the stored credentials; returns true when navigation started. */
  const signIn = async (): Promise<boolean> => {
    const state = await authApi.setAuthState({ action: 'signIn', username: email, password })
    if (state.state === 'signedIn') {
      await finish(state)
      return true
    }
    if (hasAuthError(state, NOT_AUTHORIZED)) {
      setError('Invalid email or password')
    } else if (hasAuthError(state, USER_NOT_CONFIRMED)) {
      setStep('code')
    } else {
      setError(state.error ?? GENERIC_ERROR)
    }
    return false
  }

  const handleCredentials = async () => {
    if (!isSignUp) {
      await signIn()
      return
    }
    const state = await authApi.setAuthState({
      action: 'signUp',
      username: email,
      password,
      email,
    })
    if (state.state === 'confirmingSignUp') {
      setStep('code')
    } else if (hasAuthError(state, USERNAME_EXISTS)) {
      setError('User already exists. Use another email.')
    } else if (hasAuthError(state, INVALID_PASSWORD)) {
      setError(state.error ?? GENERIC_ERROR)
    } else if (state.state === 'signedIn') {
      await finish(state)
    } else {
      setError(state.error ?? GENERIC_ERROR)
    }
  }

  const handleCode = async () => {
    const state = await authApi.setAuthState({
      action: 'confirmSignUp',
      username: email,
      code: code.trim(),
    })
    if (state.state === 'signedOut' && !state.error) {
      // Confirmed: sign in automatically with the stored credentials.
      await signIn()
    } else if (hasAuthError(state, CODE_MISMATCH) || hasAuthError(state, EXPIRED_CODE)) {
      setError('Invalid or expired verification code')
    } else if (state.state === 'signedIn') {
      await finish(state)
    } else {
      setError(state.error ?? GENERIC_ERROR)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (step === 'code') {
        await handleCode()
      } else {
        await handleCredentials()
      }
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setLoading(false)
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
          {step === 'code' && (
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
              <p className="text-sm text-muted-foreground">
                Enter the code we sent to {email}
              </p>
            </div>
          )}
          {step === 'credentials' && isSignUp && (
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
          {step === 'credentials' && (
          <>
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
          </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? 'Please wait...'
              : step === 'code'
                ? 'Verify'
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
