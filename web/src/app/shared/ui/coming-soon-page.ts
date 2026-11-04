import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from './empty-state';

/** Temporary route target until the feature page is built (PLAN.md Phase 6). */
@Component({
  selector: 'app-coming-soon-page',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-empty-state
      icon="pi-hammer"
      title="Coming soon"
      message="This page is being built. The navigation and portfolio switcher already work."
    />
  `,
})
export class ComingSoonPage {}
