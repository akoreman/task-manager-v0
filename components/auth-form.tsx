'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, authApi } from 'aws-blocks'
import { hasAuthError } from '@aws-blocks/blocks/client'
import { broadcastAuthChange } from '@aws-blocks/blocks/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

// Cognito wire-format error names (the root @aws-blocks/blocks entry is server-only).
const USERNAME_EXISTS = 'UsernameExistsException'
const NOT_AUTHORIZED = 'NotAuthorizedException'
const INVALID_PASSWORD = 'InvalidPasswordException'
const USER_NOT_CONFIRMED = 'UserNotConfirmedException'
const CODE_MISMATCH = 'CodeMismatchException'
const EXPIRED_CODE = 'ExpiredCodeException'

type AuthState = Awaited<ReturnType<typeof authApi.getAuthState>>

function toSafeNext(next?: string): string {
  if (next && next.startsWith('/') && next[1] !== '/' && next[1] !== '\\') return next
  return '/'
}

export function AuthForm({ mode, next }: { mode: 'sign-in' | 'sign-up'; next?: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'credentials' | 'code'>('credentials')
  const [canResend, setCanResend] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'
  const safeNext = toSafeNext(next)

  const finishSignIn = async (state: AuthState) => {
    await api.syncUser(isSignUp ? name : undefined)
    broadcastAuthChange(state.user ?? null)
    router.push(safeNext)
    router.refresh()
  }

  const goToCodeStep = (state: AuthState) => {
    setCanResend(state.actions.some((a) => a.name === 'resendSignUpCode'))
    setCode('')
    setStep('code')
  }

  const signIn = async () => {
    const state = await authApi.setAuthState({ action: 'signIn', username: email, password })
    if (state.state === 'signedIn') {
      await finishSignIn(state)
      return
    }
    if (hasAuthError(state, USER_NOT_CONFIRMED)) {
      goToCodeStep(state)
      setInfo('Your email is not verified yet. Enter the code we emailed you.')
      return
    }
    if (hasAuthError(state, NOT_AUTHORIZED)) {
      setError('Invalid email or password')
      return
    }
    setError(state.error ?? 'Something went wrong')
  }

  const signUp = async () => {
    const state = await authApi.setAuthState({
      action: 'signUp',
      username: email,
      password,
      email,
    })
    if (state.state === 'confirmingSignUp') {
      goToCodeStep(state)
      setInfo(`We sent a verification code to ${email}.`)
      return
    }
    if (hasAuthError(state, USERNAME_EXISTS)) {
      setError('User already exists. Use another email.')
      return
    }
    if (hasAuthError(state, INVALID_PASSWORD)) {
      setError(state.error ?? 'Invalid password')
      return
    }
    setError(state.error ?? 'Something went wrong')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (isSignUp) await signUp()
      else await signIn()
    } catch {
      setError('Something went wrong. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const state = await authApi.setAuthState({
        action: 'confirmSignUp',
        username: email,
        code: code.trim(),
      })
      if (hasAuthError(state, CODE_MISMATCH) || hasAuthError(state, EXPIRED_CODE)) {
        setError('Invalid or expired verification code')
        return
      }
      if (state.error) {
        setError(state.error)
        return
      }
      if (state.state === 'signedIn') {
        await finishSignIn(state)
        return
      }
      // Confirmed: sign in automatically with the same credentials.
      await signIn()
    } catch {
      setError('Something went wrong. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      const state = await authApi.setAuthState({ action: 'resendSignUpCode', username: email })
      if (state.error) setError(state.error)
      else setInfo(`A new code was sent to ${email}.`)
    } catch {
      setError('Something went wrong. Check your connection and try again.')
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
              Enter the verification code sent to {email}
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

            {info && <p className="text-sm text-muted-foreground">{info}</p>}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Please wait...' : 'Verify'}
            </Button>
            {canResend && (
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={handleResend}
                className="w-full"
              >
                Resend code
              </Button>
            )}
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

          {info && <p className="text-sm text-muted-foreground">{info}</p>}
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
