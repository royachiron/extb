import { describe, expect, it, vi } from 'vitest';
import { connectWorkerBuilds, createPrivateForumRepository, exchangeGithubCode, githubAuthorizeUrl,
  installationWrangler, revokeGithubToken, startWorkerBuild, type InstalledForum, type GithubProgress, type Fetcher } from '../installer/src/github';
const forum: InstalledForum = { account: 'a'.repeat(32), worker: 'my-forum', database: 'e6af4502-b348-4d96-b8d7-5c817a401e57',
  databaseName: 'my-forum-db', url: 'https://my-forum.example.workers.dev', release: { version: 'v1.0.0' }, stage: 'complete' };
const repo = { id: 99, name: 'community', owner: { id: 1, login: 'alice' }, private: true, html_url: 'https://github.com/alice/community', default_branch: 'main' };
const oauth = { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://extb.example/github/callback' };
const verifier = 'v'.repeat(43);
function mocked(responses: unknown[]) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init }); const value = responses.shift();
    if (value instanceof Response) return value;
    if (value === undefined) throw new Error('Unexpected request ' + String(url));
    return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as Fetcher;
  return { fetcher, requests };
}
const cf = (result: unknown) => ({ success: true, result });
describe('optional GitHub connection', () => {
  it('uses state and PKCE without exposing client secret in authorization URL', async () => {
    const url = new URL(await githubAuthorizeUrl(oauth, 'state', verifier));
    expect(url.searchParams.get('state')).toBe('state'); expect(url.searchParams.get('scope')).toBe('repo');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256'); expect(url.searchParams.get('code_challenge')).not.toBe(verifier);
    expect(url.toString()).not.toContain('secret');
  });
  it('rejects incomplete installations and injected configuration', () => {
    expect(() => installationWrangler({ ...forum, stage: 'pending' } as unknown as InstalledForum)).toThrow();
    expect(() => installationWrangler({ ...forum, worker: 'x"\n[vars]' })).toThrow();
    expect(() => installationWrangler({ ...forum, url: 'https://secret@forum.example' })).toThrow();
  });
  it('exchanges PKCE codes and rejects denied private repository authorization', async () => {
    const { fetcher, requests } = mocked([{ access_token: 'temporary', token_type: 'bearer', scope: 'repo' }, { error: 'bad_verification_code' }]);
    expect(await exchangeGithubCode(oauth, 'code', verifier, fetcher)).toBe('temporary');
    expect(JSON.parse(String(requests[0]?.init?.body)).code_verifier).toBe(verifier);
    await expect(exchangeGithubCode(oauth, 'replayed-code', verifier, fetcher)).rejects.toThrow('cancelled, expired');
  });
  it('creates only a private repository and writes actual existing resource configuration without tokens', async () => {
    const progress: GithubProgress = {}; const save = vi.fn(async () => {});
    const { fetcher, requests } = mocked([{ id: 1, login: 'alice' }, repo, { sha: 'old', content: 'eA==' }, { content: {} }]);
    await createPrivateForumRepository('gh-temporary-secret', forum, 'community', progress, save, fetcher);
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ private: true, include_all_branches: false });
    const config = atob(JSON.parse(String(requests[3]?.init?.body)).content);
    expect(config).toContain('name = "my-forum"'); expect(config).toContain(forum.database); expect(config).toContain('class_name = "ChatRoom"');
    expect(config).not.toContain('gh-temporary-secret'); expect(config).not.toContain('SETUP_PASSPHRASE');
    expect(progress.configured).toBe(true); expect(save).toHaveBeenCalledTimes(2);
  });
  it('resumes saved repositories but refuses another user or replaced repository', async () => {
    const progress: GithubProgress = { repositoryId: 99, repositoryName: 'community', repositoryOwner: 'alice', configured: true };
    let mock = mocked([{ id: 2, login: 'bob' }]);
    await expect(createPrivateForumRepository('token', forum, 'community', progress, async () => {}, mock.fetcher)).rejects.toThrow('does not match');
    mock = mocked([{ id: 1, login: 'alice' }, { ...repo, id: 100 }]);
    await expect(createPrivateForumRepository('token', forum, 'community', progress, async () => {}, mock.fetcher)).rejects.toThrow('identity has changed');
    mock = mocked([{ id: 1, login: 'alice' }, repo]);
    await createPrivateForumRepository('token', forum, 'community', progress, async () => {}, mock.fetcher);
    expect(mock.requests).toHaveLength(2);
  });
  it('does not enable Builds when permission or deployment token prerequisites fail', async () => {
    const progress: GithubProgress = { repositoryId: 99, configured: true };
    const mock = mocked([new Response(JSON.stringify({ errors: [{ message: 'SECRET' }] }), { status: 403 })]);
    await expect(connectWorkerBuilds('cf-token', forum, repo, 'build-token', progress, async () => {}, mock.fetcher)).rejects.toThrow('HTTP 403');
    expect(mock.requests).toHaveLength(1); expect(progress.triggerId).toBeUndefined();
    const noToken = mocked([cf([])]);
    await expect(connectWorkerBuilds('cf-token', forum, repo, 'build-token', progress, async () => {}, noToken.fetcher)).rejects.toThrow('Select a deployment token');
  });
  it('creates root main-branch Builds trigger for the same Worker without touching data or redeploying', async () => {
    const progress: GithubProgress = { repositoryId: 99, configured: true };
    const mock = mocked([cf([{ build_token_uuid: 'build-token' }]), cf([{ id: forum.worker, tag: 'worker-tag' }]),
      cf({ repo_connection_uuid: 'connection' }), cf([]), cf({ trigger_uuid: 'trigger' })]);
    const result = await connectWorkerBuilds('cf-secret', forum, repo, 'build-token', progress, async () => {}, mock.fetcher);
    expect(result.triggerId).toBe('trigger');
    const payload = JSON.parse(String(mock.requests[4]?.init?.body));
    expect(payload).toMatchObject({ external_script_id: 'worker-tag', root_directory: '/', branch_includes: ['main'],
      build_command: 'npm ci && npm run verify', deploy_command: 'npm run deploy' });
    expect(mock.requests.every(r => !r.url.includes('/d1/') && !r.url.includes('/builds/trigger/builds'))).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('cf-secret');
  });
  it('reuses matching trigger on retry and refuses to overwrite a changed trigger', async () => {
    const progress: GithubProgress = { repositoryId: 99, configured: true, connectionId: 'connection' };
    const trigger = { trigger_uuid: 'existing', repo_connection_uuid: 'connection', build_token_uuid: 'build-token', branch_includes: ['main'],
      root_directory: '/', build_command: 'npm ci && npm run verify', deploy_command: 'npm run deploy' };
    let mock = mocked([cf([{ build_token_uuid: 'build-token' }]), cf([{ id: forum.worker, tag: 'tag' }]), cf([trigger])]);
    expect((await connectWorkerBuilds('cf-token', forum, repo, 'build-token', progress, async () => {}, mock.fetcher)).triggerId).toBe('existing');
    expect(mock.requests).toHaveLength(3);
    mock = mocked([cf([{ build_token_uuid: 'build-token' }]), cf([{ id: forum.worker, tag: 'tag' }]), cf([{ ...trigger, deploy_command: 'wrong' }])]);
    await expect(connectWorkerBuilds('cf-token', forum, repo, 'build-token', progress, async () => {}, mock.fetcher)).rejects.toThrow('differs');
  });
  it('requires the saved trigger for explicit redeployment and revokes temporary GitHub authorization', async () => {
    const progress: GithubProgress = { configured: true, triggerId: 'trigger', connectionId: 'connection' };
    const connection = { triggerId: 'trigger', connectionId: 'connection', workerTag: 'tag', repositoryUrl: repo.html_url, dashboard: 'https://dash.cloudflare.com' };
    const mock = mocked([cf({ build_uuid: 'build' }), new Response(null, { status: 204 })]);
    expect(await startWorkerBuild('cf-token', forum, connection, progress, mock.fetcher)).toEqual({ build_uuid: 'build' });
    expect(JSON.parse(String(mock.requests[0]?.init?.body))).toEqual({ branch: 'main' });
    await revokeGithubToken(oauth, 'gh-token', mock.fetcher);
    expect(mock.requests[1]?.init?.method).toBe('DELETE');
    await expect(startWorkerBuild('cf-token', forum, { ...connection, triggerId: 'another' }, progress, mock.fetcher)).rejects.toThrow('confirm this production trigger');
  });

});
