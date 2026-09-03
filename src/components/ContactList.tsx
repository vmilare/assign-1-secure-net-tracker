'use client';

import type { Contact } from '@/lib/types';
import type { Priority } from '@/lib/validation';

const PRIORITY_STYLE: Record<Priority, string> = {
  high: 'bg-red-500/12 text-red-700 dark:text-red-400',
  medium: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  low: 'bg-slate-500/12 text-slate-700 dark:text-slate-300',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[priority]}`}>
      {priority[0].toUpperCase() + priority.slice(1)}
    </span>
  );
}

type Props = {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  pendingDeleteId: string | null;
};

export function ContactList({ contacts, onEdit, onDelete, pendingDeleteId }: Props) {
  const actionBtn =
    'rounded-md px-2 py-1 text-xs font-medium transition hover:bg-[var(--background)]';

  return (
    <>
      {/* Mobile: stacked cards. The table below would overflow at 375px. */}
      <ul className="space-y-3 sm:hidden">
        {contacts.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-sm text-[var(--muted)]">
                  {[c.role, c.company].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <PriorityBadge priority={c.priority} />
            </div>
            {c.where_met && (
              <p className="mt-2 text-sm text-[var(--muted)]">Met at {c.where_met}</p>
            )}
            {c.notes && <p className="mt-2 text-sm">{c.notes}</p>}
            <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
              <button className={`${actionBtn} text-blue-600`} onClick={() => onEdit(c)}>
                Edit
              </button>
              <button
                className={`${actionBtn} text-red-600 disabled:opacity-50`}
                onClick={() => onDelete(c)}
                disabled={pendingDeleteId === c.id}
              >
                {pendingDeleteId === c.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table. */}
      <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Company</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Where met</th>
              <th scope="col" className="px-4 py-3 font-medium">Priority</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-medium">
                  {c.name}
                  {c.notes && (
                    <p className="mt-0.5 max-w-xs truncate text-xs font-normal text-[var(--muted)]">
                      {c.notes}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{c.company || '—'}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{c.role || '—'}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{c.where_met || '—'}</td>
                <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button className={`${actionBtn} text-blue-600`} onClick={() => onEdit(c)}>
                      Edit
                    </button>
                    <button
                      className={`${actionBtn} text-red-600 disabled:opacity-50`}
                      onClick={() => onDelete(c)}
                      disabled={pendingDeleteId === c.id}
                    >
                      {pendingDeleteId === c.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
