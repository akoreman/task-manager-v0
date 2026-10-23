-- Link column between existing user rows and Cognito identities. Do not rewrite "user".id.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" text UNIQUE;
