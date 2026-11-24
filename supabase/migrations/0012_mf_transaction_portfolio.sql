-- A repeated import can refresh a transaction only in its original portfolio.
create function public.keep_mf_transaction_portfolio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise unique_violation using message = 'Mutual fund transaction is already assigned to another portfolio';
end;
$$;

create trigger t_mf_transactions_keep_portfolio
  before update of portfolio_id on public.mf_transactions
  for each row
  when (old.portfolio_id is distinct from new.portfolio_id)
  execute function public.keep_mf_transaction_portfolio();
