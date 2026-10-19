-- 001_init.sql — initial schema ported from lib/db/schema.ts (Drizzle).
--
-- Drizzle declared these columns in camelCase, so every camelCase identifier is
-- double-quoted here; otherwise Postgres folds it to lowercase.
--
-- Numbered migration files run exactly once each and are tracked in the
-- `_migrations` table. Never edit a file that has already been applied — add a
-- new numbered migration instead.
--
-- NOTE: the Better Auth internal tables (`session`, `account`, `verification`)
-- are intentionally NOT created. The auth block now owns sessions and
-- credentials, so those tables have no owner in this app anymore.

-- App tables ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Profile / display-name record -------------------------------------------
-- `user` is a reserved word in Postgres, so the table name stays quoted.
-- Kept so the header can still show the signed-in user's name; `id` holds the
-- signed-in username (the email).

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
