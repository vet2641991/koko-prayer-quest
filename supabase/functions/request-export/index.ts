// POST {} — owner or reviewer. Starts the "Publish content" GitHub workflow (repository_dispatch), which exports
// everything published to content/** and opens a pull request. The GitHub token lives only in this function's
// secrets (GITHUB_DISPATCH_TOKEN: fine-grained, this repository only, Contents: read and write).
import { cors, json, requireAdmin, serviceClient } from '../_shared/admin.ts';

const REPO = Deno.env.get('GITHUB_REPO') ?? 'vet2641991/koko-prayer-quest';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await requireAdmin(req, serviceClient(), 'can_publish');
  if (who.error) return who.error;
  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  if (!token) return json(501, { error: 'GITHUB_DISPATCH_TOKEN is not set for this function yet (docs/DEPLOY.md)' });

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'koko-admin' },
    body: JSON.stringify({ event_type: 'publish-content', client_payload: { requested_by: who.admin!.email } }),
  });
  if (res.status !== 204) return json(502, { error: `GitHub answered ${res.status}: ${await res.text()}` });
  return json(200, { ok: true, message: 'Export started. In a minute or two a pull request with the changed files appears on GitHub; merge it to put them live.' });
});
