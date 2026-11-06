export interface NavItem {
  path: string;
  label: string;
  /** Short label for the mobile bottom bar. */
  shortLabel: string;
  icon: string;
  /** Shown in the mobile bottom bar; the rest go in the "More" sheet. */
  primary: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/overview', label: 'Overview', shortLabel: 'Overview', icon: 'pi-home', primary: true },
  {
    path: '/mutual-funds',
    label: 'Mutual funds',
    shortLabel: 'MF',
    icon: 'pi-chart-line',
    primary: true,
  },
  { path: '/stocks', label: 'Stocks', shortLabel: 'Stocks', icon: 'pi-chart-bar', primary: true },
  { path: '/rsu', label: 'RSU', shortLabel: 'RSU', icon: 'pi-briefcase', primary: false },
  { path: '/savings', label: 'Savings', shortLabel: 'Savings', icon: 'pi-wallet', primary: false },
  {
    path: '/pf',
    label: 'Provident fund',
    shortLabel: 'PF',
    icon: 'pi-building-columns',
    primary: false,
  },
  {
    path: '/cards',
    label: 'Credit cards',
    shortLabel: 'Cards',
    icon: 'pi-credit-card',
    primary: false,
  },
  { path: '/settings', label: 'Settings', shortLabel: 'Settings', icon: 'pi-cog', primary: false },
];
