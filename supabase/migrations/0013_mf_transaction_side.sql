alter table public.mf_transactions
  add column transaction_side text generated always as (
    case
      when transaction_type in ('PURCHASE', 'PURCHASE_SIP', 'SWITCH_IN') then 'buy'
      when transaction_type in ('REDEMPTION', 'SWITCH_OUT') then 'sell'
    end
  ) stored;
