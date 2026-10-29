-- Link column so a Cognito account can be relinked to an existing user row
-- (and its tasks) without changing ids. session/account FKs are not
-- ON UPDATE CASCADE, so "user"."id" must never be updated.
ALTER TABLE "user" ADD COLUMN "cognitoSub" text UNIQUE;
