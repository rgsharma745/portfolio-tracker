-- Expiry is optional; only ESOP grants can supply a date.
alter table public.equity_grants drop constraint equity_grants_check;
alter table public.equity_grants add constraint equity_grants_expiry_check
  check (expires_on is null or (kind = 'ESOP' and expires_on >= granted_on));
