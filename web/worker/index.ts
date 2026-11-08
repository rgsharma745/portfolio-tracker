// Cloudflare Worker entry. Only /api/* reaches `fetch` (wrangler.jsonc `run_worker_first`);
// every other path is served straight from the static assets, as before. `scheduled` runs on
// the Cron Triggers in wrangler.jsonc and starts the jobs on time (worker/schedule.ts).
import { JobsEnv, handleJobs } from './jobs';
import { handleScheduled } from './schedule';

interface Env extends JobsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** The parts of Cloudflare's ScheduledController and ExecutionContext used here. */
interface ScheduledController {
  readonly cron: string;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
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

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(handleScheduled(controller.cron, env));
  },
};
