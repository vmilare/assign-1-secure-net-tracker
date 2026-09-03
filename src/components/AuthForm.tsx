'use client';

import { useState } from 'react';
import { neon } from '@/lib/neon-browser';

type Mode = 'signin' | 'signup';

const NETWORK_ERROR =
  'Could not reach the authentication service. Check your connection and try again.';

/** Friendlier wording for the codes Neon Auth returns most often. */
const FRIENDLY: Record<string, string> = {
  USER_ALREADY_EXISTS: 'An account with that email already exists. Try signing in instead.',
  INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
  PASSWORD_TOO_SHORT: 'Password is too short.',
  VALIDATION_ERROR: 'Please check the email address and try again.',
};

function readMessage(source: unknown): { message?: string; code?: string; status?: number } {
  if (!source || typeof source !== 'object') return {};
  const o = source as Record<string, unknown>;
  const nested = (o.body ?? o.error ?? o.response ?? {}) as Record<string, unknown>;
  return {
    message:
      typeof nested.message === 'string'
        ? nested.message
        : typeof o.message === 'string'
          ? o.message
          : undefined,
    code:
      typeof nested.code === 'string' ? nested.code : typeof o.code === 'string' ? o.code : undefined,
    status:
      typeof o.status === 'number'
        ? o.status
        : typeof o.statusCode === 'number'
          ? o.statusCode
          : undefined,
  };
}

/**
 * Turn whatever the SDK produced into something a user can act on.
 *
 * @neondatabase/neon-js THROWS on non-2xx rather than returning { error }, so
 * an earlier version of this component caught everything and reported a
 * connection failure — hiding real messages like "user already exists" behind
 * "could not reach the service". Both shapes are handled here, and a genuine
 * network failure is distinguished by the absence of an HTTP status.
 */
function describeAuthFailure(source: unknown, fallback: string): string {
  const { message, code, status } = readMessage(source);

  if (code && FRIENDLY[code]) return FRIENDLY[code];
  if (message && message !== 'Failed to fetch' && !/NetworkError/i.test(message)) {
    // Neon prefixes field errors with the request path, e.g.
    // "[body.email] Invalid email address" - useful in logs, noise for a user.
    return message.replace(/^\[[^\]]+\]\s*/, '');
  }
  if (status) return `${fallback} (HTTP ${status})`;
  return NETWORK_ERROR;
}

export function AuthForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    const fallback =
      mode === 'signup' ? 'Could not create that account.' : 'Could not sign you in.';

    setBusy(true);
    try {
      const result =
        mode === 'signup'
          ? await neon.auth.signUp.email({ email, password, name: name || email })
          : await neon.auth.signIn.email({ email, password });

      // Some SDK versions resolve with an { error } payload instead of throwing.
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setError(describeAuthFailure(result.error, fallback));
        return;
      }
      onAuthenticated();
    } catch (thrown) {
      setError(describeAuthFailure(thrown, fallback));
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm ' +
    'outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25';

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 text-sm">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            aria-pressed={mode === m}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
              mode === m ? 'bg-blue-600 text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {mode === 'signup' && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          className={field}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@berkeley.edu"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input
          className={field}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
