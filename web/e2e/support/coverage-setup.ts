import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions, E2E_COVERAGE } from './coverage';

/** Clears coverage left by an earlier run before any worker adds to it. */
export default function coverageSetup(): void {
  if (E2E_COVERAGE) new CoverageReport(coverageOptions).cleanCache();
}
