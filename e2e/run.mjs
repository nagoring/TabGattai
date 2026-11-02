// End-to-end check in a real Chromium with the extension loaded.
// Usage: npm run e2e   (requires Playwright + Chromium available on the machine)
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const extDir = resolve(process.argv[2] ?? 'dist-e2e');

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><title>Page ${req.url}</title><h1>${req.url}</h1>`);
}).listen(0);
const port = server.address().port;
const u = (p) => `http://127.0.0.1:${port}${p}`;

const profile = mkdtempSync(join(tmpdir(), 'tabmerge-e2e-'));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

async function launch() {
  return chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium', // new headless mode: supports extensions
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
}

async function findManager(ctx) {
  for (let i = 0; i < 50; i++) {
    const m = ctx.pages().find((p) => p.url().includes('/manager.html'));
    if (m) {
      await m.waitForLoadState();
      return m;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

async function clickAction(ctx) {
  const [sw] = ctx.serviceWorkers().length ? ctx.serviceWorkers() : [await ctx.waitForEvent('serviceworker')];
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await globalThis.__tabmergeE2E.onActionClicked(tab);
  });
  return sw;
}

try {
  let ctx = await launch();
  const first = ctx.pages()[0] ?? (await ctx.newPage());
  await first.goto(u('/a'));
  for (const p of ['/b', '/c', '/b']) await (await ctx.newPage()).goto(u(p));
  const sw = await clickAction(ctx);
  const extId = new URL(sw.url()).host;

  const manager = await findManager(ctx);
  check(manager?.url().startsWith(`chrome-extension://${extId}/`), 'manager is an extension page');
  check(!!manager, 'manager page opened');
  await manager.waitForSelector('.tab-row');
  check((await manager.locator('.tab-row').count()) === 3, 'three unique tabs saved (duplicate /b merged)');
  check(ctx.pages().filter((p) => p.url().startsWith('http')).length === 0, 'saved tabs were closed');
  check((await manager.locator('.toast').innerText()).includes('3'), 'notice toast shown');

  // Second save with a duplicate -> moves to the newest group
  await (await ctx.newPage()).goto(u('/b'));
  await (await ctx.newPage()).goto(u('/d'));
  await manager.bringToFront();
  await clickAction(ctx);
  const mgr2 = await findManager(ctx);
  await mgr2.waitForFunction(() => document.querySelectorAll('.group').length === 2);
  const groups = await mgr2.$$eval('.group', (gs) => gs.map((g) => [...g.querySelectorAll('.tab-url')].map((e) => new URL(e.textContent).pathname)));
  check(JSON.stringify(groups) === JSON.stringify([['/b', '/d'], ['/a', '/c']]), `latest-wins merge: ${JSON.stringify(groups)}`);

  // Search
  await mgr2.fill('input[type=search]', 'PAGE /C');
  await mgr2.waitForFunction(() => document.querySelectorAll('.tab-row').length === 1);
  check(true, 'search filters case-insensitively');
  await mgr2.fill('input[type=search]', '');

  // Individual restore
  const before = ctx.pages().length;
  await mgr2.locator('.tab-link', { hasText: 'Page /a' }).click();
  await mgr2.waitForFunction(() => document.querySelectorAll('.tab-row').length === 3);
  check(ctx.pages().length === before + 1, 'individual restore opened a tab and removed the entry');

  // Settings dialog + dark theme + English
  await mgr2.click('.topbar .button');
  await mgr2.selectOption('select >> nth=1', 'en');
  await mgr2.selectOption('select >> nth=0', 'dark');
  await mgr2.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dataset.theme === 'dark');
  check((await mgr2.locator('#settings-title').innerText()) === 'Settings', 'language switched to English');

  // Errors on page?
  const errors = [];
  mgr2.on('pageerror', (e) => errors.push(e));
  await mgr2.reload();
  await mgr2.waitForSelector('.tab-row');
  check(errors.length === 0, 'no page errors');

  // Nothing to save -> notice, no empty group
  for (const p of ctx.pages()) if (p.url().startsWith('http')) await p.close();
  await clickAction(ctx);
  const mgr3 = await findManager(ctx);
  await mgr3.waitForSelector('.toast');
  check((await mgr3.locator('.group').count()) === 2, 'no empty group created when nothing to save');
  await mgr3.screenshot({ path: join(process.env.E2E_SHOTS ?? tmpdir(), 'tabmerge-dark-en.png'), fullPage: true });

  // Restart: data persists
  await ctx.close();
  ctx = await launch();
  const sw2 = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const stored = await sw2.evaluate(async () => (await chrome.storage.local.get('tabmerge')).tabmerge);
  check(stored?.groups?.length === 2, 'data persisted after browser restart');
  await ctx.close();
} catch (e) {
  console.error(e);
  failures++;
} finally {
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall e2e checks passed');
process.exit(failures ? 1 : 0);
