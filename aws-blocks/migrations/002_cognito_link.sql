-- Identity link for Cognito auth (FKs to user.id are not ON UPDATE CASCADE, so ids stay stable).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" text UNIQUE;
