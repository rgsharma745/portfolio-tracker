import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import {
  PORTFOLIO_NAME_MAX,
  Portfolio,
  PortfolioContents,
  PortfolioService,
} from '../../core/data/portfolio.service';

/** Settings › Portfolios: add, rename, reorder, (de)activate, delete with strong confirmation. */
@Component({
  selector: 'app-portfolios-section',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    TagModule,
    ToggleSwitchModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './portfolios-section.html',
  styleUrl: './portfolios-section.scss',
})
export class PortfoliosSection {
  protected readonly service = inject(PortfolioService);
  protected readonly maxLength = PORTFOLIO_NAME_MAX;

  protected readonly newName = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly deleting = signal<Portfolio | null>(null);
  protected readonly deleteContents = signal<PortfolioContents | null>(null);
  protected readonly deleteConfirm = signal('');
  protected readonly deleteOpen = computed(() => this.deleting() !== null);
  protected readonly deleteAllowed = computed(
    () => this.deleteConfirm().trim() === this.deleting()?.name,
  );

  protected async add(): Promise<void> {
    if (await this.run(() => this.service.create(this.newName()))) this.newName.set('');
  }

  protected startRename(portfolio: Portfolio): void {
    this.error.set(null);
    this.editingId.set(portfolio.id);
    this.editName.set(portfolio.name);
  }

  protected async saveRename(portfolio: Portfolio): Promise<void> {
    if (this.editName().trim() === portfolio.name) {
      this.editingId.set(null);
      return;
    }
    if (await this.run(() => this.service.rename(portfolio.id, this.editName()))) {
      this.editingId.set(null);
    }
  }

  protected move(portfolio: Portfolio, direction: -1 | 1): void {
    void this.run(() => this.service.move(portfolio.id, direction));
  }

  protected setActive(portfolio: Portfolio, isActive: boolean): void {
    void this.run(() => this.service.setActive(portfolio.id, isActive));
  }

  protected async askDelete(portfolio: Portfolio): Promise<void> {
    this.deleteConfirm.set('');
    this.deleteContents.set(null);
    this.deleting.set(portfolio);
    this.deleteContents.set(await this.service.contents(portfolio.id));
  }

  protected closeDelete(): void {
    this.deleting.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const portfolio = this.deleting();
    if (!portfolio || !this.deleteAllowed()) return;
    if (await this.run(() => this.service.remove(portfolio.id))) this.closeDelete();
  }

  protected async deactivateInstead(): Promise<void> {
    const portfolio = this.deleting();
    if (!portfolio) return;
    if (await this.run(() => this.service.setActive(portfolio.id, false))) this.closeDelete();
  }

  /** Runs a write, tracking busy/error state. Returns true on success. */
  private async run(write: () => Promise<string | null>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    const error = await write();
    this.busy.set(false);
    this.error.set(error);
    return error === null;
  }
}
