'use client';

import { PRIORITIES, SORT_FIELDS, type Priority, type SortField } from '@/lib/validation';

export type Query = {
  sort: SortField;
  dir: 'asc' | 'desc';
  priority: Priority | '';
  q: string;
};

const SORT_LABELS: Record<SortField, string> = {
  name: 'Name',
  priority: 'Priority',
  company: 'Company',
  created_at: 'Date added',
};

export function ContactFilters({
  query,
  onChange,
}: {
  query: Query;
  onChange: (next: Query) => void;
}) {
  const control =
    'rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ' +
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex-1 sm:min-w-56">
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Search</span>
        <input
          className={`${control} w-full`}
          value={query.q}
          onChange={(e) => onChange({ ...query, q: e.target.value })}
          placeholder="Name or company"
          type="search"
        />
      </label>

      <label>
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Priority</span>
        <select
          className={control}
          value={query.priority}
          onChange={(e) => onChange({ ...query, priority: e.target.value as Priority | '' })}
        >
          <option value="">All</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Sort by</span>
        <select
          className={control}
          value={query.sort}
          onChange={(e) => onChange({ ...query, sort: e.target.value as SortField })}
        >
          {SORT_FIELDS.map((f) => (
            <option key={f} value={f}>
              {SORT_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => onChange({ ...query, dir: query.dir === 'asc' ? 'desc' : 'asc' })}
        className={`${control} font-medium`}
        aria-label={`Sort ${query.dir === 'asc' ? 'ascending' : 'descending'}, click to reverse`}
      >
        {query.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>
    </div>
  );
}
