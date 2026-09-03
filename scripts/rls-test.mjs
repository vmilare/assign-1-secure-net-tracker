/**
 * Two-account Row Level Security verification.
 *
 * Signs in as two users, then has User B attempt to read, modify, delete, and
 * forge User A's data by calling the Neon Data API DIRECTLY -- bypassing this
 * app's route handlers entirely. That is the point: it proves Postgres is
 * enforcing ownership, not our backend code.
 *
 * Credentials are entered interactively. They are never written to disk, never
 * printed, and never leave this machine.
 *
 *   npm run test:rls
 */
import { createClient } from '@neondatabase/neon-js';
import { readFileSync } from 'node:fs';

/**
 * Neon Auth rejects requests without an Origin header ("Missing or null
 * Origin") -- a CSRF guard that browsers satisfy automatically but Node's
 * fetch does not. Wrap global fetch to supply one. It must match an origin
 * Neon trusts; localhost:3000 is trusted by default for local development.
 */
const ORIGIN = process.env.RLS_TEST_ORIGIN ?? 'http://localhost:3000';
const baseFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', ORIGIN);
  return baseFetch(input, { ...init, headers });
};

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);

const AUTH_URL = (env.NEXT_PUBLIC_NEON_AUTH_URL ?? '').replace(/\/+$/, '');
const DATA_URL = env.NEXT_PUBLIC_NEON_DATA_API_URL;

if (!AUTH_URL || !DATA_URL) {
  console.error('Missing NEON URLs in .env.local');
  process.exit(1);
}

/**
 * Credentials.
 *
 * Read from a git-ignored file rather than prompted for. Interactive terminal
 * input meant hand-managing echo, backspace, and escape sequences, which
 * corrupted typed emails -- not worth the bug surface for a test helper.
 *
 * Create .rls-test.local (git-ignored, delete it when you are done):
 *
 *   A_EMAIL=you+a@example.com
 *   A_PASSWORD=...
 *   B_EMAIL=you+b@example.com
 *   B_PASSWORD=...
 *
 * Environment variables of the same names take precedence if set.
 */
const CREDS_FILE = '.rls-test.local';

function loadCredentials() {
  let fromFile = {};
  try {
    fromFile = Object.fromEntries(
      readFileSync(CREDS_FILE, 'utf8')
        .split('\n')
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
    );
  } catch {
    // falls through to the missing-keys error below
  }

  const keys = ['A_EMAIL', 'A_PASSWORD', 'B_EMAIL', 'B_PASSWORD'];
  const creds = Object.fromEntries(keys.map((k) => [k, process.env[k] ?? fromFile[k] ?? '']));
  const missing = keys.filter((k) => !creds[k]);

  if (missing.length > 0) {
    console.error(`\nMissing credentials: ${missing.join(', ')}\n`);
    console.error(`Create ${CREDS_FILE} in the project root containing:\n`);
    console.error('  A_EMAIL=your-first-test-account@example.com');
    console.error('  A_PASSWORD=...');
    console.error('  B_EMAIL=your-second-test-account@example.com');
    console.error('  B_PASSWORD=...\n');
    console.error(`${CREDS_FILE} is git-ignored. Delete it once you are done.\n`);
    process.exit(1);
  }
  return creds;
}

/**
 * Sign in and return a JWT for the Data API.
 *
 * Does not use the SDK's getJWTToken(): on neon-js@0.7.0-beta that requests
 * <authUrl>/api/auth/token (better-auth's default base path) and 404s against
 * Neon's managed service, which serves <authUrl>/token. Same workaround as
 * src/lib/neon-browser.ts.
 *
 * Cookies are handled by hand because Node's fetch has no cookie jar: the
 * session cookie from sign-in must be replayed on the token request.
 */
async function tokenFor(email, password) {
  const signIn = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!signIn.ok) {
    let detail = `HTTP ${signIn.status}`;
    try {
      detail = (await signIn.json()).message ?? detail;
    } catch {
      /* keep the status */
    }
    throw new Error(`sign-in failed for ${email}: ${detail}`);
  }

  // Collect every Set-Cookie and replay them as one Cookie header.
  const setCookies = signIn.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`signed in as ${email} but no session cookie was returned`);

  const tokenResponse = await fetch(`${AUTH_URL}/token`, {
    headers: { Accept: 'application/json', Cookie: cookie },
  });
  if (!tokenResponse.ok) {
    throw new Error(`token request for ${email} failed: HTTP ${tokenResponse.status}`);
  }

  const payload = await tokenResponse.json();
  const token = payload?.token ?? payload?.jwt ?? payload?.data?.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`token response for ${email} had no token field`);
  }
  return token;
}

/** Data API client bound to one user's token -- no app code in the path. */
const apiAs = (token) => createClient({ dataApi: { url: DATA_URL, getToken: async () => token } });

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}]  ${name}`);
  if (detail) console.log(`          ${detail}`);
}

async function main() {
  console.log('\n=== Two-account Row Level Security verification ===');
  console.log('Attacks run against the public Data API, bypassing the app backend.\n');

  const creds = loadCredentials();
  console.log(`User A: ${creds.A_EMAIL}`);
  console.log(`User B: ${creds.B_EMAIL}`);

  console.log('\nAuthenticating both users...');
  const tokenA = await tokenFor(creds.A_EMAIL, creds.A_PASSWORD);
  const tokenB = await tokenFor(creds.B_EMAIL, creds.B_PASSWORD);
  const A = apiAs(tokenA);
  const B = apiAs(tokenB);
  console.log('Both users authenticated.\n');

  // --- A creates a row. user_id is never sent; the column default stamps it.
  const marker = `rls-probe-${Date.now()}`;
  const { data: created, error: createError } = await A.from('contacts')
    .insert({ name: marker, company: 'Owned by A', priority: 'high' })
    .select('id,user_id,name')
    .single();

  if (createError) throw new Error(`A could not create a contact: ${createError.message}`);

  const rowId = created.id;
  record('A can create a contact', true, `id ${rowId.slice(0, 8)}...`);
  record(
    'user_id stamped by the database, not the client',
    Boolean(created.user_id),
    created.user_id ? 'user_id was populated by DEFAULT auth.user_id()' : 'user_id is empty',
  );

  // --- 1. Can B read A's row?  (contacts_select_own)
  const { data: bList } = await B.from('contacts').select('id,name');
  const bSeesA = (bList ?? []).some((row) => row.id === rowId);
  record("B cannot READ A's contact", !bSeesA, `B sees ${bList?.length ?? 0} row(s) in total`);

  // --- 2. Can B overwrite A's row?  (contacts_update_own USING)
  const { data: bUpdated } = await B.from('contacts')
    .update({ name: 'HACKED BY B' })
    .eq('id', rowId)
    .select('id');
  record(
    "B cannot UPDATE A's contact",
    (bUpdated ?? []).length === 0,
    `${(bUpdated ?? []).length} row(s) affected`,
  );

  // --- 3. Can B delete A's row?  (contacts_delete_own)
  const { data: bDeleted } = await B.from('contacts').delete().eq('id', rowId).select('id');
  record(
    "B cannot DELETE A's contact",
    (bDeleted ?? []).length === 0,
    `${(bDeleted ?? []).length} row(s) affected`,
  );

  // --- 4. Can B forge a row owned by A?  (contacts_insert_own WITH CHECK)
  const { data: spoofed, error: spoofError } = await B.from('contacts')
    .insert({ name: 'spoofed-by-B', user_id: created.user_id })
    .select('id');
  const spoofBlocked = Boolean(spoofError) || (spoofed ?? []).length === 0;
  record(
    "B cannot INSERT a row owned by A",
    spoofBlocked,
    spoofError ? 'rejected by policy' : spoofBlocked ? 'no row created' : 'INSERT SUCCEEDED -- policy gap',
  );

  // --- 5. Is A's row still exactly as A left it?
  const { data: afterAttack } = await A.from('contacts').select('id,name').eq('id', rowId);
  const intact = afterAttack?.length === 1 && afterAttack[0].name === marker;
  record(
    "A's contact survived every attack",
    intact,
    intact ? 'name unchanged, row present' : 'ROW WAS MODIFIED OR DELETED',
  );

  // --- Cleanup: remove the probe row and any spoofed row.
  await A.from('contacts').delete().eq('id', rowId);
  await B.from('contacts').delete().eq('name', 'spoofed-by-B');

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`}` +
      ` (${results.length - failed.length}/${results.length})\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}\n`);
  process.exit(1);
});
