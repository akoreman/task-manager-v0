-- 001_init.sql — initial schema, ported one-for-one from lib/db/schema.ts.
--
-- Column names stay camelCase (Drizzle's originals), so they must be
-- double-quoted in Postgres. Id types are preserved: TEXT for "user",
-- SERIAL for tasks.
--
-- Deliberately NOT re-created here: the Better Auth internal tables
-- "session", "account" and "verification". No application code reads them,
-- and the AuthBasic block owns sessions and credentials after this migration.
--
-- Migrations are numbered, run once and tracked in the _migrations table.
-- Never edit this file after a deploy — add 002_*.sql instead.

-- "user" is a reserved word in Postgres: always quote it.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- Supports the per-user task listing.
CREATE INDEX tasks_user_id_idx ON tasks ("userId");
