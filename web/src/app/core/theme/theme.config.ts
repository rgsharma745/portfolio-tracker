import { providePrimeNG } from 'primeng/config';
import { env } from '../../../environments/env';
import { AppPreset } from './preset';

export const providePrimeTheme = () =>
  providePrimeNG({
    license: env.primeuiLicense || undefined,
    theme: {
      preset: AppPreset,
      options: {
        darkModeSelector: '.app-dark',
        cssLayer: { name: 'primeng', order: 'theme, base, primeng, components, utilities' },
      },
    },
  });
