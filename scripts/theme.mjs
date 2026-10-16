import { argbFromHex, hexFromArgb, Hct, TonalPalette, SchemeTonalSpot, MaterialDynamicColors } from '@material/material-color-utilities';
import { writeFile } from 'node:fs/promises';

// Jedno źródło wszystkich palet HCT. Wygenerowany CSS działa również bez bundlera.
// Pierwszy motyw jest domyślny: trafia do gołego :root (bez data-color-theme), więc
// użytkownicy bez zapisanego wyboru nic nie tracą.
const themes = [
  { name: 'zielony', seed: '#236a4c' },
  { name: 'niebieski', seed: '#2260ea' },
  { name: 'fioletowy', seed: '#6750a4' },
  { name: 'bursztynowy', seed: '#8b5000' },
  { name: 'czerwony', seed: '#b3261e' },
  { name: 'rozowy', seed: '#b0306a' },
  { name: 'turkusowy', seed: '#006a6a' },
];
const quality = {
  weakDay: TonalPalette.fromInt(argbFromHex('#ad7b00')),
  badDay: TonalPalette.fromInt(argbFromHex('#b24b00')),
};
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const roles = (source, dark) => {
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
const refPalette = (source) => {
  const light = new SchemeTonalSpot(source, false, 0);
  const palettesByName = Object.fromEntries(['primary', 'secondary', 'tertiary', 'neutral', 'neutralVariant', 'error'].map((name) => [name, light[`${name}Palette`]]));
  return Object.entries(palettesByName).flatMap(([name, palette]) =>
    [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100].map((tone) =>
      `  --md-ref-palette-${kebab(name)}-${tone}: ${hexFromArgb(palette.tone(tone))};`)).join('\n');
};
const css = themes.map(({ name, seed }, index) => {
  const source = Hct.fromInt(argbFromHex(seed));
  const base = index === 0 ? ':root' : `:root[data-color-theme="${name}"]`;
  const comment = `/* Motyw ${name}. Seed: ${seed}. */`;
  return [
    comment,
    `${base} {\n${index === 0 ? `${refPalette(source)}\n` : ''}${roles(source, false)}\n  color-scheme: light;\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${base} {\n${roles(source, true)}\n    color-scheme: dark;\n  }\n}`,
    `${base}[data-theme="light"] {\n${roles(source, false)}\n  color-scheme: light;\n}`,
    `${base}[data-theme="dark"] {\n${roles(source, true)}\n  color-scheme: dark;\n}`,
  ].join('\n');
}).join('\n');
await writeFile(new URL('../theme.css', import.meta.url), `/* Wygenerowane przez npm run theme. */\n${css}\n`);
