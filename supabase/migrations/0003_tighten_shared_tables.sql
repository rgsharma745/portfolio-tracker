-- Supabase Security Advisor follow-ups (6 Nov 2026).

-- 1. rls_auto_enable() is created by Supabase's "Automatic RLS" setting (an event-trigger
--    function, not from these migrations; it does not exist on the local stack). Nobody should
--    be able to call it through /rest/v1/rpc. The event trigger keeps working: Postgres does
--    not check EXECUTE when a trigger fires.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 2. The app only reads job_runs and mf_nav_latest; the jobs write them with the service role
--    (which bypasses RLS). Signed-in users get read access only. stock_price_latest and
--    fx_latest stay writable for manual overrides (docs/SECURITY.md).
drop policy "authenticated_all" on public.job_runs;
drop policy "authenticated_all" on public.mf_nav_latest;
create policy "authenticated_read" on public.job_runs      for select to authenticated using (true);
create policy "authenticated_read" on public.mf_nav_latest for select to authenticated using (true);
revoke insert, update, delete, truncate on public.job_runs, public.mf_nav_latest from authenticated;
