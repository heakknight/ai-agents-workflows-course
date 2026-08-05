/*
 * Builds the offline font bundle from the redistributable WOFF2 files that
 * ship with the deck. This is the no-network equivalent of tools/fonts.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'fonts');
const faces = [
  {
    file: 'rubik-latin-var.woff2',
    family: 'Rubik',
    weight: '400 800',
  },
  {
    file: 'shantell-sans-latin-var.woff2',
    family: 'Shantell Sans',
    weight: '300 800',
  },
];

const rules = faces.map(({ file, family, weight }) => {
  const bytes = readFileSync(path.join(output, file));
  return `@font-face {
  font-family: "${family}";
  src: url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2");
  font-weight: ${weight};
  font-style: normal;
  font-display: block;
}`;
});

writeFileSync(
  path.join(output, 'fonts.css'),
  `/* Offline OFL-licensed deck fonts. See fonts/CREDITS.md. */\n\n${rules.join('\n\n')}\n`,
);

console.log('wrote fonts/fonts.css');
