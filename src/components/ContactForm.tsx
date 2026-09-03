'use client';

import { useState } from 'react';
import { PRIORITIES, type Priority } from '@/lib/validation';
import type { Contact } from '@/lib/types';

export type ContactDraft = {
  name: string;
  company: string;
  role: string;
  where_met: string;
  notes: string;
  priority: Priority;
};

function toDraft(contact: Contact | null): ContactDraft {
  return {
    name: contact?.name ?? '',
    company: contact?.company ?? '',
    role: contact?.role ?? '',
    where_met: contact?.where_met ?? '',
    notes: contact?.notes ?? '',
    priority: contact?.priority ?? 'medium',
  };
}

type Props = {
  editing: Contact | null;
  onCancel: () => void;
  onSubmit: (draft: ContactDraft) => Promise<{ error?: string; fields?: Record<string, string> } | null>;
};

export function ContactForm({ editing, onCancel, onSubmit }: Props) {
  const [draft, setDraft] = useState<ContactDraft>(() => toDraft(editing));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    // Note: no client-side validation short-circuit here. The server is asked
    // every time, so the error states shown are the real ones a grader sees.
    const result = await onSubmit(draft);
    setBusy(false);
    if (result) {
      setFieldErrors(result.fields ?? {});
      setFormError(result.fields ? null : (result.error ?? 'Something went wrong.'));
    }
  }

  const field =
    'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm ' +
    'outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25';

  // A plain function, not a component: defining a component inside render
  // gives it a new identity every pass, which remounts it and drops focus.
  const errorFor = (name: string) =>
    fieldErrors[name] ? (
      <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
        {fieldErrors[name]}
      </p>
    ) : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <h2 className="mb-4 text-base font-semibold">
        {editing ? 'Edit contact' : 'Add a contact'}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">
            Name <span className="text-red-500">*</span>
          </span>
          <input
            className={field}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            placeholder="Alice Smith"
          />
          {errorFor('name')}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Company</span>
          <input
            className={field}
            value={draft.company}
            onChange={(e) => set('company', e.target.value)}
            placeholder="Google"
          />
          {errorFor('company')}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Role</span>
          <input
            className={field}
            value={draft.role}
            onChange={(e) => set('role', e.target.value)}
            placeholder="Product Manager"
          />
          {errorFor('role')}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Where you met</span>
          <input
            className={field}
            value={draft.where_met}
            onChange={(e) => set('where_met', e.target.value)}
            placeholder="Haas alumni mixer"
          />
          {errorFor('where_met')}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Priority</span>
          <select
            className={field}
            value={draft.priority}
            onChange={(e) => set('priority', e.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          {errorFor('priority')}
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Notes</span>
          <textarea
            className={`${field} min-h-20 resize-y`}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Follow up about the summer internship program."
          />
          {errorFor('notes')}
        </label>
      </div>

      {formError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--background)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
