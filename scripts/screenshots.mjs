/**
 * Capture the four grading screenshots the README asks for.
 *
 * Drives a real browser against the app, signing in as the two test accounts
 * from .rls-test.local, and writes PNGs into docs/screenshots/.
 *
 *   npm run screenshots              # against http://localhost:3000
 *   npm run screenshots -- --prod    # against the deployed Vercel URL
 *
 * Credentials are read from the git-ignored .rls-test.local and are never
 * printed or written anywhere.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const readEnvFile = (path) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
  );

const creds = readEnvFile('.rls-test.local');
const missing = ['A_EMAIL', 'A_PASSWORD', 'B_EMAIL', 'B_PASSWORD'].filter((k) => !creds[k]);
if (missing.length > 0) {
  console.error(`\nMissing from .rls-test.local: ${missing.join(', ')}\n`);
  process.exit(1);
}

const PROD = 'https://assign-1-secure-net-tracker.vercel.app';
const BASE = process.argv.includes('--prod') ? PROD : 'http://localhost:3000';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

/**
 * The list renders twice - stacked cards below the `sm` breakpoint, a table at
 * and above it - with one hidden by CSS. Target only the visible copy, or
 * waits resolve against the hidden one and time out.
 */
const visibleText = (page, text) => page.getByText(text).locator('visible=true').first();

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  wrote ${OUT}/${name}.png`);
};

/** Fill the auth form and submit. mode: 'signin' | 'signup' */
async function authenticate(page, { email, password, mode = 'signin' }) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (mode === 'signup') await page.getByRole('button', { name: 'Create account' }).first().click();

  await page.getByPlaceholder('you@berkeley.edu').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: mode === 'signup' ? 'Create account' : 'Sign in' }).last().click();

  await page.waitForURL('**/contacts', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(BASE + '/', { timeout: 20000 });
}

/**
 * Delete every contact belonging to both test users, so a rerun starts from a
 * known state. Without this, each failed run leaves rows behind and the next
 * run's assertions match stale data.
 */
async function resetContacts() {
  const env = readEnvFile('.env.local');
  const AUTH = (env.NEXT_PUBLIC_NEON_AUTH_URL ?? '').replace(/\/+$/, '');
  const DATA = env.NEXT_PUBLIC_NEON_DATA_API_URL ?? '';

  // Neon Auth rejects requests with no Origin header ("Missing or null
  // Origin"); browsers send one automatically, Node's fetch does not.
  const ORIGIN = BASE.startsWith('http') ? new URL(BASE).origin : 'http://localhost:3000';

  for (const [email, password] of [
    [creds.A_EMAIL, creds.A_PASSWORD],
    [creds.B_EMAIL, creds.B_PASSWORD],
  ]) {
    const signIn = await fetch(`${AUTH}/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    });
    // Report rather than skip: an earlier version used `continue` here, so a
    // 403 from the missing Origin header silently left stale rows in place and
    // the screenshots came out full of duplicates.
    if (!signIn.ok) {
      throw new Error(`reset: sign-in failed for ${email} (HTTP ${signIn.status})`);
    }
    const cookie = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    const tokenRes = await fetch(`${AUTH}/token`, {
      headers: { Cookie: cookie, Accept: 'application/json', Origin: ORIGIN },
    });
    if (!tokenRes.ok) {
      throw new Error(`reset: token request failed for ${email} (HTTP ${tokenRes.status})`);
    }
    const token = (await tokenRes.json())?.token;
    if (!token) throw new Error(`reset: no token returned for ${email}`);

    // RLS scopes every call below to the signed-in user, so this cannot touch
    // anyone else's rows even though it deletes by id with no owner filter.
    const listRes = await fetch(`${DATA}/contacts?select=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rows = listRes.ok ? ((await listRes.json()) ?? []) : [];
    let removed = 0;
    for (const row of rows) {
      const del = await fetch(`${DATA}/contacts?id=eq.${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (del.ok) removed += 1;
    }
    console.log(`  reset: removed ${removed} of ${rows.length} contact(s) for ${email}`);
  }
}

async function main() {
  console.log(`\nCapturing screenshots against ${BASE}\n`);
  await resetContacts();
  console.log('');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();

  try {
    // --- 01: the signed-out sign-in form, then the signed-in header --------
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await shot(page, '01a-sign-in-form');

    await authenticate(page, { email: creds.A_EMAIL, password: creds.A_PASSWORD });
    await shot(page, '01b-signed-in');

    // --- 03: validation - submit a blank name -----------------------------
    // Done before creating real contacts so the list stays clean.
    await page.getByRole('button', { name: 'Add contact' }).click();
    await page.getByRole('button', { name: 'Add contact' }).last().click();
    await page.getByText('Name is required').waitFor({ timeout: 10000 });
    await shot(page, '03-validation-blank-name');

    // --- 02: create a couple of contacts, then show persistence -----------
    const contacts = [
      { name: 'Alice Smith', company: 'Google', role: 'Product Manager', where: 'Haas alumni mixer', priority: 'high' },
      { name: 'Bob Chen', company: 'Microsoft', role: 'Engineer', where: 'Career fair', priority: 'medium' },
    ];
    for (const c of contacts) {
      // The app closes the form after a successful save, so reopen it rather
      // than assuming it is still there from the previous iteration.
      const nameField = page.getByPlaceholder('Alice Smith');
      if (!(await nameField.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Add contact' }).first().click();
      }
      await nameField.waitFor({ state: 'visible', timeout: 10000 });

      await nameField.fill(c.name);
      await page.getByPlaceholder('Google').fill(c.company);
      await page.getByPlaceholder('Product Manager').fill(c.role);
      await page.getByPlaceholder('Haas alumni mixer').fill(c.where);
      // Scope to the form: the filter bar also has <select>s ("Priority",
      // "Sort by"), and Sort by has no high/medium/low options.
      await page.locator('form select').first().selectOption(c.priority);

      await page.getByRole('button', { name: 'Add contact' }).last().click();

      // Wait for the FORM TO CLOSE, which the app only does after a successful
      // save. Waiting for the contact's name instead is unreliable: a row left
      // over from an earlier run satisfies it immediately, and the loop then
      // races ahead and types the next contact into a form that is about to be
      // torn down.
      await nameField.waitFor({ state: 'hidden', timeout: 20000 });
      await page.waitForLoadState('networkidle');
      await visibleText(page, c.name).waitFor({ timeout: 15000 });
    }

    await shot(page, '02a-contacts-created');

    await page.reload({ waitUntil: 'networkidle' });
    await visibleText(page, 'Alice Smith').waitFor({ timeout: 15000 });
    await shot(page, '02b-after-refresh');

    // --- 04: User B sees none of it ---------------------------------------
    await signOut(page);
    await authenticate(page, { email: creds.B_EMAIL, password: creds.B_PASSWORD });
    await visibleText(page, 'No contacts yet.').waitFor({ timeout: 15000 });
    await shot(page, '04-user-b-empty');

    // --- mobile view, for the responsive requirement ----------------------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await shot(page, '05-mobile');

    console.log('\nDone. Review the PNGs, then commit them.\n');
  } catch (error) {
    // Capture the failing state - a screenshot beats guessing at selectors.
    try {
      await page.screenshot({ path: `${OUT}/_failure.png`, fullPage: true });
      console.error(`\n  failure state written to ${OUT}/_failure.png`);
      const text = await page.locator('main').innerText();
      console.error('\n  --- visible page text at failure ---');
      console.error(text.split('\n').filter(Boolean).map((l) => '  ' + l).join('\n'));
    } catch {
      /* best effort */
    }
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}\n`);
  process.exit(1);
});
