/** Optional post-installation GitHub integration. Callers authenticate the installer
 * session, require CSRF on writes, seal temporary tokens, and persist progress.
 * Cloudflare authorization MUST be refreshed after provisioning revokes its token.
 */
import { digest } from './security';

export interface InstalledForum {
  account: string; worker: string; database: string; databaseName: string;
  url: string; release: { version: string }; stage: 'complete';
}
export interface GithubOAuth {
  clientId: string; clientSecret: string; redirectUri: string;
}
export interface GithubRepository {
  id: number; name: string; owner: { login: string; id: number };
  private: boolean; html_url: string; default_branch: string;
}
export interface GithubProgress {
  repositoryId?: number; repositoryOwner?: string; repositoryName?: string;
  configured?: boolean; connectionId?: string; triggerId?: string;
}
export type Fetcher = typeof fetch;
export class GithubConnectionError extends Error {
  constructor(public readonly stage: string, public readonly action: string, public readonly dashboard?: string, status?: number) {
    super(`${stage}: ${action}${status ? ` (HTTP ${status})` : ''}`);
  }
}
const GH = 'https://api.github.com';
const CF = 'https://api.cloudflare.com/client/v4';
const namePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
function assertInstallation(forum: InstalledForum): void {
  if (forum.stage !== 'complete' || !/^[a-f0-9]{32}$/.test(forum.account) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(forum.worker)
    || !/^[a-f0-9-]{36}$/.test(forum.database) || !namePattern.test(forum.databaseName) || !/^v\d+\.\d+\.\d+[A-Za-z0-9.-]*$/.test(forum.release.version)) {
    throw new GithubConnectionError('installation', 'Complete forum installation before connecting GitHub.');
  }
  const origin = new URL(forum.url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || !['', '/'].includes(origin.pathname)) {
    throw new GithubConnectionError('installation', 'Invalid installed forum origin.');
  }
}
function dashboard(forum: InstalledForum): string {
  return `https://dash.cloudflare.com/${forum.account}/workers/services/view/${forum.worker}/production/settings`;
}
async function github<T>(token: string, path: string, init: RequestInit, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(GH + path, { ...init, headers: {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'EXTB-installer',
    'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
  }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new GithubConnectionError('github', 'GitHub request failed. Reauthorize or choose an unused repository name.', undefined, response.status);
  return await response.json() as T;
}
async function cloudflare<T>(token: string, forum: InstalledForum, path: string, init: RequestInit, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(`${CF}/accounts/${forum.account}${path}`, { ...init, headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new GithubConnectionError('cloudflare-builds', 'Open Settings → Builds, authorize the Cloudflare GitHub App for this repository, and select a deployment token. Fresh Cloudflare authorization with Builds permissions is required.', dashboard(forum), response.status);
  const body = await response.json() as { success?: boolean; result: T };
  if (body.success === false) throw new GithubConnectionError('cloudflare-builds', 'Cloudflare could not authorize this connection. Check the GitHub App and deployment token in Settings → Builds.', dashboard(forum));
  return body.result;
}
export async function githubAuthorizeUrl(config: GithubOAuth, state: string, verifier: string): Promise<string> {
  if (!state || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) throw new GithubConnectionError('oauth', 'Invalid OAuth challenge.');
  const uri = new URL(config.redirectUri);
  if (uri.protocol !== 'https:' || uri.username || uri.password) throw new GithubConnectionError('oauth', 'GitHub callback must use HTTPS.');
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: 'repo', state, code_challenge: await digest(verifier), code_challenge_method: 'S256' }).toString();
  return url.toString();
}
/** Caller atomically validates and consumes state before invoking code exchange. */
export async function exchangeGithubCode(config: GithubOAuth, code: string, verifier: string, fetcher: Fetcher = fetch): Promise<string> {
  if (!code || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) throw new GithubConnectionError('oauth', 'Invalid GitHub authorization response.');
  const response = await fetcher('https://github.com/login/oauth/access_token', { method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code,
      redirect_uri: config.redirectUri, code_verifier: verifier }), signal: AbortSignal.timeout(45000) });
  const value = await response.json() as { access_token?: string; token_type?: string; scope?: string };
  if (!response.ok || !value.access_token || value.token_type?.toLowerCase() !== 'bearer' || !value.scope?.split(/[ ,]+/).includes('repo')) {
    throw new GithubConnectionError('oauth', 'GitHub authorization was cancelled, expired, or lacks private repository access.');
  }
  return value.access_token;
}
/** Only identifiers and non-secret public configuration are written into GitHub. */
export function installationWrangler(forum: InstalledForum): string {
  assertInstallation(forum);
  return `# Installed from EXTB ${forum.release.version}. Deployment credentials remain in Cloudflare.\nname = ${JSON.stringify(forum.worker)}\naccount_id = ${JSON.stringify(forum.account)}\nmain = "src/index.ts"\ncompatibility_date = "2026-10-02"\ncompatibility_flags = ["nodejs_compat"]\nworkers_dev = true\n\n[assets]\ndirectory = "./public"\nbinding = "ASSETS"\nrun_worker_first = true\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = ${JSON.stringify(forum.databaseName)}\ndatabase_id = ${JSON.stringify(forum.database)}\nmigrations_dir = "./migrations"\n\n[[durable_objects.bindings]]\nname = "CHAT_ROOM"\nclass_name = "ChatRoom"\n\n[[durable_objects.bindings]]\nname = "PASSWORD_HASHER"\nclass_name = "PasswordHasher"\n\n[[migrations]]\ntag = "v1"\nnew_sqlite_classes = ["ChatRoom", "PasswordHasher"]\n\n[ai]\nbinding = "AI"\n\n[vars]\nBUILD_ID = ${JSON.stringify(forum.release.version)}\nCOMMUNITY_ORIGIN = ${JSON.stringify(new URL(forum.url).origin)}\n`;
}
function base64(value: string): string {
  return btoa(Array.from(new TextEncoder().encode(value), c => String.fromCharCode(c)).join(''));
}
/** Existing repositories are reusable only by the saved repository id from this job. */
export async function createPrivateForumRepository(token: string, forum: InstalledForum, name: string,
  progress: GithubProgress, save: (progress: GithubProgress) => Promise<void>, fetcher: Fetcher = fetch): Promise<GithubRepository> {
  assertInstallation(forum);
  if (!namePattern.test(name)) throw new GithubConnectionError('repository', 'Choose a valid repository name.');
  const user = await github<{ id: number; login: string }>(token, '/user', {}, fetcher);
  let repository: GithubRepository;
  if (progress.repositoryId) {
    if (progress.repositoryOwner !== user.login || progress.repositoryName !== name) throw new GithubConnectionError('repository', 'GitHub account or repository does not match this connection.');
    repository = await github<GithubRepository>(token, `/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(name)}`, {}, fetcher);
    if (repository.id !== progress.repositoryId) throw new GithubConnectionError('repository', 'Saved repository identity has changed.');
  } else {
    repository = await github<GithubRepository>(token, '/repos/royachiron/extb/generate', { method: 'POST', body: JSON.stringify({
      owner: user.login, name, private: true, include_all_branches: false, description: 'My EXTB community on Cloudflare',
    }) }, fetcher);
    if (!repository.private || repository.owner.id !== user.id || repository.name !== name) throw new GithubConnectionError('repository', 'GitHub did not create the expected private repository.');
    progress.repositoryId = repository.id; progress.repositoryOwner = user.login; progress.repositoryName = name;
    await save({ ...progress });
  }
  if (!repository.private || repository.owner.id !== user.id || repository.default_branch !== 'main') throw new GithubConnectionError('repository', 'Expected a private repository owned by this GitHub user with main as default branch.');
  if (!progress.configured) {
    const path = `/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(name)}/contents/wrangler.toml`;
    const file = await github<{ sha: string; content: string }>(token, path + '?ref=main', {}, fetcher);
    const content = base64(installationWrangler(forum));
    if (file.content.replace(/\s/g, '') !== content) await github(token, path, { method: 'PUT', body: JSON.stringify({
      message: 'Configure existing EXTB Worker and database', branch: 'main', sha: file.sha, content,
    }) }, fetcher);
    progress.configured = true; await save({ ...progress });
  }
  return repository;
}
export interface BuildConnection { triggerId: string; connectionId: string; workerTag: string; repositoryUrl: string; dashboard: string }
/** No Worker/database creation, migration or direct deployment takes place here. */
export async function connectWorkerBuilds(token: string, forum: InstalledForum, repository: GithubRepository,
  buildTokenId: string, progress: GithubProgress, save: (progress: GithubProgress) => Promise<void>, fetcher: Fetcher = fetch): Promise<BuildConnection> {
  assertInstallation(forum);
  if (!progress.configured || progress.repositoryId !== repository.id || !repository.private || repository.default_branch !== 'main') throw new GithubConnectionError('repository', 'Configure the private repository before connecting Builds.');
  const tokens = await cloudflare<{ build_token_uuid: string }[]>(token, forum, '/builds/tokens', {}, fetcher);
  if (!buildTokenId || !tokens.some(t => t.build_token_uuid === buildTokenId)) throw new GithubConnectionError('deployment-token', 'Select a deployment token in Cloudflare Settings → Builds.', dashboard(forum));
  const workers = await cloudflare<{ id: string; tag: string }[]>(token, forum, '/workers/scripts', {}, fetcher);
  const worker = workers.find(w => w.id === forum.worker);
  if (!worker?.tag) throw new GithubConnectionError('worker', 'The installed Worker is missing from this Cloudflare account.', dashboard(forum));
  if (!progress.connectionId) {
    const connection = await cloudflare<{ repo_connection_uuid: string }>(token, forum, '/builds/repos/connections', {
      method: 'PUT', body: JSON.stringify({ provider_type: 'github', provider_account_id: String(repository.owner.id),
        provider_account_name: repository.owner.login, repo_id: String(repository.id), repo_name: repository.name }),
    }, fetcher);
    if (!connection.repo_connection_uuid) throw new GithubConnectionError('connection', 'Cloudflare returned no repository connection.', dashboard(forum));
    progress.connectionId = connection.repo_connection_uuid; await save({ ...progress });
  }
  const triggers = await cloudflare<{ trigger_uuid: string; repo_connection_uuid: string; build_token_uuid: string; branch_includes: string[]; root_directory: string; build_command: string; deploy_command: string }[]>(token, forum, `/builds/workers/${encodeURIComponent(worker.tag)}/triggers`, {}, fetcher);
  const desiredBuild = 'npm ci && npm run verify'; const desiredDeploy = 'npm run deploy';
  const existing = triggers.find(t => t.repo_connection_uuid === progress.connectionId && t.build_token_uuid === buildTokenId
    && t.root_directory === '/' && t.branch_includes.length === 1 && t.branch_includes[0] === 'main'
    && t.build_command === desiredBuild && t.deploy_command === desiredDeploy);
  if (existing) progress.triggerId = existing.trigger_uuid;
  else {
    if (progress.triggerId || triggers.some(t => t.repo_connection_uuid === progress.connectionId)) throw new GithubConnectionError('trigger', 'An existing trigger differs from this installation. Review it in Cloudflare before changing production automation.', dashboard(forum));
    const trigger = await cloudflare<{ trigger_uuid: string }>(token, forum, '/builds/triggers', { method: 'POST', body: JSON.stringify({
      external_script_id: worker.tag, repo_connection_uuid: progress.connectionId, build_token_uuid: buildTokenId,
      trigger_name: 'Deploy production', build_command: desiredBuild, deploy_command: desiredDeploy, root_directory: '/',
      branch_includes: ['main'], branch_excludes: [], path_includes: ['*'], path_excludes: [],
    }) }, fetcher);
    if (!trigger.trigger_uuid) throw new GithubConnectionError('trigger', 'Cloudflare returned no production trigger.', dashboard(forum));
    progress.triggerId = trigger.trigger_uuid;
  }
  await save({ ...progress });
  return { triggerId: progress.triggerId, connectionId: progress.connectionId, workerTag: worker.tag,
    repositoryUrl: repository.html_url, dashboard: dashboard(forum) };
}
export async function getWorkerBuildStatus(token: string, forum: InstalledForum, workerTag: string, fetcher: Fetcher = fetch): Promise<{ builds: unknown[]; dashboard: string }> {
  assertInstallation(forum);
  const builds = await cloudflare<unknown[]>(token, forum, `/builds/workers/${encodeURIComponent(workerTag)}/builds`, {}, fetcher);
  return { builds, dashboard: dashboard(forum) };
}
/** Revoke the temporary OAuth grant when repository configuration is complete. */
export async function revokeGithubToken(config: GithubOAuth, token: string, fetcher: Fetcher = fetch): Promise<void> {
  const response = await fetcher(`${GH}/applications/${encodeURIComponent(config.clientId)}/token`, {
    method: 'DELETE', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EXTB-installer',
      Authorization: `Basic ${base64(config.clientId + ':' + config.clientSecret)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token }), signal: AbortSignal.timeout(45000),
  });
  if (!response.ok && response.status !== 404) throw new GithubConnectionError('oauth-revoke', 'GitHub token revocation failed. Delete the temporary token and revoke this installer grant in GitHub Settings → Applications.', undefined, response.status);
}
/** Explicit user action only, after successful configuration. Verification executes
 * in the Builds command before deploying over the same Worker and database. */
export async function startWorkerBuild(token: string, forum: InstalledForum, connection: BuildConnection,
  progress: GithubProgress, fetcher: Fetcher = fetch): Promise<{ build_uuid: string }> {
  assertInstallation(forum);
  if (!progress.configured || progress.triggerId !== connection.triggerId || progress.connectionId !== connection.connectionId) {
    throw new GithubConnectionError('build', 'Connect and confirm this production trigger before starting a build.', dashboard(forum));
  }
  const result = await cloudflare<{ build_uuid: string }>(token, forum, `/builds/triggers/${encodeURIComponent(connection.triggerId)}/builds`, {
    method: 'POST', body: JSON.stringify({ branch: 'main' }),
  }, fetcher);
  if (!result.build_uuid) throw new GithubConnectionError('build', 'Cloudflare returned no build identifier. Check Builds status before retrying.', dashboard(forum));
  return result;
}
