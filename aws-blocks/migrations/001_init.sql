-- App tables ported from lib/db/schema.ts (Drizzle).
-- camelCase identifiers are quoted so Postgres preserves their case.

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- Display name collected by the sign-up form (previously Better Auth user.name).
CREATE TABLE profile (
  "userId" TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
