-- Link Cognito identities to existing user rows without rewriting ids
-- (session/account FKs are not ON UPDATE CASCADE).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" text;
CREATE UNIQUE INDEX IF NOT EXISTS user_cognito_sub_key ON "user" ("cognitoSub");
