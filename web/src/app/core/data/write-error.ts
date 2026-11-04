/** Outcome of a write: `null` on success, otherwise a message for the owner. */
export type WriteError = string | null;

/** Maps a Postgres error from a write to a message the owner can act on. */
export function writeErrorMessage(
  error: { code?: string } | null,
  duplicate = 'This already exists.',
): WriteError {
  if (!error) return null;
  switch (error.code) {
    case '23505':
      return duplicate;
    case '23514':
      return 'Check the numbers: one of them is not allowed.';
    default:
      return 'Could not save. Try again.';
  }
}
