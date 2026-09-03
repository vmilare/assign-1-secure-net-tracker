'use client';

import { useCallback, useEffect, useState } from 'react';
import { neon } from './neon-browser';

export type SessionUser = { id?: string; email?: string; name?: string | null };
export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'signed-out' };

/**
 * Reads the current session. The response is unwrapped defensively because the
 * beta SDK returns { data: { user } } while some adapters return { user }
 * directly — accepting both avoids a hard dependency on the beta's exact shape.
 */
function extractUser(response: unknown): SessionUser | null {
  if (!response || typeof response !== 'object') return null;
  const root = response as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const user = data?.user;
  return user && typeof user === 'object' ? (user as SessionUser) : null;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = extractUser(await neon.auth.getSession());
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
    } catch {
      setState({ status: 'signed-out' });
    }
  }, []);

  // Resolved in a promise callback rather than the effect body, and guarded by
  // `active` so a session that resolves after unmount does not set state.
  useEffect(() => {
    let active = true;
    neon.auth
      .getSession()
      .then((response) => {
        if (!active) return;
        const user = extractUser(response);
        setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
      })
      .catch(() => {
        if (active) setState({ status: 'signed-out' });
      });
    return () => {
      active = false;
    };
  }, []);

  return { state, refresh };
}
