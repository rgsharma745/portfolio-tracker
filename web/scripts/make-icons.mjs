// Renders the app icons in public/icons/ (the ₹ brand mark) with headless Chromium.
// Run after changing the design: `node scripts/make-icons.mjs`. The PNGs are committed.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { webDir } from './load-env.mjs';

const BLUE = '#0052ff';
const outDir = resolve(webDir, 'public/icons');
const fontDir = resolve(webDir, 'node_modules/@fontsource-variable/inter/files');

// name, size, shape, glyph size as a share of the icon
const ICONS = [
  ['icon-192.png', 192, 'circle', 0.56],
  ['icon-512.png', 512, 'circle', 0.56],
  // Maskable: full bleed; the launcher crops to its own shape, so keep the glyph in the middle 60%.
  ['maskable-512.png', 512, 'square', 0.42],
  // iOS rounds the corners itself and shows transparency as black.
  ['apple-touch-icon.png', 180, 'square', 0.5],
];

function page(size, shape, glyph) {
  const radius = shape === 'circle' ? '50%' : '0';
  return `<!doctype html><html><head><style>
    @font-face { font-family: Inter; font-weight: 100 900;
      src: url('file://${fontDir}/inter-latin-ext-wght-normal.woff2') format('woff2'),
           url('file://${fontDir}/inter-latin-wght-normal.woff2') format('woff2'); }
    html, body { margin: 0; background: transparent; }
    div { width: ${size}px; height: ${size}px; border-radius: ${radius}; background: ${BLUE};
      color: #fff; display: grid; place-items: center;
      font: 600 ${Math.round(size * glyph)}px/1 Inter, sans-serif; }
  </style></head><body><div>₹</div></body></html>`;
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [name, size, shape, glyph] of ICONS) {
  const tab = await browser.newPage({ viewport: { width: size, height: size } });
  await tab.setContent(page(size, shape, glyph));
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: resolve(outDir, name), omitBackground: shape === 'circle' });
  await tab.close();
  console.log(`make-icons: ${name}`);
}
await browser.close();
