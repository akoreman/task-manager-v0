-- Link Cognito users via a separate column (session/account FKs are not ON UPDATE CASCADE).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cognitoSub" TEXT UNIQUE;
