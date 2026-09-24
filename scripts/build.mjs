import './theme.mjs';
import { copyFile, mkdir } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'style.css', 'theme.css', 'theme-init.js', 'ui.js', 'app.js', 'scheduler.js', 'cloud.js', 'config.js']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
}
console.log('Gotowy statyczny build: dist/');
