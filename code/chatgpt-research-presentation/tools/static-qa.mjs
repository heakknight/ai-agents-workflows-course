import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const cssFiles = ['core/slides.css', 'theme.css', 'deck.css'];
const scriptFiles = ['core/slides.js', 'core/morph.js'];
const pass = [];
const fail = [];
const check = (ok, label, detail = '') => (ok ? pass : fail).push(`${label}${detail ? ` — ${detail}` : ''}`);

const slides = [...html.matchAll(/<section class="slide(?: [^"]*)?"[\s\S]*?<\/section>/g)].map((m) => m[0]);
check(slides.length === 5, 'exactly five slides', `${slides.length} found`);

const revealCounts = slides.map((slide) => {
  const steps = [...slide.matchAll(/data-enter="(\d+)"/g)].map((m) => Number(m[1]));
  const max = steps.length ? Math.max(...steps) : 0;
  const contiguous = Array.from({ length: max }, (_, i) => i + 1).every((step) => steps.includes(step));
  return { max, contiguous };
});
check(revealCounts.every((item) => item.contiguous), 'reveal steps are contiguous');
check(
  JSON.stringify(revealCounts.map((item) => item.max)) === JSON.stringify([0, 5, 4, 5, 4]),
  'reveal sequence matches the authored talk track',
  revealCounts.map((item) => item.max).join(','),
);

check(slides.every((slide) => /aria-label="[^"]+"/.test(slide)), 'every slide has an accessible name');
const slideSlugs = slides.map((slide) => slide.match(/data-slide="([^"]+)"/)?.[1]);
check(slideSlugs.every(Boolean), 'every slide has a recording slug');
check(new Set(slideSlugs).size === slideSlugs.length, 'recording slugs are unique');
check(slides.slice(1).every((slide) => /<div class="slide-body/.test(slide)), 'every content slide has one slide body');

const footerNumbers = [...html.matchAll(/<span>(\d{2}) \/ 05<\/span>/g)].map((m) => m[1]);
check(footerNumbers.join(',') === '01,02,03,04,05', 'slide numbers are sequential');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
check(new Set(ids).size === ids.length, 'HTML ids are unique');

const localAssets = [
  ...[...html.matchAll(/(?:href|src)="([^":#]+)"/g)].map((m) => m[1]),
  ...cssFiles,
  ...scriptFiles,
];
const missing = [...new Set(localAssets)].filter((file) => !existsSync(path.join(root, file)));
check(missing.length === 0, 'all local assets exist', missing.join(', '));
check(!/(?:href|src)="https?:\/\//.test(html), 'deck makes no external page requests');

const fonts = read('fonts/fonts.css');
check(fonts.includes('data:font/woff2;base64,'), 'fonts are embedded for offline playback');

for (const file of cssFiles) {
  const css = read(file);
  const opens = (css.match(/{/g) || []).length;
  const closes = (css.match(/}/g) || []).length;
  check(opens === closes, `${file} has balanced blocks`, `${opens}/${closes}`);
}

for (const result of pass) console.log(`  ok    ${result}`);
for (const result of fail) console.log(`  FAIL  ${result}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
