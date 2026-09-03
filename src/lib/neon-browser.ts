'use client';

import { createClient } from '@neondatabase/neon-js';

/**
 * Browser-side Neon client — the two-URL object form.
 *
 * Both URLs are public by design. They are endpoints, not credentials: holding
 * them grants nothing, because every row is gated by the RLS policies in
 * db/schema.sql. No secret is ever shipped to the browser.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in the values from the Neon Console.`,
    );
  }
  return value;
}

export const neon = createClient({
  auth: {
    url: requireEnv('NEXT_PUBLIC_NEON_AUTH_URL', process.env.NEXT_PUBLIC_NEON_AUTH_URL),
  },
  dataApi: {
    url: requireEnv('NEXT_PUBLIC_NEON_DATA_API_URL', process.env.NEXT_PUBLIC_NEON_DATA_API_URL),
  },
});

/**
 * The JWT for the signed-in user, sent to our own route handlers as a Bearer
 * token. The handlers forward it to the Data API so queries execute AS that
 * user and RLS still applies -- the server never holds elevated privileges.
 *
 * Why this calls the endpoint directly instead of using the SDK's
 * getJWTToken(): on @neondatabase/neon-js@0.7.0-beta that helper requests
 * `<authUrl>/api/auth/token`, applying better-auth's default base path. Neon's
 * managed deployment serves the endpoint at `<authUrl>/token`, so the SDK call
 * returns 404. Verified by probing every candidate path -- only `/token`
 * exists. The SDK helper is kept below as a fallback in case a later version
 * fixes the path and the direct call is the one that breaks.
 *
 * credentials: 'include' is required: the session cookie is set by the Neon
 * Auth origin, which is cross-origin relative to this app.
 */
const AUTH_URL = requireEnv(
  'NEXT_PUBLIC_NEON_AUTH_URL',
  process.env.NEXT_PUBLIC_NEON_AUTH_URL,
).replace(/\/+$/, '');

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  const candidate = o.token ?? o.jwt ?? o.access_token ?? (o.data as Record<string, unknown>)?.token;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

async function tokenFromEndpoint(): Promise<string | null> {
  const response = await fetch(`${AUTH_URL}/token`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) return null; // not signed in
  if (!response.ok) throw new Error(`token endpoint returned HTTP ${response.status}`);
  return extractToken(await response.json());
}

async function tokenFromSdk(): Promise<string | null> {
  const auth = neon.auth as unknown as { getJWTToken?: () => Promise<string | null> };
  if (typeof auth.getJWTToken !== 'function') return null;
  return auth.getJWTToken();
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await tokenFromEndpoint();
  } catch (endpointError) {
    try {
      return await tokenFromSdk();
    } catch {
      throw endpointError;
    }
  }
}

/** Wrapper around fetch that attaches the caller's token. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Distinguish "could not mint a token" from "the API call failed" -- these
  // have very different causes and were previously indistinguishable.
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch (thrown) {
    const detail = thrown instanceof Error ? thrown.message : String(thrown);
    throw new Error(`Could not get an access token: ${detail}`);
  }
  if (!token) {
    throw new Error('Not signed in (no access token available). Try signing in again.');
  }
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
