import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';

@Component({ template: '<p>routed page</p>' })
class RoutedPage {}

describe('App', () => {
  it('renders the routed page', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([{ path: '', component: RoutedPage }])],
    });
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.textContent).toContain('routed page');
  });
});
