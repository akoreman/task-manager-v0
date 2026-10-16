'use client'

import { authApi } from 'aws-blocks'

export { authApi }

export const signIn = (email: string, password: string) =>
  authApi.signIn(email, password)

export const signUp = (name: string, email: string, password: string) =>
  authApi.signUp(name, email, password)

export const signOut = () => authApi.signOut()
