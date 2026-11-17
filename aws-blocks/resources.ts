import { Scope, Database, AuthCognito } from '@aws-blocks/blocks';

export const scope = new Scope('task-manager-v0');

export const db = new Database(scope, 'main', {
  migrationsPath: './aws-blocks/migrations',
  minCapacity: 0,
});

// signInWith is fixed at first deploy (changing it later is destructive).
// Password rule matches the old better-auth setup: 8+ characters, no class rules.
export const auth = new AuthCognito(scope, 'auth', {
  signInWith: 'email',
  selfSignUp: true,
  passwordPolicy: {
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireDigits: false,
    requireSymbols: false,
  },
});
