// Generates Chrome Web Store images (screenshots + promo tiles) for ja / en.
//
// Usage: npm run store-images   (requires Playwright + Chromium, and openssl)
//
// The screenshots are taken from the REAL extension: demo pages are served locally under
// fictional *.example domains, saved through the toolbar-click handler, then the manager page
// is captured. Output: store/assets/<lang>/*.png (24-bit PNG, no alpha).
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const extDir = resolve(process.argv[2] ?? join(root, 'dist-e2e'));
const outRoot = join(here, 'assets');
const logoB64 = readFileSync(join(root, 'assets/brand/logo-square-512.png')).toString('base64');
const logoSrc = `data:image/png;base64,${logoB64}`;

// ------------------------------------------------------------------ demo content
// Display times of the demo groups (newest first) — must match the labels in mergeDiagram().
const TIMES = ['2026-11-02T10:15:00+09:00', '2026-11-01T21:05:00+09:00', '2026-10-30T19:40:00+09:00'].map(Date.parse);
/** Groups from oldest to newest. The 3rd group re-saves a URL of the 2nd (latest-wins demo). */
const DEMO = {
  ja: {
    names: ['旅行の計画', '', ''],
    groups: [
      [
        ['https://travel.example.com/kyoto/autumn-leaves', '京都 紅葉の名所ガイド 2026'],
        ['https://hotel.example.net/search?city=kyoto&date=2026-11-21', '京都のホテル検索結果（11月21日〜）'],
        ['https://maps.example.org/route/kyoto-station/arashiyama', '京都駅 → 嵐山 ルート案内'],
        ['https://weather.example.com/forecast/kyoto', '京都の週間天気予報'],
      ],
      [
        ['https://docs.example.dev/typescript/handbook/generics', 'TypeScript ハンドブック：ジェネリクス'],
        ['https://docs.example.dev/chrome/extensions/manifest-v3', 'Manifest V3 への移行ガイド'],
        ['https://qa.example.dev/questions/12345/storage-local-quota', 'chrome.storage.local の容量制限について - Q&A'],
        ['https://blog.example.jp/posts/react-19-features', 'React 19 の新機能まとめ'],
        ['https://tracker.example.io/projects/tabmerge/issues/42', '#42 インポート時の重複統合 · Issue Tracker'],
      ],
      [
        ['https://news.example.jp/tech/2026/11/02', '今日のテックニュース 11月2日'],
        ['https://docs.example.dev/chrome/extensions/manifest-v3', 'Manifest V3 への移行ガイド'],
        ['https://shop.example.com/items/mechanical-keyboard-75', 'メカニカルキーボード 75% 配列 - 商品ページ'],
        ['https://video.example.tv/watch?v=a1b2c3', '【解説】Web Locks API 入門'],
        ['https://recipes.example.org/curry/spice-basics', 'スパイスカレーの基本レシピ'],
      ],
    ],
    search: 'ガイド',
    captions: [
      ['ワンクリックで、タブをまとめて保存', 'ツールバーのアイコンを押すだけ。開いているタブを日時ごとのグループに保存して閉じます'],
      ['重複したURLは、最新のグループへ自動で移動', '同じページが何度も保存されて一覧が散らかることはありません'],
      ['すべての保存タブを横断検索', 'タイトルとURLから、入力と同時に絞り込み'],
      ['ダークモード・日本語／英語に対応', 'データはブラウザ内にだけ保存。外部への送信・アカウント登録は不要です'],
    ],
    merge: {
      before: '保存済み', add: '新しく保存', after: '結果',
      moved: '最新のグループへ移動', removed: '古いグループから削除',
    },
    tagline: 'タブをまとめて保存。重複は最新へ。',
    bullets: ['ワンクリックで全タブを保存', '重複URLを最新グループへ統合', 'データはブラウザ内だけに保存'],
  },
  en: {
    names: ['Trip planning', '', ''],
    groups: [
      [
        ['https://travel.example.com/kyoto/autumn-leaves', 'Kyoto Autumn Leaves Guide 2026'],
        ['https://hotel.example.net/search?city=kyoto&date=2026-11-21', 'Hotels in Kyoto (from Nov 21)'],
        ['https://maps.example.org/route/kyoto-station/arashiyama', 'Directions: Kyoto Station → Arashiyama'],
        ['https://weather.example.com/forecast/kyoto', 'Kyoto 7-day weather forecast'],
      ],
      [
        ['https://docs.example.dev/typescript/handbook/generics', 'TypeScript Handbook: Generics'],
        ['https://docs.example.dev/chrome/extensions/manifest-v3', 'Migrating to Manifest V3'],
        ['https://qa.example.dev/questions/12345/storage-local-quota', 'What is the chrome.storage.local quota? - Q&A'],
        ['https://blog.example.jp/posts/react-19-features', "What's new in React 19"],
        ['https://tracker.example.io/projects/tabmerge/issues/42', '#42 Merge duplicates on import · Issue Tracker'],
      ],
      [
        ['https://news.example.jp/tech/2026/11/02', 'Tech news today — Nov 2'],
        ['https://docs.example.dev/chrome/extensions/manifest-v3', 'Migrating to Manifest V3'],
        ['https://shop.example.com/items/mechanical-keyboard-75', '75% Mechanical Keyboard - Product page'],
        ['https://video.example.tv/watch?v=a1b2c3', 'Web Locks API explained'],
        ['https://recipes.example.org/curry/spice-basics', 'Spice curry: the basics'],
      ],
    ],
    search: 'guide',
    captions: [
      ['Save all your tabs in one click', 'Click the toolbar icon to save every tab in the window into a dated group'],
      ['Duplicate URLs move to the newest group', 'Saving the same page again never clutters your list'],
      ['Search across all saved tabs', 'Filter by title and URL as you type'],
      ['Dark mode, Japanese & English', 'Data stays in your browser. No servers, no tracking, no sign-up'],
    ],
    merge: {
      before: 'Saved', add: 'Saved now', after: 'Result',
      moved: 'Moved to the newest group', removed: 'Removed from the older group',
    },
    tagline: 'Save your tabs. Duplicates move to the newest.',
    bullets: ['Save all tabs in one click', 'Duplicate URLs merge into the newest group', 'Data never leaves your browser'],
  },
};
// The English search should hit across groups too.
DEMO.en.groups[0][0][1] = 'Kyoto Autumn Leaves Guide 2026';
DEMO.en.groups[1][1][1] = DEMO.en.groups[2][1][1] = 'Migrating to Manifest V3 — Guide';

// ------------------------------------------------------------------ local https server
const COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#f08c00', '#c2255c', '#0c8599', '#5f3dc4', '#364fc7', '#d6336c'];
const colorFor = (host) => COLORS[[...host].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
const titles = new Map();
for (const d of Object.values(DEMO)) for (const g of d.groups) for (const [u, t] of g) titles.set(`${d === DEMO.ja ? 'ja' : 'en'}|${u}`, t);
let currentLang = 'ja';

function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'tabmerge-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=example',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  const server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    if (req.url === '/favicon.svg') {
      res.setHeader('content-type', 'image/svg+xml');
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${colorFor(host)}"/><text x="16" y="23" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">${host[0].toUpperCase()}</text></svg>`);
      return;
    }
    const title = titles.get(`${currentLang}|https://${host}${req.url}`) ?? host;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><link rel="icon" href="/favicon.svg"><title>${title}</title><h1>${title}</h1>`);
  }).listen(0);
  return { server, port: server.address().port, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ------------------------------------------------------------------ helpers
async function waitFor(fn, timeout = 10_000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FONT = `system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic UI', 'IPAPGothic', sans-serif`;

function framePage(title, sub, inner, dark = false) {
  return `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box} html,body{margin:0;width:1280px;height:800px;overflow:hidden}
    body{font-family:${FONT};background:${dark ? 'linear-gradient(160deg,#0f1b33,#1b2a4d)' : 'linear-gradient(160deg,#e8f1ff,#cfe2ff)'};
      color:${dark ? '#f1f5ff' : '#10233f'};display:flex;flex-direction:column;align-items:center}
    h1{margin:44px 0 8px;font-size:40px;font-weight:800;letter-spacing:.01em}
    p.sub{margin:0 0 30px;font-size:19px;opacity:.8}
    .shot{width:1100px;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(15,40,90,.28);border:1px solid rgba(0,0,0,.08)}
    .shot img{display:block;width:100%}
  </style><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>${inner}`;
}

function mergeDiagram(d) {
  const L = d.groups;
  const row = (u, t, cls = '') => `<li class="${cls}"><i style="background:${colorFor(new URL(u).hostname)}">${new URL(u).hostname[0].toUpperCase()}</i><span>${esc(t)}</span></li>`;
  const card = (label, items, cls = '') => `<div class="card ${cls}"><div class="label">${esc(label)}</div><ul>${items.join('')}</ul></div>`;
  const dup = L[2][1];
  const older = L[1];
  return `<style>
    .flow{display:flex;align-items:center;gap:26px;margin-top:6px}
    .col{display:flex;flex-direction:column;gap:14px;width:360px}
    .head{font-weight:700;font-size:17px;opacity:.75;text-align:center}
    .card{background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(15,40,90,.15);padding:12px 14px;border:2px solid transparent}
    .card.new{border-color:#1a73e8}
    .label{font-size:13px;color:#5f6672;margin-bottom:6px;font-weight:600}
    ul{list-style:none;margin:0;padding:0} li{display:flex;align-items:center;gap:9px;padding:6px 6px;font-size:15px;color:#1c1f24;border-radius:6px}
    li i{flex:none;width:18px;height:18px;border-radius:4px;color:#fff;font:700 12px/18px Arial;text-align:center;font-style:normal}
    li span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    li.hl{background:#e3eeff;outline:2px solid #1a73e8}
    li.gone{opacity:.35;text-decoration:line-through}
    .arrow{font-size:46px;color:#1a73e8;font-weight:800}
    .note{font-size:13px;color:#1a73e8;font-weight:700;margin:2px 6px 0}
    .note.r{color:#c62828}
  </style>
  <div class="flow">
    <div class="col"><div class="head">${esc(d.merge.before)}</div>
      ${card('11/01 21:05', older.map(([u, t]) => row(u, t, u === dup[0] ? 'hl' : '')))}
      <div class="head">＋ ${esc(d.merge.add)}</div>
      ${card('11/02 10:15', L[2].slice(0, 3).map(([u, t]) => row(u, t, u === dup[0] ? 'hl' : '')), 'new')}
    </div>
    <div class="arrow">→</div>
    <div class="col"><div class="head">${esc(d.merge.after)}</div>
      ${card('11/02 10:15', L[2].slice(0, 3).map(([u, t]) => row(u, t, u === dup[0] ? 'hl' : '')), 'new')}
      <div class="note">✓ ${esc(d.merge.moved)}</div>
      ${card('11/01 21:05', older.map(([u, t]) => row(u, t, u === dup[0] ? 'gone' : '')))}
      <div class="note r">✕ ${esc(d.merge.removed)}</div>
    </div>
  </div>`;
}

function promoSmall(d) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:440px;height:280px;overflow:hidden}
    body{font-family:${FONT};background:linear-gradient(150deg,#e9f2ff,#c4dbff);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f2a55}
    img{width:120px;height:120px} h1{margin:6px 0 4px;font-size:40px;font-weight:800}
    p{margin:0;font-size:16px;font-weight:600;opacity:.85}
  </style><img src="${logoSrc}"><h1>TabMerge</h1><p>${esc(d.tagline)}</p>`;
}

function promoMarquee(d, shotB64) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:1400px;height:560px;overflow:hidden}
    body{font-family:${FONT};background:linear-gradient(150deg,#e9f2ff,#bcd6ff);display:flex;align-items:center;color:#0f2a55}
    .text{width:560px;padding-left:80px} .brand{display:flex;align-items:center;gap:18px}
    .brand img{width:110px;height:110px} h1{font-size:58px;margin:0;font-weight:800}
    p.t{font-size:24px;font-weight:700;margin:22px 0 18px}
    ul{margin:0;padding:0;list-style:none;font-size:20px;line-height:1.9} li::before{content:'✓  ';color:#1a73e8;font-weight:800}
    .shot{position:absolute;left:660px;top:70px;width:900px;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(15,40,90,.3)}
    .shot img{display:block;width:100%}
  </style><div class="text"><div class="brand"><img src="${logoSrc}"><h1>TabMerge</h1></div>
  <p class="t">${esc(d.tagline)}</p><ul>${d.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
  <div class="shot"><img src="data:image/png;base64,${shotB64}"></div>`;
}

// ------------------------------------------------------------------ main
async function generate(lang, port) {
  currentLang = lang;
  const d = DEMO[lang];
  const outDir = join(outRoot, lang);
  mkdirSync(outDir, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'tabmerge-store-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    locale: lang === 'ja' ? 'ja-JP' : 'en-US',
    timezoneId: 'Asia/Tokyo', // demo times and diagram labels are JST
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      `--host-resolver-rules=MAP *.example.com 127.0.0.1:${port}, MAP *.example.net 127.0.0.1:${port}, MAP *.example.org 127.0.0.1:${port}, MAP *.example.dev 127.0.0.1:${port}, MAP *.example.jp 127.0.0.1:${port}, MAP *.example.io 127.0.0.1:${port}, MAP *.example.tv 127.0.0.1:${port}`,
      '--ignore-certificate-errors',
      '--no-proxy-server', // demo pages are served locally
    ],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
    await sw.evaluate(async (language) => {
      await chrome.storage.local.set({ tabmerge: { schemaVersion: 1, revision: 1, groups: [], settings: { includePinned: false, removeOnRestore: true, theme: 'light', language } } });
    }, lang);

    for (const urls of d.groups) {
      for (const [u] of urls) {
        const p = await ctx.newPage();
        await p.goto(u);
      }
      await new Promise((r) => setTimeout(r, 800)); // let favicons land in Chrome's cache
      await sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await globalThis.__tabmergeE2E.onActionClicked(tab);
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    // Spread the demo groups over a few days and name the oldest one.
    await sw.evaluate(async ({ times, names }) => {
      const { tabmerge } = await chrome.storage.local.get('tabmerge');
      tabmerge.groups.forEach((g, i) => {
        g.createdAt = times[i];
        g.name = names[names.length - 1 - i] ?? '';
        g.tabs.forEach((t) => (t.savedAt = times[i]));
      });
      tabmerge.revision++;
      await chrome.storage.local.set({ tabmerge });
    }, { times: TIMES, names: d.names });

    const mgr = await waitFor(() => ctx.pages().find((p) => p.url().includes('/manager.html')));
    await mgr.goto(mgr.url().split('?')[0]);
    await mgr.waitForSelector('.tab-row');
    await mgr.waitForTimeout(500);
    const shots = {};
    shots.list = await mgr.screenshot();

    await mgr.fill('input[type=search]', d.search);
    await mgr.waitForTimeout(400);
    shots.search = await mgr.screenshot();
    await mgr.fill('input[type=search]', '');

    await sw.evaluate(async () => {
      const { tabmerge } = await chrome.storage.local.get('tabmerge');
      tabmerge.settings.theme = 'dark';
      tabmerge.revision++;
      await chrome.storage.local.set({ tabmerge });
    });
    await mgr.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await mgr.click('.topbar .button');
    await mgr.waitForTimeout(400);
    shots.dark = await mgr.screenshot();

    // Compose store images.
    const page = await ctx.newPage();
    const save = async (name, html, w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      writeFileSync(join(outDir, name), await page.screenshot({ omitBackground: false }));
    };
    const img = (buf) => `<div class="shot"><img src="data:image/png;base64,${buf.toString('base64')}"></div>`;
    const c = d.captions;
    await save('screenshot-1-save.png', framePage(c[0][0], c[0][1], img(shots.list)), 1280, 800);
    await save('screenshot-2-merge.png', framePage(c[1][0], c[1][1], mergeDiagram(d)), 1280, 800);
    await save('screenshot-3-search.png', framePage(c[2][0], c[2][1], img(shots.search)), 1280, 800);
    await save('screenshot-4-dark.png', framePage(c[3][0], c[3][1], img(shots.dark), true), 1280, 800);
    await save('promo-small-440x280.png', promoSmall(d), 440, 280);
    await save('promo-marquee-1400x560.png', promoMarquee(d, shots.list.toString('base64')), 1400, 560);
    console.log(`${lang}: written to ${outDir}`);
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

const { server, port, cleanup } = startServer();
try {
  for (const lang of ['ja', 'en']) await generate(lang, port);
} finally {
  server.close();
  cleanup();
}
