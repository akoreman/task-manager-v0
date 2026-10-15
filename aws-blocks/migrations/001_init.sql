-- 001_init.sql — initial schema ported from lib/db/schema.ts (Drizzle pg-core).
-- Idempotent: migrations run automatically (first query locally, CustomResource
-- Lambda on deploy) and are tracked in _migrations. Never run by hand.
--
-- Column names are camelCase and "user" is a reserved word, so both are quoted.
-- Better Auth's session/account/verification tables are intentionally omitted:
-- the Blocks auth block owns its own session store.

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
