/**
 * Browser-safe AuthBasic error constants.
 *
 * The `@aws-blocks/blocks` root export is empty under the `browser` condition,
 * and `@aws-blocks/bb-auth-basic`'s browser build is a server-only stub that
 * imports `ApiNamespace` from `@aws-blocks/core` (absent from the core browser
 * entry). Neither can be bundled into a client component, so the one constant
 * the auth form branches on is mirrored here and type-checked against the
 * Building Block's own declaration: if the BB renames or re-values
 * `AuthBasicErrors`, this file fails to compile instead of silently drifting.
 *
 * The `typeof import(...)` form is a pure type reference — it is erased at
 * build time and pulls nothing into the client bundle.
 */
type AuthBasicErrorConstants =
  typeof import('@aws-blocks/bb-auth-basic')['AuthBasicErrors']

export const AuthBasicErrors: Pick<
  AuthBasicErrorConstants,
  'InvalidCredentials'
> = {
  InvalidCredentials: 'InvalidCredentialsException',
}
