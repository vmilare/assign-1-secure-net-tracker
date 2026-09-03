import type { Priority } from './validation';

export type Contact = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  where_met: string | null;
  notes: string | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
};

/** Shape returned by the route handlers on a validation failure. */
export type ApiError = { error: string; fields?: Record<string, string> };
