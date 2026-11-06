// npm run check: open the simulation in headless (invisible) Firefox,
// collect console errors, save a screenshot. Uses the installed Firefox,
// no browser download.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const FIREFOX = process.env.FIREFOX_PATH || '/Applications/Firefox.app/Contents/MacOS/firefox';
const OUT = 'check/screenshot.png';

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true });
const errors = [];
const logs = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => { if (m.type() === 'log') logs.push(m.text()); if (['error', 'warn'].includes(m.type())) errors.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));

  await page.goto(url, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 4000)); // let the scene and model load
  // drive forward and turn a bit, so wheel tracks appear
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 2500));
  await page.keyboard.down('a');
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.up('a');
  await page.keyboard.up('w');
  await new Promise((r) => setTimeout(r, 1500));
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
  if (!hasCanvas) errors.push('[check] no <canvas> found: the scene did not start');

  mkdirSync('check', { recursive: true });
  await page.screenshot({ path: OUT });
} finally {
  await browser.close();
  await server.close();
}

console.log(`Screenshot: ${OUT}`);
if (logs.length) console.log('\nConsole log:\n' + logs.map((l) => ' > ' + l).join('\n'));
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  for (const e of errors) console.log(' - ' + e);
  process.exit(1);
}
console.log('No console errors.');
