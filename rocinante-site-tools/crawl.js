// Department demo robot: signs in to the demo vessel (M/Y Example, made-up data) as one person per department,
// browses what that person can see (links only: it never presses a button, so nothing is saved, deleted or signed
// out), and photographs every page on a computer and a phone, light and dark, with the position of each link that
// leads to another photographed page.
//
//   node crawl.js <out-dir> [personaId,...] [--discover-only]
//
// Writes <out-dir>/<persona>.json and <out-dir>/<persona>/{c,cd,p,pd}/<n>.webp
//   c = computer light, cd = computer dark, p = phone light, pd = phone dark.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const sharp = require(process.env.SHARP || '/home/user/Rocinante/node_modules/sharp');

const BASE = process.env.BASE || 'http://localhost:3120', PW = 'manual-demo-password-1';
const PERSONAS = [
  { id: 'captain', dept: 'Captain', who: 'Captain', user: 'demo captain', max: 90 },
  { id: 'bridge', dept: 'Bridge', who: 'Chief Officer', user: 'jamie lee', max: 75, home: ['bridge', 'deck'] },
  { id: 'engineering', dept: 'Engineering', who: 'Chief Engineer', user: 'demo chief engineer', max: 75, home: ['engine'] },
  { id: 'deck', dept: 'Deck', who: 'Bosun', user: 'tom becker', max: 70, home: ['deck'] },
  { id: 'interior', dept: 'Interior', who: 'Chief Stewardess', user: 'demo chief stew', max: 70, home: ['interior'] },
];
const COMPUTER = { width: 1280, height: 800, scale: 1, maxH: 2600 };
const PHONE = { width: 390, height: 844, scale: 1.5, maxH: 3600 };

// Never visited: anything that changes data, downloads a file, or leaves the demo.
const SKIP = [/^\/api\//, /^\/logout/, /^\/login/, /^\/setup/, /\/new(\/|$|\?)/, /\/edit(\/|$|\?)/, /\/print/, /\/export/,
  /[?&]dl=/, /\/file(\/|$|\?)/, /\.(pdf|csv|xlsx|docx|png|jpg|webp|zip)(\?|$)/i, /^\/manual/, /^\/privacy/, /^\/about/,
  /^\/confirm/, /^\/admin\/./, /^\/support/, /^\/documents\/drop/, /\/scan(\/|$)/, /^\/assistant\/./, /\/qr(\/|$)/,
  /^\/dashboard\?/, /^\/calendar\?/, /^\/safe\/drop/, /^\/records\/reports/, /^\/paused/, /^\/playbooks/];
// How many pages of one shape (ids replaced) to keep, so lists don't crowd out the menu.
const CAP = [[/^\/(category|department|departments)\/[^/]+$/, 4], [/^\/category\/\*\/system/, 4], [/^\/departments\/\*\?/, 1], [/:id/, 2]];

// Detail pages worth showing, most wanted first.
const IMPORTANT = [/^\/tasks\/:id$/, /^\/category\/[^/]+\/system\/:id$/, /^\/assets\/:id$/, /^\/defects\/:id$/, /^\/schedules\/:id$/,
  /^\/inventory\/:id$/, /^\/rounds\/:id/, /^\/logbook\/[^?]+$/, /^\/sops\/:id$/, /^\/obligations\/:id$/, /^\/handover\/:id/,
  /^\/purchasing\/:id/, /^\/cellar\/:id/, /^\/rotation\/:id/, /^\/incidents\/:id/, /^\/drills\/:id/, /^\/departments\/[^/]+$/,
  /^\/snags\/:id/, /^\/documents\/:id$/, /^\/crew-certificates\/:id/];
const ID = /^(c[a-z0-9]{20,30}|[0-9a-f-]{32,36}|\d+)$/;
const shape = (key) => {
  const [p, q] = key.split('?');
  let s = p.split('/').map((x) => (ID.test(x) ? ':id' : x)).join('/') + (q ? '?' + q.replace(/=[^&]*/g, '') : '');
  // A group page or a department's tab is the same kind of page whichever domain/department it is in.
  if (/^\/(category|departments?)\/[^/?]+[/?]/.test(s)) s = s.replace(/^(\/(category|departments?)\/)[^/?]+/, '$1*');
  return s;
};

/** One page = path + the "tab" it shows; other query strings and #fragments are the same page. */
function keyOf(href) {
  let u;
  try { u = new URL(href, BASE); } catch { return null; }
  if (u.origin !== new URL(BASE).origin) return null;
  const p = u.pathname.replace(/\/+$/, '') || '/';
  const keep = ['tab', 'r', 'dept', 'section'].filter((k) => u.searchParams.has(k)).map((k) => `${k}=${u.searchParams.get(k)}`);
  const key = p + (keep.length ? '?' + keep.join('&') : '');
  return SKIP.some((re) => re.test(key) || re.test(u.pathname + u.search)) ? null : key;
}

const HIDE = '*{caret-color:transparent!important}nextjs-portal{display:none!important}#alarms{display:none!important}' +
  'span[aria-hidden].pointer-events-none.z-50.rounded-md{display:none!important}[data-nextjs-toast]{display:none!important}';

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(300);
}

async function signIn(browser, user, vp, scheme) {
  const phone = vp === PHONE;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale,
    isMobile: phone, hasTouch: phone, reducedMotion: 'reduce', locale: 'en-GB', colorScheme: scheme });
  const page = await ctx.newPage();
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await settle(page);
    await page.getByLabel('Username', { exact: true }).fill(user);
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Sign In' }).click();
    if (await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 }).then(() => true).catch(() => false)) break;
  }
  return { ctx, page };
}

/** Links on the page in reading order, nav first: [{key, x, y, w, h}] in CSS px of the whole page. */
async function links(page) {
  return page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const r = a.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const st = getComputedStyle(a);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
      out.push({ href: a.href, nav: !!a.closest('aside, nav'), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    }
    return out;
  });
}

async function discover(browser, P) {
  const { ctx, page } = await signIn(browser, P.user, COMPUTER, 'light');
  const seen = new Set(), counts = new Map(), pages = [];
  const queue = [{ key: '/dashboard', depth: 0, prio: 0, n: 0 }];
  let order = 1;
  const take = (key) => {
    if (seen.has(key)) return false;
    const s = shape(key);
    const cap = (CAP.find(([re]) => re.test(s)) || [null, Infinity])[1];
    // The person's own department database: every domain, not just a few.
    const own = P.home && P.home.some((d) => key === `/department/${d}` || key.startsWith(`/department/${d}/`));
    if (!own && (counts.get(s) || 0) >= cap) return false;
    counts.set(s, (counts.get(s) || 0) + 1);
    seen.add(key);
    return true;
  };
  take('/dashboard');
  while (queue.length && pages.length < P.max) {
    const { key, depth } = queue.shift();
    const res = await page.goto(BASE + key, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch(() => null);
    await settle(page);
    const landed = keyOf(page.url());
    if (!res || res.status() >= 400 || landed !== key) { console.log(`  - ${key} (${res ? res.status() : 'no answer'}${landed !== key ? ' → ' + landed : ''})`); continue; }
    const title = await page.evaluate(() => (document.querySelector('main h1, h1')?.innerText || document.title).trim().replace(/\s+/g, ' '));
    pages.push({ key, title, depth });
    console.log(`  + ${pages.length} ${key} — ${title}`);
    const found = await links(page);
    // Menu links first (in menu order), then the page's own links.
    const ordered = [...found.filter((l) => l.nav), ...found.filter((l) => !l.nav)];
    for (const l of ordered) {
      const k = keyOf(l.href);
      if (!k || !take(k)) continue;
      // Menu entries first, then the detail pages people open most (a task, a group, a piece of equipment…),
      // then anything else, nearest first.
      const d = l.nav && depth === 0 ? 1 : depth + 1;
      const imp = IMPORTANT.findIndex((re) => re.test(shape(k)));
      queue.push({ key: k, depth: d, prio: d <= 1 ? d : 10 + (imp < 0 ? 50 : imp) + d * 100, n: order++ });
    }
    queue.sort((a, b) => a.prio - b.prio || a.n - b.n);
  }
  await ctx.close();
  return pages;
}

/** How much taller the window must be for nothing on the page to need scrolling (the app scrolls inside panels). */
async function overflow(page) {
  return page.evaluate(() => {
    let extra = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const st = getComputedStyle(el);
      if (!/(auto|scroll)/.test(st.overflowY) || el.clientHeight < 40) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || st.visibility === 'hidden' || st.display === 'none') continue;
      extra = Math.max(extra, el.scrollHeight - el.clientHeight);
    }
    return Math.max(0, Math.ceil(extra));
  });
}

/** Grow the window until the whole page shows (up to vp.maxH), then photograph it. */
async function growAndShoot(page, file, vp, startH, clip) {
  let h = startH || vp.height;
  await page.setViewportSize({ width: vp.width, height: h });
  await settle(page);
  for (let i = 0; i < 4 && h < vp.maxH; i++) {
    const extra = await overflow(page);
    if (extra <= 2) break;
    h = Math.min(h + extra, vp.maxH);
    await page.setViewportSize({ width: vp.width, height: h });
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('body *')) if (el.scrollTop) el.scrollTop = 0; });
  await page.waitForTimeout(150);
  if (clip) h = Math.min(h, await clip(page));
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: vp.width, height: h } });
  let q = 66, buf = await sharp(png).webp({ quality: q, effort: 5 }).toBuffer();
  while (buf.length > 300000 && q > 45) { q -= 9; buf = await sharp(png).webp({ quality: q, effort: 5 }).toBuffer(); }
  fs.writeFileSync(file, buf);
  return { w: vp.width, h, kb: Math.round(buf.length / 1024) };
}
const shoot = (page, file, vp) => growAndShoot(page, file, vp);

async function capture(browser, P, pages, outDir, variant, only) {
  const vp = variant.startsWith('c') ? COMPUTER : PHONE;
  const scheme = variant.endsWith('d') ? 'dark' : 'light';
  const dir = path.join(outDir, P.id, variant);
  fs.mkdirSync(dir, { recursive: true });
  const { ctx, page } = await signIn(browser, P.user, vp, scheme);
  const index = new Map(pages.map((p, i) => [p.key, i]));
  for (const [i, p] of pages.entries()) {
    if (only && !only.includes(i)) continue;
    try {
      await page.goto(BASE + p.key, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.addStyleTag({ content: HIDE });
      const size = await shoot(page, path.join(dir, `${i}.webp`), vp);
      p[variant] = { w: size.w, h: size.h };
      if (!variant.endsWith('d')) {
        // Clickable spots: links to another photographed page, in fractions of the picture.
        const spots = [];
        for (const l of await links(page)) {
          const t = index.get(keyOf(l.href));
          if (t === undefined || t === i || l.y > size.h) continue;
          spots.push([+(l.x / size.w).toFixed(4), +(l.y / size.h).toFixed(4), +(l.w / size.w).toFixed(4), +(Math.min(l.h, size.h - l.y) / size.h).toFixed(4), t]);
        }
        p[variant].spots = spots;
      }
      console.log(`  ${variant} ${i} ${p.key} ${size.w}x${size.h} ${size.kb} KB`);
    } catch (e) {
      console.error(`  ! ${variant} ${i} ${p.key}: ${e.message.split('\n')[0]}`);
    }
  }
  if (vp === PHONE && !only) await phoneMenu(page, P, dir, index, variant);
  await ctx.close();
}

/** The phone's menu (behind the ☰ button) as its own picture, so the phone demo can open it. */
async function phoneMenu(page, P, dir, index, variant) {
  await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: HIDE });
  await settle(page);
  const btn = page.getByRole('button', { name: /menu/i }).first();
  const box = await btn.boundingBox().catch(() => null);
  if (!box) { console.error('  ! no menu button'); return; }
  P.menuButton = [box.x / PHONE.width, box.y, box.width / PHONE.width, box.height]; // y/h in px from the top of the page
  await btn.click();
  await page.waitForTimeout(600);
  // Let the menu show all of its entries.
  // …and stop the picture just below the menu's last entry (Sign Out), not the page behind it.
  const { h } = await growAndShoot(page, path.join(dir, 'menu.webp'), PHONE, PHONE.height, (pg) => pg.evaluate(() => {
    const b = [...document.querySelectorAll('button, a')].find((e) => /^sign out$/i.test(e.innerText.trim()) && e.getBoundingClientRect().height > 0);
    return b ? Math.ceil(b.getBoundingClientRect().bottom + scrollY + 24) : 99999;
  }));
  if (!variant.endsWith('d')) {
    const spots = [];
    for (const l of await links(page)) {
      const t = index.get(keyOf(l.href));
      if (t === undefined || l.y > h) continue;
      spots.push([+(l.x / PHONE.width).toFixed(4), +(l.y / h).toFixed(4), +(l.w / PHONE.width).toFixed(4), +(Math.min(l.h, h - l.y) / h).toFixed(4), t]);
    }
    P.menu = { w: PHONE.width, h, spots };
  }
  console.log(`  ${variant} menu ${PHONE.width}x${h}`);
}

(async () => {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const only = args[1] && !args[1].startsWith('--') ? args[1].split(',') : null;
  const discoverOnly = args.includes('--discover-only');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const P of PERSONAS) {
    if (only && !only.includes(P.id)) continue;
    console.log(`== ${P.id} (${P.who})`);
    const pagesFile = path.join(outDir, `${P.id}.pages.json`);
    const pages = discoverOnly || !fs.existsSync(pagesFile) ? await discover(browser, P) : JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
    fs.writeFileSync(pagesFile, JSON.stringify(pages, null, 1));
    if (discoverOnly) continue;
    // FIX=pd:18,40 re-takes just those pictures of one dark variant (a page that failed to load).
    if (process.env.FIX) {
      const [v, list] = process.env.FIX.split(':');
      await capture(browser, P, pages, outDir, v, list.split(',').map(Number));
      continue;
    }
    for (const v of ['c', 'p', 'cd', 'pd']) await capture(browser, P, pages, outDir, v);
    const out = { id: P.id, dept: P.dept, who: P.who, menu: P.menu, menuButton: P.menuButton,
      pages: pages.map((p) => ({ path: p.key, title: p.title, c: p.c, p: p.p })) };
    fs.writeFileSync(path.join(outDir, `${P.id}.json`), JSON.stringify(out));
  }
  await browser.close();
})();
