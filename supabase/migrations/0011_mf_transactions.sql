-- CAMS detailed CAS transactions. Holdings remain editable and are reconciled on import;
-- imported transaction history is immutable from the app and idempotent by source_key.

create table public.mf_transactions (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id      uuid not null references public.portfolios(id) on delete cascade,
  source_key        text not null check (length(source_key) = 64),
  scheme_code       text,
  scheme_name       text not null,
  folio             text not null default '',
  transaction_date  date not null,
  transaction_type  text not null check (transaction_type in (
    'PURCHASE', 'PURCHASE_SIP', 'REDEMPTION', 'DIVIDEND_PAYOUT', 'DIVIDEND_REINVEST',
    'SWITCH_IN', 'SWITCH_IN_MERGER', 'SWITCH_OUT', 'SWITCH_OUT_MERGER', 'STT_TAX',
    'STAMP_DUTY_TAX', 'TDS_TAX', 'SEGREGATION', 'GIFT_IN', 'GIFT_OUT', 'MISC',
    'UNKNOWN', 'REVERSAL'
  )),
  description       text not null,
  amount            numeric(18,2),
  units             numeric(18,6),
  nav               numeric(18,6),
  balance           numeric(18,6),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (owner_id, source_key)
);

create index mf_transactions_scope_date
  on public.mf_transactions (owner_id, portfolio_id, transaction_date desc);
create index mf_transactions_folio_date
  on public.mf_transactions (owner_id, portfolio_id, folio, transaction_date desc);

create trigger t_mf_transactions_touch before update on public.mf_transactions
  for each row execute function public.touch_updated_at();

alter table public.mf_transactions enable row level security;
create policy "owner_all" on public.mf_transactions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.mf_transactions from public, anon;
grant select, insert, update, delete on public.mf_transactions to authenticated;
grant all on public.mf_transactions to service_role;
