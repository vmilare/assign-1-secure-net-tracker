'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, neon } from '@/lib/neon-browser';
import { useSession } from '@/lib/use-session';
import { ContactForm, type ContactDraft } from '@/components/ContactForm';
import { ContactList } from '@/components/ContactList';
import { ContactFilters, type Query } from '@/components/ContactFilters';
import type { ApiError, Contact } from '@/lib/types';
import { describeError } from '@/lib/errors';

const INITIAL_QUERY: Query = { sort: 'created_at', dir: 'desc', priority: '', q: '' };

export default function ContactsPage() {
  const router = useRouter();
  const { state, refresh } = useSession();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>(INITIAL_QUERY);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Signed out (or session expired) -> back to the sign-in screen.
  useEffect(() => {
    if (state.status === 'signed-out') router.replace('/');
  }, [state.status, router]);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query.q), 250);
    return () => clearTimeout(timer);
  }, [query.q]);

  // Fetching is kept separate from applying the result so the effect below can
  // discard a response that arrived after the filters moved on. Without that
  // guard, a slow request for "high priority" can land after a faster request
  // for "all" and repopulate the list with the wrong rows.
  type LoadResult = { contacts: Contact[] } | { error: string } | { expired: true };

  const fetchContacts = useCallback(async (): Promise<LoadResult> => {
    const params = new URLSearchParams({ sort: query.sort, dir: query.dir });
    if (query.priority) params.set('priority', query.priority);
    if (debouncedSearch) params.set('q', debouncedSearch);

    try {
      const response = await apiFetch(`/api/contacts?${params}`);
      if (response.status === 401) return { expired: true };
      const body = await response.json();
      if (!response.ok) {
        return { error: (body as ApiError).error ?? 'Could not load your contacts.' };
      }
      return { contacts: body.contacts as Contact[] };
    } catch (thrown) {
      return { error: describeError(thrown, 'Could not load your contacts') };
    }
  }, [query.sort, query.dir, query.priority, debouncedSearch]);

  const applyResult = useCallback(
    (result: LoadResult) => {
      setLoading(false);
      if ('expired' in result) {
        void refresh();
        return;
      }
      if ('error' in result) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setContacts(result.contacts);
    },
    [refresh],
  );

  useEffect(() => {
    if (state.status !== 'signed-in') return;
    let active = true;
    void fetchContacts().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [state.status, fetchContacts, applyResult]);

  /** Explicit reload after a mutation or a Retry click. */
  const reload = useCallback(async () => {
    applyResult(await fetchContacts());
  }, [fetchContacts, applyResult]);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  async function submitContact(draft: ContactDraft) {
    const editingId = editing?.id;
    const response = await apiFetch(
      editingId ? `/api/contacts/${editingId}` : '/api/contacts',
      { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(draft) },
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: (body as ApiError).error, fields: (body as ApiError).fields };
    }
    setFormOpen(false);
    setEditing(null);
    flash(editingId ? 'Contact updated.' : 'Contact added.');
    await reload();
    return null;
  }

  async function deleteContact(contact: Contact) {
    if (!confirm(`Delete ${contact.name}? This cannot be undone.`)) return;
    setPendingDeleteId(contact.id);
    try {
      const response = await apiFetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        setLoadError(body.error ?? 'Could not delete that contact.');
        return;
      }
      flash('Contact deleted.');
      await reload();
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleSignOut() {
    await neon.auth.signOut();
    await refresh();
    router.replace('/');
  }

  if (state.status !== 'signed-in') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  const filtersActive = Boolean(query.priority || debouncedSearch);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Networking Tracker</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Signed in as {state.user.email ?? state.user.name ?? 'you'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Add contact
          </button>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--surface)]"
          >
            Sign out
          </button>
        </div>
      </header>

      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {notice}
        </p>
      )}

      {formOpen && (
        <div className="mb-6">
          <ContactForm
            editing={editing}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onSubmit={submitContact}
          />
        </div>
      )}

      <div className="mb-5">
        <ContactFilters query={query} onChange={setQuery} />
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {loadError}{' '}
          <button onClick={() => void reload()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">Loading your contacts…</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <p className="font-medium">
            {filtersActive ? 'No contacts match those filters.' : 'No contacts yet.'}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filtersActive
              ? 'Try clearing the search or priority filter.'
              : 'Add the first person you want to stay connected with.'}
          </p>
          {filtersActive && (
            <button
              onClick={() => setQuery(INITIAL_QUERY)}
              className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--surface)]"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--muted)]">
            {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
          </p>
          <ContactList
            contacts={contacts}
            pendingDeleteId={pendingDeleteId}
            onEdit={(c) => {
              setEditing(c);
              setFormOpen(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDelete={deleteContact}
          />
        </>
      )}
    </main>
  );
}
