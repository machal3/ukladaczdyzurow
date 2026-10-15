import './theme.mjs';
import { copyFile, mkdir } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await mkdir(new URL('fonts/', output), { recursive: true });
for (const file of ['index.html', 'style.css', 'theme.css', 'theme-init.js', 'ui.js', 'app.js', 'scheduler.js', 'scheduler-client.js', 'scheduler-worker.js', 'cloud.js', 'export.js', 'config.js', 'icon.svg',
  'fonts/PlusJakartaSans-Regular.ttf', 'fonts/PlusJakartaSans-Bold.ttf', 'fonts/OFL.txt']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
}
console.log('Gotowy statyczny build: dist/');
