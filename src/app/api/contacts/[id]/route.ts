import { NextResponse } from 'next/server';
import { contactUpdateSchema, formatIssues } from '@/lib/validation';
import { dataApiAs, bearerToken, UNAUTHENTICATED, CONTACT_COLUMNS } from '@/lib/neon-server';
import { describeDbError } from '@/lib/db-errors';

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/contacts/:id */
export async function PATCH(request: Request, { params }: Ctx) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json(UNAUTHENTICATED, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Unknown contact.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = contactUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please fix the highlighted fields.', fields: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const { data, error } = await dataApiAs(token)
    .from('contacts')
    .update(parsed.data)
    .eq('id', id)
    .select(CONTACT_COLUMNS);

  if (error) {
    const { status, message } = describeDbError(error);
    return NextResponse.json({ error: message }, { status });
  }

  // Zero rows means the row is not yours (or does not exist). RLS returns an
  // empty set rather than an error, so this is the ownership failure path.
  // The message deliberately does not distinguish the two cases.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Unknown contact.' }, { status: 404 });
  }
  return NextResponse.json({ contact: data[0] });
}

/** DELETE /api/contacts/:id */
export async function DELETE(request: Request, { params }: Ctx) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json(UNAUTHENTICATED, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Unknown contact.' }, { status: 404 });
  }

  const { data, error } = await dataApiAs(token)
    .from('contacts')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    const { status, message } = describeDbError(error);
    return NextResponse.json({ error: message }, { status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Unknown contact.' }, { status: 404 });
  }
  return NextResponse.json({ id });
}
