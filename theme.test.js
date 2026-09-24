import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('./theme.css', import.meta.url), 'utf8');
const luminance = (hex) => {
  const channels = hex.match(/[a-f0-9]{2}/gi).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const themeNames = ['zielony', ...new Set([...css.matchAll(/data-color-theme="([\w-]+)"/g)].map((match) => match[1]))];
for (const name of themeNames) {
  const selector = name === 'zielony' ? '' : `[data-color-theme="${name}"]`;
  for (const mode of ['light', 'dark']) {
    test(`motyw ${name} ${mode}: kontrast tekstu i komplet powierzchni tonalnych`, () => {
      const block = css.split(`:root${selector}[data-theme="${mode}"] {`)[1].split('}')[0];
      const roles = Object.fromEntries([...block.matchAll(/--md-sys-color-([\w-]+): (#[\da-f]{6});/g)].map((match) => [match[1], match[2]]));
      for (const role of ['primary', 'secondary', 'tertiary', 'error', 'primary-container', 'secondary-container', 'tertiary-container', 'error-container', 'surface']) {
        const values = [luminance(roles[role]), luminance(roles[`on-${role}`])].sort((a, b) => a - b);
        const contrast = (values[1] + .05) / (values[0] + .05);
        assert.ok(contrast >= 4.5, `${role}: kontrast ${contrast.toFixed(2)} < 4.5`);
      }
      for (const role of ['surface', 'surface-dim', 'surface-bright', 'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest']) {
        assert.ok(roles[role], `Brak roli ${role}`);
        assert.notEqual(roles[role], '#000000');
      }
    });
  }
}
