import { emptySavingsForm, savingsFormFrom, validateSavingsForm } from './savings-form';

describe('validateSavingsForm', () => {
  it('accepts a bank and balance, including a negative one', () => {
    expect(
      validateSavingsForm({ ...emptySavingsForm('me'), bank: ' HDFC ', balance: '-1,200.50' }),
    ).toEqual({
      errors: {},
      value: { portfolio_id: 'me', bank: 'HDFC', balance: -1200.5 },
    });
  });

  it('explains what is missing', () => {
    expect(validateSavingsForm({ portfolioId: '', bank: '', balance: 'lots' }).errors).toEqual({
      portfolioId: 'Choose a portfolio.',
      bank: 'Enter the bank or account name.',
      balance: 'Enter a number, e.g. 125000.50.',
    });
    expect(validateSavingsForm({ ...emptySavingsForm('me'), bank: 'x'.repeat(61) }).errors).toEqual(
      { bank: 'Use at most 60 characters.', balance: 'Enter the balance.' },
    );
  });

  it('round-trips a saved account', () => {
    const form = savingsFormFrom({
      id: 'a',
      owner_id: 'o',
      portfolio_id: 'me',
      bank: 'SBI',
      balance: 5000,
      updated_at: '',
    });
    expect(form).toEqual({ portfolioId: 'me', bank: 'SBI', balance: '5000' });
  });
});
