'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { useSession } from '@/lib/use-session';

export default function HomePage() {
  const router = useRouter();
  const { state, refresh } = useSession();

  useEffect(() => {
    if (state.status === 'signed-in') router.replace('/contacts');
  }, [state.status, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Networking Tracker</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          A private list of the people you want to stay connected with at Berkeley. Only you can
          see your contacts.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        {state.status === 'loading' ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Checking your session…</p>
        ) : (
          <AuthForm onAuthenticated={refresh} />
        )}
      </div>
    </main>
  );
}
