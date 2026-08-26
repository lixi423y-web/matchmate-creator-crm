import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publishableKey = 'test-publishable-key';
const testEmail = `member-${Date.now()}@example.test`;
const testPassword = `password-${crypto.randomUUID()}`;
const wrongPassword = `wrong-${crypto.randomUUID()}`;
const validSession = { access_token: `access-${crypto.randomUUID()}`, user: { email: testEmail } };
let persistedSession = null;
let authListener = null;
const authCalls = [];

const auth = {
  async getSession() { return { data: { session: persistedSession }, error: null } },
  async signInWithPassword(credentials) {
    authCalls.push(credentials);
    if (credentials.email !== testEmail || credentials.password !== testPassword) return { data: { session: null }, error: new Error('Invalid login credentials') };
    persistedSession = validSession;
    authListener?.('SIGNED_IN', validSession);
    return { data: { session: validSession }, error: null };
  },
  async signOut() {
    persistedSession = null;
    authListener?.('SIGNED_OUT', null);
    return { error: null };
  },
  onAuthStateChange(callback) {
    authListener = callback;
    return { data: { subscription: { unsubscribe() {} } } };
  }
};

globalThis.window = {
  MATCHMATE_CONFIG: { supabaseUrl: 'https://project.example.test', supabasePublishableKey: publishableKey },
  supabase: {
    createClient(url, key, options) {
      assert.equal(url, 'https://project.example.test');
      assert.equal(key, publishableKey);
      assert.equal(options.auth.persistSession, true);
      assert.equal(options.auth.autoRefreshToken, true);
      return { auth };
    }
  }
};
globalThis.location = { search: '' };
const fetchCalls = [];
globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  return new Response('[]', { status: 200, headers: { 'content-range': '0-0/0' } });
};

const firstLoad = await import(`../src/data.js?auth-smoke=${Date.now()}`);
await assert.rejects(firstLoad.list('creators'), /session expired/, 'CRM data must not be requested before authentication');
assert.equal(fetchCalls.length, 0, 'unauthenticated boot must make zero CRM REST requests');

await assert.rejects(firstLoad.signInWithPassword(testEmail, wrongPassword), /Invalid login credentials/, 'wrong credentials must not create a session');
assert.equal(firstLoad.currentSession(), null, 'wrong credentials must leave the user signed out');

await firstLoad.signInWithPassword(testEmail, testPassword);
assert.deepEqual(authCalls.at(-1), { email: testEmail, password: testPassword }, 'login must call Supabase password authentication');
await firstLoad.list('creators');
assert.equal(fetchCalls.length, 1, 'authenticated users may request CRM data');
assert.equal(fetchCalls[0].options.headers.apikey, publishableKey, 'REST requests must use the publishable key as apikey');
assert.equal(fetchCalls[0].options.headers.Authorization, `Bearer ${validSession.access_token}`, 'REST requests must use the session access token as Bearer token');

const refreshedPage = await import(`../src/data.js?auth-refresh=${Date.now()}`);
assert.equal(refreshedPage.currentSession(), null, 'a new page starts without in-memory credentials');
assert.equal(await refreshedPage.restoreSession(), validSession, 'page refresh must restore the persisted Supabase session');

await refreshedPage.signOut();
await assert.rejects(refreshedPage.list('creator_addresses'), /session expired/, 'logout must immediately block later CRM reads');
assert.equal(fetchCalls.length, 1, 'logout must not send another CRM REST request');

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const dataSource = await readFile(new URL('../src/data.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260826063626_authenticated_crm_access.sql', import.meta.url), 'utf8');

assert.ok(indexSource.includes('id="authGate"'), 'the signed-out page must contain the login gate');
assert.ok(indexSource.includes('id="app" class="app-shell hidden"'), 'the CRM app must start hidden');
assert.ok(indexSource.includes('id="logoutBtn"'), 'the authenticated header must include Logout');
assert.ok(!/sign\s*up|create account/i.test(indexSource), 'the frontend must not expose registration');
assert.ok(appSource.includes('await restoreSession()'), 'app boot must restore a persisted session before loading CRM data');
assert.ok(appSource.includes("onAuthStateChange((event,nextSession)"), 'the app must react to Supabase sign-out state');
assert.ok(dataSource.includes('.auth.signInWithPassword('), 'login must use Supabase signInWithPassword');
assert.ok(dataSource.includes('Authorization:`Bearer ${session.access_token}`'), 'REST Bearer auth must use the session access token');
assert.ok(!dataSource.includes('Authorization:`Bearer ${publishableKey}`'), 'the publishable key must never be used as the Bearer user token');

const requiredTables = [
  'crm_users','creators','creator_accounts','creator_pets','creator_addresses',
  'outreach_records','campaigns','products','collaborations','collaboration_products',
  'deliverables','shipments','shipment_items','inventory_movements','publications',
  'assets','activity_logs'
];
for (const table of requiredTables) assert.ok(migration.includes(`'${table}'`) || migration.includes(`public.${table}`), `migration must cover ${table}`);
assert.ok(migration.includes('drop policy if exists "crm shared link access"'), 'migration must remove shared-link policies');
assert.ok(migration.includes('from anon'), 'migration must revoke anon table privileges');
assert.ok(migration.includes('to authenticated'), 'migration must grant authenticated CRM access');
assert.ok(migration.includes('public.creator_directory,public.collaboration_directory from anon'), 'migration must revoke anon view access');
assert.ok(!/\b(delete\s+from|truncate|drop\s+table)\b/i.test(migration), 'security migration must not delete CRM data or tables');
assert.ok(!/service[_-]?role/i.test(migration), 'security migration must not reference service-role access');

console.log(JSON.stringify({
  unauthenticatedRequests: 0,
  wrongCredentialsBlocked: true,
  sessionRestored: true,
  sessionBearerVerified: true,
  logoutBlocksReads: true,
  migrationContractVerified: true
}));
