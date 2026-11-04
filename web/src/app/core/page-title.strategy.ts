import { Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Route `title` drives both the browser tab and the top bar heading. */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  readonly current = signal('');

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot) ?? '';
    this.current.set(page);
    this.title.setTitle(page ? `${page} · Portfolio Tracker` : 'Portfolio Tracker');
  }
}
