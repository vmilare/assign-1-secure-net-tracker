import { createClient } from '@neondatabase/neon-js';

/**
 * Server-side Data API client, scoped to ONE user's token.
 *
 * Note what is absent: DATABASE_URL. If the server connected with the database
 * owner's credentials it would bypass RLS entirely and every policy in
 * db/schema.sql would become decorative. Instead the caller's own JWT is
 * forwarded, so Postgres evaluates auth.user_id() as that user and the same
 * policies that protect direct Data API calls also protect these ones.
 */
export function dataApiAs(token: string) {
  const url = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_NEON_DATA_API_URL');

  return createClient({
    dataApi: { url, getToken: async () => token },
  });
}

/** Extract a Bearer token, or null when absent/malformed. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export const UNAUTHENTICATED = { error: 'You must be signed in.' } as const;

/** Columns returned to the client. user_id is deliberately not exposed. */
export const CONTACT_COLUMNS =
  'id,name,company,role,where_met,notes,priority,created_at,updated_at';
