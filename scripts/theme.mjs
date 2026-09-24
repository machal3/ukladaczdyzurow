import { argbFromHex, hexFromArgb, Hct, TonalPalette, SchemeTonalSpot, MaterialDynamicColors } from '@material/material-color-utilities';
import { writeFile } from 'node:fs/promises';

// Jedno źródło wszystkich palet HCT. Wygenerowany CSS działa również bez bundlera.
const seed = '#236a4c';
const source = Hct.fromInt(argbFromHex(seed));
const light = new SchemeTonalSpot(source, false, 0);
const palettesByName = Object.fromEntries(['primary', 'secondary', 'tertiary', 'neutral', 'neutralVariant', 'error'].map((name) => [name, light[`${name}Palette`]]));
const quality = {
  weakDay: TonalPalette.fromInt(argbFromHex('#ad7b00')),
  badDay: TonalPalette.fromInt(argbFromHex('#b24b00')),
};
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const roles = (dark) => {
  const scheme = new SchemeTonalSpot(source, dark, 0);
  return Object.entries(MaterialDynamicColors)
    .filter(([, color]) => typeof color?.getArgb === 'function')
    .map(([name, color]) => `  --md-sys-color-${kebab(name)}: ${hexFromArgb(color.getArgb(scheme))};`)
    .concat(Object.entries(quality).flatMap(([name, palette]) => {
      const base = name.replace(/Day$/, '').toLowerCase();
      const background = dark ? 30 : 90, foreground = dark ? 90 : 30;
      return [`  --md-semantic-color-${base}-container: ${hexFromArgb(palette.tone(background))};`, `  --md-semantic-color-on-${base}-container: ${hexFromArgb(palette.tone(foreground))};`];
    })).join('\n');
};
const palettes = Object.entries(palettesByName).flatMap(([name, palette]) =>
  [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100].map((tone) =>
    `  --md-ref-palette-${kebab(name)}-${tone}: ${hexFromArgb(palette.tone(tone))};`)).join('\n');
await writeFile(new URL('../theme.css', import.meta.url), `/* Wygenerowane przez npm run theme. Seed: ${seed}. */\n:root {\n${palettes}\n${roles(false)}\n  color-scheme: light;\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n${roles(true)}\n    color-scheme: dark;\n  }\n}\n:root[data-theme="light"] {\n${roles(false)}\n  color-scheme: light;\n}\n:root[data-theme="dark"] {\n${roles(true)}\n  color-scheme: dark;\n}\n`);
