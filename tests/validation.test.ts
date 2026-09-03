import { describe, it, expect } from 'vitest';
import {
  contactCreateSchema,
  contactUpdateSchema,
  formatIssues,
  parseSort,
  parseDirection,
  parsePriorityFilter,
} from '@/lib/validation';

describe('contactCreateSchema — required fields', () => {
  it('rejects a missing name', () => {
    const result = contactCreateSchema.safeParse({ priority: 'high' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error).name).toBe('Name is required');
    }
  });

  it('rejects an empty name', () => {
    const result = contactCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error).name).toBe('Name is required');
    }
  });

  it('rejects a whitespace-only name', () => {
    // The case an untrimmed .min(1) would wrongly accept. db/schema.sql
    // enforces the same rule with check (length(btrim(name)) > 0).
    const result = contactCreateSchema.safeParse({ name: '   \t  ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error).name).toBe('Name is required');
    }
  });

  it('trims a valid name', () => {
    const result = contactCreateSchema.safeParse({ name: '  Alice Smith  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Alice Smith');
  });
});

describe('contactCreateSchema — priority', () => {
  it.each(['high', 'medium', 'low'])('accepts priority %s', (priority) => {
    const result = contactCreateSchema.safeParse({ name: 'Alice', priority });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe(priority);
  });

  it('rejects a priority outside the allowed set', () => {
    const result = contactCreateSchema.safeParse({ name: 'Alice', priority: 'urgent' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error).priority).toMatch(/high, medium, low/);
    }
  });

  it('rejects a priority differing only by case', () => {
    expect(contactCreateSchema.safeParse({ name: 'Alice', priority: 'HIGH' }).success).toBe(false);
  });

  it('defaults an omitted priority to medium', () => {
    const result = contactCreateSchema.safeParse({ name: 'Alice' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe('medium');
  });
});

describe('contactCreateSchema — ownership cannot be claimed by the client', () => {
  // The security-relevant assertion. user_id is assigned by the database
  // (default auth.user_id()); a client must never be able to supply it.
  it('rejects a client-supplied user_id', () => {
    const result = contactCreateSchema.safeParse({
      name: 'Alice',
      user_id: 'some-other-users-id',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a client-supplied id', () => {
    expect(
      contactCreateSchema.safeParse({ name: 'Alice', id: '00000000-0000-0000-0000-000000000000' })
        .success,
    ).toBe(false);
  });

  it('never emits user_id even on a fully valid payload', () => {
    const result = contactCreateSchema.safeParse({
      name: 'Alice',
      company: 'Google',
      role: 'Engineer',
      where_met: 'Haas mixer',
      notes: 'Follow up in a week',
      priority: 'high',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('user_id');
  });
});

describe('contactCreateSchema — optional fields', () => {
  it('normalises empty optional fields to null', () => {
    const result = contactCreateSchema.safeParse({ name: 'Alice', company: '', notes: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it('rejects an over-long field', () => {
    const result = contactCreateSchema.safeParse({ name: 'Alice', company: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('contactUpdateSchema', () => {
  it('accepts a single-field update', () => {
    const result = contactUpdateSchema.safeParse({ priority: 'low' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update', () => {
    expect(contactUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects reassigning ownership via update', () => {
    // Mirrors the WITH CHECK clause on the contacts_update_own RLS policy.
    expect(contactUpdateSchema.safeParse({ user_id: 'someone-else' }).success).toBe(false);
  });

  it('does not default priority when omitted', () => {
    const result = contactUpdateSchema.safeParse({ name: 'Alice' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('priority');
  });
});

describe('query-parameter parsing', () => {
  it('falls back to created_at for an unknown sort column', () => {
    expect(parseSort('name')).toBe('name');
    expect(parseSort('priority')).toBe('priority');
    // Guards against a caller injecting an arbitrary column name.
    expect(parseSort('; drop table contacts')).toBe('created_at');
    expect(parseSort(null)).toBe('created_at');
  });

  it('defaults direction to desc unless asc is asked for', () => {
    expect(parseDirection('asc')).toBe('asc');
    expect(parseDirection('nonsense')).toBe('desc');
  });

  it('ignores an invalid priority filter', () => {
    expect(parsePriorityFilter('high')).toBe('high');
    expect(parsePriorityFilter('urgent')).toBeNull();
  });
});
