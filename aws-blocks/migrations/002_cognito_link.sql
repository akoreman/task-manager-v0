-- Link Cognito identities to existing users without rewriting user.id
-- (FKs to user.id are not ON UPDATE CASCADE).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" text UNIQUE;
