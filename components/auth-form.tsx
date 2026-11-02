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

// Cognito error names (wire values). The root '@aws-blocks/blocks' entry exports nothing in the browser.
const USERNAME_EXISTS = 'UsernameExistsException'
const NOT_AUTHORIZED = 'NotAuthorizedException'
const INVALID_PASSWORD = 'InvalidPasswordException'
const USER_NOT_CONFIRMED = 'UserNotConfirmedException'
const CODE_MISMATCH = 'CodeMismatchException'

const NETWORK_ERROR = 'Could not reach the server. Please try again.'

/** Only same-origin paths: a single leading "/" not followed by "/" or "\". */
function safeNext(): string {
  if (typeof window === 'undefined') return '/'
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && next[1] !== '/' && next[1] !== '\\') return next
  return '/'
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

  const finishSignIn = async (displayName?: string) => {
    await api.syncUser(displayName)
    broadcastAuthChange()
    router.push(safeNext())
    router.refresh()
  }

  /** Signs in with the email/password in component state. Returns true on success. */
  const signIn = async (): Promise<boolean> => {
    const s = await authApi.setAuthState({ action: 'signIn', username: email, password })
    if (s.state === 'signedIn') return true
    if (hasAuthError(s, USER_NOT_CONFIRMED)) {
      setConfirming(true)
      setError(null)
      return false
    }
    if (hasAuthError(s, NOT_AUTHORIZED)) setError('Invalid email or password')
    else setError(s.error ?? 'Something went wrong')
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const s = await authApi.setAuthState({
          action: 'signUp',
          username: email,
          password,
          email,
        })
        if (s.state === 'confirmingSignUp') {
          setConfirming(true)
        } else if (s.state === 'signedIn') {
          await finishSignIn(name)
        } else if (hasAuthError(s, USERNAME_EXISTS)) {
          setError('An account with this email already exists')
        } else if (hasAuthError(s, INVALID_PASSWORD)) {
          setError('Password must be at least 8 characters')
        } else {
          setError(s.error ?? 'Something went wrong')
        }
      } else if (await signIn()) {
        await finishSignIn()
      }
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const s = await authApi.setAuthState({
        action: 'confirmSignUp',
        username: email,
        code: code.trim(),
      })
      if (s.state === 'signedOut' || s.state === 'signedIn') {
        if (s.state === 'signedIn' || (await signIn())) {
          await finishSignIn(isSignUp ? name : undefined)
        }
      } else if (hasAuthError(s, CODE_MISMATCH)) {
        setError('Invalid code')
      } else {
        setError(s.error ?? 'Something went wrong')
      }
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <main className="min-h-svh bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
              Check your email
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              We emailed you a code. Enter it below to confirm {email}.
            </p>
          </div>

          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Confirmation code</Label>
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
              {loading ? 'Please wait...' : 'Confirm'}
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
