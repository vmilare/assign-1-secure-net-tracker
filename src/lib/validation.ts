import { z } from 'zod';

/**
 * Shared validation for contact records.
 *
 * This is the FIRST of two enforcement layers. It produces friendly, field-level
 * error messages and rejects malformed input early. It is deliberately NOT the
 * security boundary: the Neon Data API URL is public, so a caller can skip these
 * route handlers entirely. The non-bypassable checks are the CHECK constraints
 * and RLS policies in db/schema.sql. Both layers exist on purpose.
 */

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * Optional free-text field. Trims, enforces a length ceiling, and normalises
 * "" / undefined / null to null so the database stores a real NULL rather than
 * an empty string (keeps sorting and "is this set?" checks unambiguous).
 */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v));

const nameField = z
  .string({ error: 'Name is required' })
  .trim()
  .min(1, 'Name is required')
  .max(200, 'Name must be 200 characters or fewer');

const priorityField = z.enum(PRIORITIES, {
  error: `Priority must be one of: ${PRIORITIES.join(', ')}`,
});

const sharedFields = {
  name: nameField,
  company: optionalText(200, 'Company'),
  role: optionalText(200, 'Role'),
  where_met: optionalText(500, 'Where you met'),
  notes: optionalText(2000, 'Notes'),
};

/**
 * Create payload.
 *
 * strictObject() rejects unknown keys, which is what blocks mass-assignment:
 * a client POSTing { name, user_id: "<someone-else>" } gets a 400 instead of
 * having us forward an ownership claim to the database. user_id is never
 * accepted from input — the column default (auth.user_id()) assigns it.
 */
export const contactCreateSchema = z.strictObject({
  ...sharedFields,
  priority: priorityField.default('medium'),
});

/**
 * Update payload. Every field optional, but at least one must be present so an
 * empty PATCH is a clear 400 rather than a silent no-op.
 *
 * priority has no default here: defaulting on update would silently overwrite a
 * user's existing priority whenever the field was simply omitted.
 */
export const contactUpdateSchema = z
  .strictObject({ ...sharedFields, priority: priorityField })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    error: 'Provide at least one field to update',
  });

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

/** Whitelist for ?sort= so a caller cannot inject arbitrary column names. */
export const SORT_FIELDS = ['name', 'priority', 'company', 'created_at'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export function parseSort(raw: string | null): SortField {
  return (SORT_FIELDS as readonly string[]).includes(raw ?? '')
    ? (raw as SortField)
    : 'created_at';
}

export function parseDirection(raw: string | null): 'asc' | 'desc' {
  return raw === 'asc' ? 'asc' : 'desc';
}

export function parsePriorityFilter(raw: string | null): Priority | null {
  return (PRIORITIES as readonly string[]).includes(raw ?? '')
    ? (raw as Priority)
    : null;
}

/**
 * Flatten a ZodError into { field: message } for the API response.
 * Unknown-key errors have an empty path, so they are bucketed under "_form".
 */
export function formatIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    out[key] ??= issue.message;
  }
  return out;
}
