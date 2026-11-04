import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

/** Placeholder rows while a list or table loads. */
@Component({
  selector: 'app-list-skeleton',
  imports: [SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-card flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      @for (row of rowIndexes(); track row) {
        <div class="flex items-center justify-between gap-4">
          <p-skeleton width="45%" height="1rem" />
          <p-skeleton width="25%" height="1rem" />
        </div>
      }
    </div>
  `,
})
export class ListSkeleton {
  readonly rows = input(5);
  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
}
