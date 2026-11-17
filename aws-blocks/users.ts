import { sql, isBlocksError, DatabaseErrors, type BlocksContext } from '@aws-blocks/blocks';
import { auth, db } from './resources.js';
import { withResumeRetry } from './resume-retry.js';

export interface AppUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Resolve the signed-in Cognito user to the app's "user" row, creating or
 * relinking it on first sign-in (better-auth used to create this row).
 * Throws 401 when signed out. Callers use the returned `id` (not the sub)
 * for every user-scoped query, e.g. tasks."userId".
 */
export async function getAppUser(
  context: BlocksContext,
  deadline: number,
  name?: string,
): Promise<AppUser> {
  const cu = await auth.requireAuth(context);
  const sub = cu.userSub;
  // With signInWith: 'email', cu.username is a UUID; the email is an attribute.
  const email = cu.attributes.email;
  if (!email) throw new Error('Signed-in user has no email attribute');
  const newName = name?.trim() || undefined;

  const lookup = async (): Promise<AppUser | null> => {
    const bySub = await withResumeRetry(
      () => db.queryOne<AppUser>(
        sql`SELECT "id", "name", "email" FROM "user" WHERE "cognitoSub" = ${sub}`,
      ),
      deadline,
    );
    if (bySub) {
      if (newName && newName !== bySub.name) {
        const updated = await withResumeRetry(
          () => db.queryOne<AppUser>(
            sql`UPDATE "user" SET "name" = ${newName}, "updatedAt" = now()
                WHERE "id" = ${bySub.id}
                RETURNING "id", "name", "email"`,
          ),
          deadline,
        );
        return updated ?? bySub;
      }
      return bySub;
    }

    // Relink an existing (pre-Cognito) row by email. Keep its id: foreign keys
    // and tasks."userId" point at it.
    const relinked = await withResumeRetry(
      () => newName
        ? db.queryOne<AppUser>(
            sql`UPDATE "user" SET "cognitoSub" = ${sub}, "name" = ${newName}, "updatedAt" = now()
                WHERE lower("email") = lower(${email})
                RETURNING "id", "name", "email"`,
          )
        : db.queryOne<AppUser>(
            sql`UPDATE "user" SET "cognitoSub" = ${sub}, "updatedAt" = now()
                WHERE lower("email") = lower(${email})
                RETURNING "id", "name", "email"`,
          ),
      deadline,
    );
    return relinked ?? null;
  };

  const existing = await lookup();
  if (existing) return existing;

  try {
    const inserted = await withResumeRetry(
      () => db.queryOne<AppUser>(
        sql`INSERT INTO "user" ("id", "name", "email", "emailVerified", "cognitoSub")
            VALUES (${sub}, ${newName || email}, ${email}, ${true}, ${sub})
            RETURNING "id", "name", "email"`,
      ),
      deadline,
    );
    if (inserted) return inserted;
  } catch (e) {
    // A concurrent first sign-in created/linked the row: re-run the lookups once.
    if (!isBlocksError(e, DatabaseErrors.UniqueConstraintViolation)) throw e;
  }

  const again = await lookup();
  if (again) return again;
  throw new Error('Could not create or link the app user row');
}
