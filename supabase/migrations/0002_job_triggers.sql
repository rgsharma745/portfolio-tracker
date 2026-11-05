-- Run a job from the website (docs/ARCHITECTURE.md, "Run now").
-- The Cloudflare Worker at /api/jobs/:job calls claim_job_trigger with the signed-in owner's
-- token before it dispatches the GitHub workflow. One row per job holds the last manual
-- trigger only (latest-only, not a history table); a job can be triggered again 30 minutes
-- after that. The claim is a single statement, so two clicks at once cannot both win.

create table public.job_triggers (
  job           text primary key check (job in ('fetch_nav', 'fetch_prices')),
  triggered_at  timestamptz not null,
  triggered_by  uuid
);

-- Shared, no personal data (like job_runs). The owner may read it to show when "Run now"
-- is available again; writes go only through the functions below. Anonymous: nothing.
alter table public.job_triggers enable row level security;
create policy "authenticated_read" on public.job_triggers for select to authenticated using (true);

revoke all on public.job_triggers from public, anon, authenticated;
grant select on public.job_triggers to authenticated;
grant all on public.job_triggers to service_role;

-- Claims the 30-minute slot for p_job. claimed = false means it is locked until next_allowed_at.
create or replace function public.claim_job_trigger(p_job text)
returns table (claimed boolean, claimed_at timestamptz, next_allowed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  if p_job is null or p_job not in ('fetch_nav', 'fetch_prices') then
    raise exception 'Unknown job' using errcode = '22023';
  end if;

  insert into job_triggers as t (job, triggered_at, triggered_by)
  values (p_job, now(), v_uid)
  on conflict (job) do update
    set triggered_at = excluded.triggered_at, triggered_by = excluded.triggered_by
    where t.triggered_at <= now() - interval '30 minutes'
  returning t.triggered_at into v_at;

  if v_at is not null then
    return query select true, v_at, v_at + interval '30 minutes';
  else
    return query
      select false, t.triggered_at, t.triggered_at + interval '30 minutes'
      from job_triggers t where t.job = p_job;
  end if;
end $$;

-- Undoes a claim when the GitHub dispatch failed, so the owner can retry at once. Removes the
-- row only if it is still the claim made at p_at (never a newer one).
create or replace function public.release_job_trigger(p_job text, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  delete from job_triggers where job = p_job and triggered_at = p_at;
end $$;

revoke all on function public.claim_job_trigger(text)                  from public, anon;
revoke all on function public.release_job_trigger(text, timestamptz)   from public, anon;
grant execute on function public.claim_job_trigger(text)                to authenticated, service_role;
grant execute on function public.release_job_trigger(text, timestamptz) to authenticated, service_role;
