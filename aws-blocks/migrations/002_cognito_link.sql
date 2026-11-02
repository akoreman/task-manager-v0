-- Link column for Cognito identities. "user".id is referenced by FKs without
-- ON UPDATE CASCADE, so existing ids must never be rewritten; map via cognitoSub.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" text UNIQUE;
