-- App table: tasks (ported from lib/db/schema.ts).
-- SERIAL is kept so task ids stay numeric, which the frontend relies on.

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
