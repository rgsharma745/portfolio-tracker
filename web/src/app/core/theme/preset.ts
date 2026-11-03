import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

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
  },
});
