-- App tasks table. Column names are camelCase, so they must be double-quoted.
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Matches the per-user listing query pattern.
CREATE INDEX tasks_user_id_idx ON tasks ("userId");
