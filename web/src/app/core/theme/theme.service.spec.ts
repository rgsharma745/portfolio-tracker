import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('app-dark');
  });

  function create(): ThemeService {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  it('defaults to system mode', () => {
    expect(create().mode()).toBe('system');
  });

  it('adds .app-dark to <html> in dark mode and persists the choice', () => {
    const service = create();
    service.setMode('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
    expect(localStorage.getItem('pt.theme')).toBe('dark');
  });

  it('toggle flips between light and dark', () => {
    const service = create();
    service.setMode('light');
    service.toggle();
    TestBed.tick();
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
  });

  it('restores a stored mode', () => {
    localStorage.setItem('pt.theme', 'light');
    expect(create().mode()).toBe('light');
  });
});
