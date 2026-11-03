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

// Cognito error names (wire values); the root '@aws-blocks/blocks' entry exports nothing in the browser.
const USERNAME_EXISTS = 'UsernameExistsException'
const NOT_AUTHORIZED = 'NotAuthorizedException'
const INVALID_PASSWORD = 'InvalidPasswordException'
const USER_NOT_CONFIRMED = 'UserNotConfirmedException'
const CODE_MISMATCH = 'CodeMismatchException'

type AuthState = Awaited<ReturnType<typeof authApi.setAuthState>>

/** Only same-origin paths: a single leading '/' not followed by '/' or '\'. */
function safeNext(): string {
  if (typeof window === 'undefined') return '/'
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && next[1] !== '/' && next[1] !== '\\') {
    return next
  }
  return '/'
}

function errorMessage(state: AuthState): string {
  if (hasAuthError(state, USERNAME_EXISTS)) return 'An account with this email already exists'
  if (hasAuthError(state, NOT_AUTHORIZED)) return 'Invalid email or password'
  if (hasAuthError(state, INVALID_PASSWORD)) return state.error ?? 'Invalid password'
  if (hasAuthError(state, CODE_MISMATCH)) return 'Invalid verification code'
  return state.error ?? 'Something went wrong'
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const finishSignIn = async (state: AuthState) => {
    await api.syncUser(isSignUp ? name : undefined)
    broadcastAuthChange(state.user ?? null)
    router.push(safeNext())
    router.refresh()
  }

  const signIn = async () => {
    const state = await authApi.setAuthState({ action: 'signIn', username: email, password })
    if (state.state === 'signedIn') {
      await finishSignIn(state)
      return
    }
    if (hasAuthError(state, USER_NOT_CONFIRMED)) {
      setConfirming(true)
      setError('Please enter the verification code sent to your email')
      return
    }
    setError(errorMessage(state))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (confirming) {
        const state = await authApi.setAuthState({
          action: 'confirmSignUp',
          username: email,
          code: code.trim(),
        })
        if (state.error || state.errorName) {
          setError(errorMessage(state))
          return
        }
        setConfirming(false)
        setCode('')
        await signIn()
        return
      }

      if (isSignUp) {
        const state = await authApi.setAuthState({
          action: 'signUp',
          username: email,
          password,
          email,
        })
        if (state.state === 'confirmingSignUp') {
          setConfirming(true)
          return
        }
        if (state.state === 'signedIn') {
          await finishSignIn(state)
          return
        }
        setError(errorMessage(state))
        return
      }

      await signIn()
    } catch (err) {
      console.error(err)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-svh bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
            {confirming
              ? 'Verify your email'
              : isSignUp
                ? 'Create an account'
                : 'Welcome back'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {confirming
              ? `Enter the verification code we sent to ${email}`
              : isSignUp
                ? 'Sign up to start managing your tasks'
                : 'Sign in to your account to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {confirming ? (
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
          ) : (
            <>
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
              : confirming
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
