import { definePreset } from '@primeuix/themes';
import AuraBase from '@primeuix/themes/aura/base';
import button from '@primeuix/themes/aura/button';
import datatable from '@primeuix/themes/aura/datatable';
import dialog from '@primeuix/themes/aura/dialog';
import drawer from '@primeuix/themes/aura/drawer';
import iconfield from '@primeuix/themes/aura/iconfield';
import inputtext from '@primeuix/themes/aura/inputtext';
import message from '@primeuix/themes/aura/message';
import select from '@primeuix/themes/aura/select';
import selectbutton from '@primeuix/themes/aura/selectbutton';
import skeleton from '@primeuix/themes/aura/skeleton';
import tag from '@primeuix/themes/aura/tag';
import textarea from '@primeuix/themes/aura/textarea';
import togglebutton from '@primeuix/themes/aura/togglebutton';
import toggleswitch from '@primeuix/themes/aura/toggleswitch';

/**
 * Aura with only the components this app uses. The full `@primeuix/themes/aura` carries
 * tokens for 90+ components (~130 kB, all in the first download). Using a PrimeNG component
 * that is not listed here leaves it unstyled: add its tokens below.
 */
const Aura = {
  ...AuraBase,
  components: {
    button,
    datatable,
    dialog,
    drawer,
    iconfield,
    inputtext,
    message,
    select,
    selectbutton,
    skeleton,
    tag,
    textarea,
    togglebutton,
    toggleswitch,
  },
};

/**
 * Aura preset tuned to the visual style in docs/UI_SPEC.md:
 * one calm blue for actions, cool grey surfaces, pill buttons, rounded cards.
 */
const neutral = {
  0: '#ffffff',
  50: '#f7f7f7',
  100: '#eef0f3',
  200: '#dee1e6',
  300: '#c3c7ce',
  400: '#a8acb3',
  500: '#7c828a',
  600: '#5b616e',
  700: '#3d424b',
  800: '#23262c',
  900: '#16181c',
  950: '#0a0b0d',
};

export const AppPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
    },
  },
  semantic: {
    primary: {
      50: '#eef3ff',
      100: '#d9e4ff',
      200: '#b3c8ff',
      300: '#80a3ff',
      400: '#4d7dff',
      500: '#0052ff',
      600: '#003ecc',
      700: '#0032a3',
      800: '#00277f',
      900: '#001c5c',
      950: '#00113a',
    },
    colorScheme: {
      light: { surface: neutral },
      dark: { surface: neutral },
    },
  },
  components: {
    button: {
      root: { borderRadius: '9999px' },
    },
    // Unselected segments of a select button (1M/6M/…, India/US): Aura's surface 500 is
    // 3.4:1 on its surface 100 track; 600 meets AA.
    togglebutton: {
      root: { color: 'light-dark({surface.600}, {surface.400})' },
      icon: { color: 'light-dark({surface.600}, {surface.400})' },
    },
    // Holdings tables: roomy rows, a soft header band and a totals bar (UI_SPEC).
    datatable: {
      headerCell: { padding: '0.75rem 1rem' },
      columnTitle: { fontWeight: '600', fontSize: '0.75rem' },
      bodyCell: { padding: '0.875rem 1rem' },
      footerCell: { padding: '0.875rem 1rem' },
      columnFooter: { fontWeight: '600' },
      colorScheme: {
        light: {
          headerCell: { background: '{surface.50}', color: '{surface.600}' },
          row: { hoverBackground: '{surface.50}' },
          footerCell: { background: '{surface.50}' },
        },
        dark: {
          headerCell: { background: '{surface.900}', color: '{surface.300}' },
          row: { hoverBackground: '{surface.900}' },
          footerCell: { background: '{surface.900}' },
        },
      },
    },
  },
});
