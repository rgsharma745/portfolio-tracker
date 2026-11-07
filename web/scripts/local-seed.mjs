// Sample holdings for a LOCAL user, so every page has something to show during development.
// Only used by local-user.mjs against the local stack. Values are made up; never production.

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86_400_000));
const monthStart = (offset) => {
  const now = new Date();
  return iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1)));
};
const dayOfMonth = (offset, day) => {
  const now = new Date();
  const last = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, Math.min(day, last))));
};

/**
 * Seeds holdings for the user's "Me" and "Wife" portfolios unless they already have funds,
 * and upserts the shared market data (latest NAVs, prices, USDINR).
 */
export async function seedHoldings(api, ownerId) {
  const existing = await (
    await api(`/rest/v1/mf_holdings?select=id&owner_id=eq.${ownerId}`)
  ).json();
  await upsertMarketData(api);
  if (existing.length) return false;

  const portfolios = await (
    await api(`/rest/v1/portfolios?select=id,name&owner_id=eq.${ownerId}`)
  ).json();
  const id = Object.fromEntries(portfolios.map((p) => [p.name, p.id]));
  if (!id.Me || !id.Wife) throw new Error('Seed needs the Me and Wife portfolios.');
  const own = (rows) => rows.map((r) => ({ owner_id: ownerId, ...r }));

  await insert(
    api,
    'mf_holdings',
    own([
      {
        portfolio_id: id.Me,
        scheme_name: 'Sample Flexi Cap Fund - Direct Growth',
        scheme_code: '900001',
        units: 1520.348,
        invested: 120000,
      },
      {
        portfolio_id: id.Me,
        scheme_name: 'Sample Index Fund Nifty 50 - Direct Growth',
        scheme_code: '900002',
        units: 845.1,
        invested: 150000,
        folio: '1234567/89',
      },
      {
        portfolio_id: id.Me,
        scheme_name: 'Sample Small Cap Fund - Direct Growth',
        scheme_code: '900003',
        units: 610.75,
        invested: 95000,
      },
      {
        portfolio_id: id.Me,
        scheme_name: 'Sample Fund Without A Code',
        scheme_code: null,
        units: 100,
        invested: 10000,
      },
      {
        portfolio_id: id.Wife,
        scheme_name: 'Sample Index Fund Nifty 50 - Direct Growth',
        scheme_code: '900002',
        units: 300,
        invested: 52000,
      },
      {
        portfolio_id: id.Wife,
        scheme_name: 'Sample Liquid Fund - Direct Growth',
        scheme_code: '900004',
        units: 25.5,
        invested: 80000,
      },
    ]),
  );
  await insert(
    api,
    'stock_holdings',
    own([
      {
        portfolio_id: id.Me,
        market: 'IN',
        symbol: 'SAMPLEIN1',
        name: 'Sample Industries',
        currency: 'INR',
        quantity: 40,
        avg_price: 1450,
        invested: 58000,
      },
      {
        portfolio_id: id.Me,
        market: 'IN',
        symbol: 'SAMPLEIN2',
        name: 'Sample Bank',
        currency: 'INR',
        quantity: 120,
        avg_price: 820,
        invested: 98400,
      },
      {
        portfolio_id: id.Me,
        market: 'US',
        symbol: 'SMPL',
        name: 'Sample Corp',
        currency: 'USD',
        quantity: 15,
        avg_price: 140,
        invested: 2100,
      },
      {
        portfolio_id: id.Wife,
        market: 'IN',
        symbol: 'SAMPLEIN1',
        name: 'Sample Industries',
        currency: 'INR',
        quantity: 10,
        avg_price: 1600,
        invested: 16000,
      },
    ]),
  );
  await insert(
    api,
    'rsu_grants',
    own([
      {
        portfolio_id: id.Me,
        symbol: 'SMPL',
        grant_label: '2024 annual',
        grant_date: '2024-03-15',
        units_granted: 200,
        units_vested: 150,
        units_sold_for_tax: 50,
        tax_rate: 0.3,
      },
      {
        portfolio_id: id.Me,
        symbol: 'SMPL',
        grant_label: '2025 annual',
        grant_date: '2025-03-15',
        units_granted: 120,
        units_vested: 30,
        units_sold_for_tax: 10,
        tax_rate: 0.3,
      },
    ]),
  );
  await insert(
    api,
    'savings_accounts',
    own([
      { portfolio_id: id.Me, bank: 'Sample Bank Savings', balance: 245000 },
      { portfolio_id: id.Me, bank: 'Sample Salary Account', balance: 82000.5 },
      { portfolio_id: id.Wife, bank: 'Sample Joint Account', balance: 150000 },
    ]),
  );
  const cards = await insert(
    api,
    'credit_cards',
    own([
      {
        portfolio_id: id.Me,
        name: 'Sample Rewards Card',
        bank: 'Sample Bank',
        bill_day: 14,
        due_day: 3,
      },
      {
        portfolio_id: id.Me,
        name: 'Sample Travel Card',
        bank: 'Other Bank',
        bill_day: 1,
        due_day: 20,
      },
      {
        portfolio_id: id.Wife,
        name: 'Sample Cashback Card',
        bank: 'Sample Bank',
        bill_day: 20,
        due_day: 8,
      },
    ]),
  );
  const card = Object.fromEntries(cards.map((c) => [c.name, c.id]));
  await insert(
    api,
    'card_bills',
    own([
      // Last month: one paid, one still unpaid (shows under earlier bills).
      {
        card_id: card['Sample Rewards Card'],
        statement_month: monthStart(-1),
        due_date: dayOfMonth(0, 3),
        amount: 18450,
        paid_amount: 18450,
        paid_on: dayOfMonth(0, 1),
      },
      {
        card_id: card['Sample Cashback Card'],
        statement_month: monthStart(-1),
        due_date: dayOfMonth(0, 8),
        amount: 6200,
        paid_amount: 0,
      },
      // This month: one entered, one partly paid, one awaiting the statement.
      {
        card_id: card['Sample Rewards Card'],
        statement_month: monthStart(0),
        due_date: dayOfMonth(1, 3),
        amount: 22310,
        paid_amount: 0,
      },
      {
        card_id: card['Sample Travel Card'],
        statement_month: monthStart(0),
        due_date: dayOfMonth(0, 20),
        amount: 9800,
        paid_amount: 4000,
      },
      {
        card_id: card['Sample Cashback Card'],
        statement_month: monthStart(0),
        due_date: dayOfMonth(1, 8),
        amount: null,
        paid_amount: 0,
      },
    ]),
  );
  return true;
}

/**
 * Sample PF passbook: 18 months for one company in "Me", 6 for "Wife", and last year's
 * interest. Added only if the user has no PF rows yet (independent of the other holdings).
 */
export async function seedPf(api, ownerId) {
  const existing = await (
    await api(`/rest/v1/pf_entries?select=id&limit=1&owner_id=eq.${ownerId}`)
  ).json();
  if (existing.length) return false;
  const portfolios = await (
    await api(`/rest/v1/portfolios?select=id,name&owner_id=eq.${ownerId}`)
  ).json();
  const id = Object.fromEntries(portfolios.map((p) => [p.name, p.id]));
  if (!id.Me || !id.Wife) return false;
  const WAGE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Wages for month M are credited around the 8th of M + 1 (the last one: last month's wages).
  const months = (portfolioId, company, count, employee, employer, pension) =>
    Array.from({ length: count }, (_, i) => {
      const wage = new Date(monthStart(-count - 1 + i + 1));
      return {
        owner_id: ownerId,
        portfolio_id: portfolioId,
        company,
        contribution_type: 'monthly',
        wage_month: WAGE[wage.getUTCMonth()],
        wage_year: wage.getUTCFullYear(),
        transaction_date: dayOfMonth(-count + i + 1, 8),
        employee_amount: employee,
        employer_amount: employer,
        pension_amount: pension,
      };
    });
  const now = new Date();
  const lastAugust = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  await insert(api, 'pf_entries', [
    ...months(id.Me, 'Sample Tech Pvt Ltd', 18, 7200, 5950, 1250),
    ...months(id.Wife, 'Sample Bank Ltd', 6, 3600, 2350, 1250),
    {
      owner_id: ownerId,
      portfolio_id: id.Me,
      company: 'Sample Tech Pvt Ltd',
      contribution_type: 'interest',
      wage_month: null,
      wage_year: null,
      transaction_date: `${lastAugust}-08-20`,
      employee_amount: 18240.5,
      employer_amount: 14110,
      pension_amount: 0,
    },
  ]);
  return true;
}

/**
 * Sample PPF: one account in "Me" with deposits over four financial years (the last finished
 * one over the ₹1.5 lakh limit, to show the flag) and yearly interest, and a younger account
 * in "Wife". Added only if the user has no PPF rows yet.
 */
export async function seedPpf(api, ownerId) {
  const existing = await (
    await api(`/rest/v1/ppf_entries?select=id&limit=1&owner_id=eq.${ownerId}`)
  ).json();
  if (existing.length) return false;
  const portfolios = await (
    await api(`/rest/v1/portfolios?select=id,name&owner_id=eq.${ownerId}`)
  ).json();
  const id = Object.fromEntries(portfolios.map((p) => [p.name, p.id]));
  if (!id.Me || !id.Wife) return false;
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const row = (portfolioId, account, type, date, amount) => ({
    owner_id: ownerId,
    portfolio_id: portfolioId,
    account,
    entry_type: type,
    entry_date: date,
    amount,
  });
  const me = (type, date, amount) => row(id.Me, 'SBI PPF', type, date, amount);
  await insert(api, 'ppf_entries', [
    me('investment', `${fy - 3}-04-05`, 150000),
    me('interest', `${fy - 2}-03-31`, 11360),
    me('investment', `${fy - 2}-04-05`, 120000),
    me('interest', `${fy - 1}-03-31`, 21850.4),
    me('investment', `${fy - 1}-04-05`, 100000),
    me('investment', `${fy - 1}-12-20`, 60000),
    me('interest', `${fy}-03-31`, 32400.75),
    me('investment', `${fy}-04-05`, 75000),
    row(id.Wife, 'Post office PPF', 'investment', `${fy - 1}-05-10`, 50000),
    row(id.Wife, 'Post office PPF', 'interest', `${fy}-03-31`, 2900),
    row(id.Wife, 'Post office PPF', 'investment', `${fy}-05-10`, 50000),
  ]);
  return true;
}

/** Adds sample daily history for the history chart, unless the user already has some. */
export async function seedHistory(api, ownerId) {
  const existing = await (
    await api(`/rest/v1/portfolio_snapshots?select=id&limit=1&owner_id=eq.${ownerId}`)
  ).json();
  if (existing.length) return false;
  const portfolios = await (
    await api(`/rest/v1/portfolios?select=id,name&owner_id=eq.${ownerId}`)
  ).json();
  const id = Object.fromEntries(portfolios.map((p) => [p.name, p.id]));
  if (!id.Me || !id.Wife) return false;
  const rows = sampleHistory(id.Me, id.Wife).map((r) => ({ owner_id: ownerId, ...r }));
  await insert(api, 'portfolio_snapshots', rows);
  return true;
}

/** 200 days of made-up daily totals with a gentle upward drift and some noise. */
function sampleHistory(me, wife) {
  const rows = [];
  for (let n = 200; n >= 1; n--) {
    const drift = (200 - n) / 200;
    const wave = Math.sin(n / 9) * 0.03 + Math.sin(n / 3.1) * 0.01;
    for (const [portfolioId, base] of [
      [me, 520000],
      [wife, 190000],
    ]) {
      const factor = 1 + drift * 0.12 + wave;
      rows.push({
        portfolio_id: portfolioId,
        snap_date: daysAgo(n),
        mf_value: Math.round(base * 0.7 * factor),
        stocks_value: Math.round(base * 0.3 * factor),
        rsu_vested_value: 0,
        savings: 0,
        card_dues: 0,
        pf_balance: Math.round(base * 0.45 * (1 + drift * 0.08)),
        ppf_balance: Math.round(base * 0.6 * (1 + drift * 0.05)),
      });
    }
  }
  return rows;
}

async function upsertMarketData(api) {
  const merge = { Prefer: 'resolution=merge-duplicates' };
  const today = daysAgo(0);
  const yesterday = daysAgo(1);
  await insert(
    api,
    'mf_nav_latest',
    [
      {
        scheme_code: '900001',
        nav: 98.4521,
        nav_date: yesterday,
        prev_nav: 97.9012,
        prev_nav_date: daysAgo(2),
      },
      {
        scheme_code: '900002',
        nav: 231.115,
        nav_date: yesterday,
        prev_nav: 232.5,
        prev_nav_date: daysAgo(2),
      },
      // Stale on purpose: shows the "Stale" badge.
      {
        scheme_code: '900003',
        nav: 142.73,
        nav_date: daysAgo(9),
        prev_nav: 141.2,
        prev_nav_date: daysAgo(10),
      },
      {
        scheme_code: '900004',
        nav: 3420.88,
        nav_date: yesterday,
        prev_nav: 3420.21,
        prev_nav_date: daysAgo(2),
      },
    ],
    merge,
    'scheme_code',
  );
  await insert(
    api,
    'stock_price_latest',
    [
      {
        symbol: 'SAMPLEIN1',
        close: 1612.4,
        price_date: today,
        prev_close: 1598,
        prev_price_date: yesterday,
        source: 'seed',
      },
      {
        symbol: 'SAMPLEIN2',
        close: 781.25,
        price_date: today,
        prev_close: 790.1,
        prev_price_date: yesterday,
        source: 'seed',
      },
      {
        symbol: 'SMPL',
        close: 171.32,
        price_date: yesterday,
        prev_close: 168.9,
        prev_price_date: daysAgo(2),
        source: 'seed',
      },
    ],
    merge,
    'symbol',
  );
  await insert(
    api,
    'fx_latest',
    [
      {
        pair: 'USDINR',
        rate: 85.42,
        rate_date: today,
        prev_rate: 85.31,
        prev_rate_date: yesterday,
      },
    ],
    merge,
    'pair',
  );
}

async function insert(api, table, rows, headers = {}, onConflict = '') {
  // Rows may omit optional fields; `columns` lets the omitted ones take their defaults.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].join(',');
  const query = `?columns=${columns}${onConflict ? `&on_conflict=${onConflict}` : ''}`;
  const prefer = [headers.Prefer, 'return=representation'].filter(Boolean).join(',');
  const res = await api(`/rest/v1/${table}${query}`, {
    method: 'POST',
    headers: { Prefer: prefer },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Could not seed ${table}: ${await res.text()}`);
  return res.json();
}
