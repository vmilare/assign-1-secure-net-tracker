import { NextResponse } from 'next/server';
import {
  contactCreateSchema,
  formatIssues,
  parseSort,
  parseDirection,
  parsePriorityFilter,
} from '@/lib/validation';
import { dataApiAs, bearerToken, UNAUTHENTICATED, CONTACT_COLUMNS } from '@/lib/neon-server';
import { describeDbError } from '@/lib/db-errors';

/** Strip PostgREST filter metacharacters so a search term can't alter the query. */
function sanitiseSearch(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,()*\\"]/g, '').trim().slice(0, 100);
  return cleaned.length > 0 ? cleaned : null;
}

/** GET /api/contacts?sort=&dir=&priority=&q= */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json(UNAUTHENTICATED, { status: 401 });

  const params = new URL(request.url).searchParams;
  const sort = parseSort(params.get('sort'));
  const ascending = parseDirection(params.get('dir')) === 'asc';
  const priority = parsePriorityFilter(params.get('priority'));
  const search = sanitiseSearch(params.get('q'));

  // No .eq('user_id', ...) here on purpose: the RLS SELECT policy already
  // restricts this to the caller's rows. Filtering here too would merely hide
  // a broken policy rather than reveal it.
  let query = dataApiAs(token).from('contacts').select(CONTACT_COLUMNS);
  if (priority) query = query.eq('priority', priority);
  if (search) query = query.or(`name.ilike.*${search}*,company.ilike.*${search}*`);

  const { data, error } = await query.order(sort, { ascending });

  if (error) {
    const { status, message } = describeDbError(error);
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ contacts: data ?? [] });
}

/** POST /api/contacts */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json(UNAUTHENTICATED, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = contactCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please fix the highlighted fields.', fields: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  // parsed.data cannot contain user_id (strictObject rejects it), so the
  // column default auth.user_id() assigns the true owner.
  const { data, error } = await dataApiAs(token)
    .from('contacts')
    .insert(parsed.data)
    .select(CONTACT_COLUMNS)
    .single();

  if (error) {
    const { status, message } = describeDbError(error);
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ contact: data }, { status: 201 });
}
