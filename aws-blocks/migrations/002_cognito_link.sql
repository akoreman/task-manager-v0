-- Link app users to Cognito identities. user.id is not rewritten: session/account FKs
-- are not ON UPDATE CASCADE and tasks."userId" holds existing ids.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" text UNIQUE;
