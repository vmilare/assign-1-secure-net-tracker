/**
 * Translate Postgres/PostgREST errors into messages a user can act on.
 *
 * These fire when the DATABASE rejects something — the trusted layer. Reaching
 * one of these means either a direct Data API call bypassed our Zod checks, or
 * our checks drifted out of sync with db/schema.sql. Either way the data stayed
 * correct, which is the point of enforcing in both places.
 */
type PgErrorLike = { code?: string; message?: string } | null | undefined;

export function describeDbError(error: PgErrorLike): { status: number; message: string } {
  const code = error?.code ?? '';
  const message = error?.message ?? '';

  // 23514 = check_violation
  if (code === '23514') {
    if (message.includes('contacts_priority_valid')) {
      return { status: 400, message: 'Priority must be one of: high, medium, low.' };
    }
    if (message.includes('contacts_name_not_blank')) {
      return { status: 400, message: 'Name is required.' };
    }
    return { status: 400, message: 'That value is not allowed.' };
  }

  // 23502 = not_null_violation, 42501 = insufficient_privilege (RLS refusal)
  if (code === '23502') return { status: 400, message: 'A required field was missing.' };
  if (code === '42501') {
    return { status: 403, message: 'You do not have access to that contact.' };
  }

  return { status: 500, message: 'Something went wrong. Please try again.' };
}
