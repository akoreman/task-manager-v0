'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authApi, api } from 'aws-blocks'
import { hasAuthError } from '@aws-blocks/blocks/client'
import type { AuthBasicErrors } from '@aws-blocks/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

// `@aws-blocks/blocks` resolves to its browser build inside a client component,
// and that build intentionally exports no runtime values — so the
// `AuthBasicErrors` *value* cannot be imported here, only its type. The
// structured error name is therefore pinned to the block's own constant type:
// if AuthBasic ever renames it, this fails to compile instead of silently
// never matching. `hasAuthError` itself is browser-safe via
// `@aws-blocks/blocks/client`.
const INVALID_CREDENTIALS: (typeof AuthBasicErrors)['InvalidCredentials'] =
  'InvalidCredentialsException'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Flat input — the AuthBasic state machine takes `action` alongside the
      // credentials, never a nested `{ action, data }` payload.
      const state = await authApi.setAuthState({
        action: isSignUp ? 'signUp' : 'signIn',
        username: email,
        password,
      })

      // `setAuthState` resolves instead of throwing: errors arrive on the state.
      if (state.errorName) {
        setError(
          hasAuthError(state, INVALID_CREDENTIALS)
            ? (state.error ?? 'Incorrect email or password')
            : (state.error ?? 'Something went wrong'),
        )
        return
      }

      // The Name field is app data, not a Cognito attribute — persist it so the
      // header's display name keeps working.
      if (isSignUp) {
        await api.saveProfile(name)
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong')
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
