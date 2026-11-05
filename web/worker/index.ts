// Cloudflare Worker entry. Only /api/* reaches this code (wrangler.jsonc `run_worker_first`);
// every other path is served straight from the static assets, as before.
import { JobsEnv, handleJobs } from './jobs';

interface Env extends JobsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/jobs/')) return handleJobs(request, env);
    if (pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
