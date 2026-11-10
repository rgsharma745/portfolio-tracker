import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions, E2E_COVERAGE } from './coverage';

/** Writes coverage/e2e/lcov.info once every worker has added its tests' coverage. */
export default async function coverageTeardown(): Promise<void> {
  if (E2E_COVERAGE) await new CoverageReport(coverageOptions).generate();
}
