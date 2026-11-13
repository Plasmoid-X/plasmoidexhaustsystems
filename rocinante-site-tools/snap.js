// Department demo robot (2): signs in to the demo vessel (M/Y Example, made-up data) as one person per department,
// browses what that person can see (links only: it never presses a button, so nothing is saved, deleted or signed
// out), and keeps a copy of each page as it was drawn: the real HTML and the app's own stylesheets, without its
// scripts. The copies are real pages, so they are sharp, scroll, fit a phone or a computer, and switch light/dark.
//
//   node snap.js <out-dir> [personaId,...]
//
// Writes <out-dir>/<persona>/<n>.html, <out-dir>/<persona>.json (the page list) and <out-dir>/_a/ (stylesheets,
// fonts and pictures, named by their content).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const BASE = process.env.BASE || 'http://localhost:3120', PW = 'manual-demo-password-1';
const PERSONAS = [
  { id: 'captain', dept: 'Captain', who: 'Captain', user: 'demo captain', max: 170 },
  { id: 'bridge', dept: 'Bridge', who: 'Chief Officer', user: 'jamie lee', max: 150, home: ['bridge', 'deck'] },
  { id: 'engineering', dept: 'Engineering', who: 'Chief Engineer', user: 'demo chief engineer', max: 160, home: ['engine'] },
  { id: 'deck', dept: 'Deck', who: 'Bosun', user: 'tom becker', max: 140, home: ['deck'] },
  { id: 'interior', dept: 'Interior', who: 'Chief Stewardess', user: 'demo chief stew', max: 140, home: ['interior'] },
];

// Never visited: anything that changes data, downloads a file, or leaves the demo.
const SKIP = [/^\/api\//, /^\/logout/, /^\/login/, /^\/setup/, /\/new(\/|$|\?)/, /\/edit(\/|$|\?)/, /\/print/, /\/export/,
  /[?&]dl=/, /\/file(\/|$|\?)/, /\.(pdf|csv|xlsx|docx|png|jpg|webp|zip)(\?|$)/i, /^\/manual/, /^\/privacy/, /^\/about/,
  /^\/confirm/, /^\/admin\/./, /^\/support/, /^\/documents\/drop/, /\/scan(\/|$)/, /^\/assistant\/./, /\/qr(\/|$)/,
  /^\/safe\/drop/, /^\/records\/reports/, /^\/playbooks/];
// Query-string keys that don't make a different page.
const NOISE = new Set(['msg', 'err', 'back', 'next', 'from', 'returnTo', 'return', 'sort', 'dir', 'order', 'page', 'cols', 'q', 'cal', 'saved']);
const ID = /^(c[a-z0-9]{20,30}|[0-9a-f-]{32,36}|\d+|\d{4}-\d{2}(-\d{2})?)$/;
const shape = (key) => {
  const [p, q] = key.split('?');
  let s = p.split('/').map((x) => (ID.test(x) ? ':id' : x)).join('/') + (q ? '?' + q.replace(/=[^&]*/g, '') : '');
  if (/^\/(category|departments?)\/[^/?]+[/?]/.test(s)) s = s.replace(/^(\/(category|departments?)\/)[^/?]+/, '$1*');
  return s;
};
// How many pages of one shape to keep, so one list doesn't crowd out the rest.
const CAP = [[/^\/(category|department|departments)\/[^/]+$/, 6], [/^\/category\/\*\/system\/:id$/, 8], [/^\/category\/\*\/system\/:id\?/, 6],
  [/^\/departments\/\*\?/, 7], [/^\/tasks\/:id$/, 5], [/^\/assets\/:id$/, 4], [/:id.*\?/, 3], [/:id/, 3], [/\?/, 7]];
// Detail pages worth showing, most wanted first.
const IMPORTANT = [/^\/tasks\/:id$/, /^\/category\/\*\/system\/:id$/, /^\/assets\/:id$/, /^\/defects\/:id$/, /^\/schedules\/:id$/,
  /^\/inventory\/:id$/, /^\/rounds\/:id/, /^\/logbook\/[^?]+$/, /^\/sops\/:id$/, /^\/obligations\/:id$/, /^\/handover\/:id/,
  /^\/purchasing\/:id/, /^\/cellar\/:id/, /^\/rotation\/:id/, /^\/incidents\/:id/, /^\/drills\/:id/, /^\/departments\/[^/]+$/,
  /^\/snags\/:id/, /^\/documents\/:id$/, /^\/crew-certificates\/:id/];

/** One page = its path and the query keys that change what it shows. */
function keyOf(href) {
  let u;
  try { u = new URL(href, BASE); } catch { return null; }
  if (u.origin !== new URL(BASE).origin) return null;
  const p = u.pathname.replace(/\/+$/, '') || '/';
  const keep = [...u.searchParams.entries()].filter(([k, v]) => !NOISE.has(k) && v !== '').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`);
  const key = p + (keep.length ? '?' + keep.join('&') : '');
  return SKIP.some((re) => re.test(key) || re.test(u.pathname + u.search)) ? null : key;
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(250);
}

async function signIn(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'en-GB', colorScheme: 'light' });
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

/** In the page: freeze it into plain HTML. Links become demo-go:<their address>; scripts go. */
function freeze() {
  const doc = document;
  // What the person would see in form controls.
  for (const el of doc.querySelectorAll('input')) {
    if (el.type === 'checkbox' || el.type === 'radio') el.toggleAttribute('checked', el.checked);
    else if (el.type !== 'password' && el.type !== 'file' && el.type !== 'hidden') el.setAttribute('value', el.value);
  }
  for (const el of doc.querySelectorAll('textarea')) el.textContent = el.value;
  for (const el of doc.querySelectorAll('select')) for (const o of el.options) o.toggleAttribute('selected', o.selected);
  for (const c of doc.querySelectorAll('canvas')) {
    try { const i = doc.createElement('img'); i.src = c.toDataURL('image/png'); i.className = c.className; i.style.cssText = c.style.cssText; i.width = c.clientWidth; i.height = c.clientHeight; i.alt = ''; c.replaceWith(i); } catch {}
  }
  const links = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const r = a.getBoundingClientRect();
    links.push({ href: a.href, nav: !!a.closest('aside, nav'), shown: r.width > 3 && r.height > 3 });
    a.setAttribute('href', 'demo-go:' + encodeURIComponent(a.href));
  }
  const css = [];
  for (const l of doc.querySelectorAll('link[rel="stylesheet"]')) { css.push(l.href); l.setAttribute('href', 'demo-css:' + encodeURIComponent(l.href)); }
  const imgs = [];
  for (const i of doc.querySelectorAll('img[src]')) {
    if (i.src.startsWith('data:')) continue;
    imgs.push(i.currentSrc || i.src);
    i.setAttribute('src', 'demo-img:' + encodeURIComponent(i.currentSrc || i.src));
    i.removeAttribute('srcset'); i.removeAttribute('loading'); i.removeAttribute('decoding');
  }
  for (const el of doc.querySelectorAll('script, noscript, template, nextjs-portal, next-route-announcer, link:not([rel="stylesheet"]), meta:not([charset]):not([name="viewport"]), [data-nextjs-toast], #alarms')) el.remove();
  for (const el of doc.querySelectorAll('form')) { el.removeAttribute('action'); }
  for (const el of doc.querySelectorAll('[inert]')) el.removeAttribute('inert');
  // Comments (React's markers) are only weight.
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
  const dead = []; while (walker.nextNode()) dead.push(walker.currentNode);
  for (const c of dead) c.remove();
  const title = (doc.querySelector('main h1, h1')?.innerText || doc.title).trim().replace(/\s+/g, ' ');
  return { html: '<!doctype html>\n' + doc.documentElement.outerHTML, links, css, imgs, title };
}

const assets = new Map(); // source url -> file name in _a/
async function asset(ctx, outDir, url, kind) {
  if (assets.has(url)) return assets.get(url);
  let name = null;
  try {
    const res = await ctx.request.get(url, { timeout: 60000 });
    if (res.ok()) {
      let body = await res.body();
      const type = (res.headers()['content-type'] || '').split(';')[0];
      let ext = kind === 'css' ? 'css' : ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'font/woff2': 'woff2', 'font/woff': 'woff', 'image/avif': 'avif' }[type] || (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [, 'bin'])[1]);
      if (kind === 'css') {
        let text = body.toString('utf8').replace(/\/\*# sourceMappingURL=[^*]*\*\//g, '');
        const urls = [...new Set([...text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]).filter((u) => !u.startsWith('data:') && !u.startsWith('#')))];
        for (const u of urls) {
          const f = await asset(ctx, outDir, new URL(u, url).href, 'file');
          if (f) text = text.split(u).join(f);
        }
        body = Buffer.from(text);
      }
      name = crypto.createHash('sha1').update(body).digest('hex').slice(0, 12) + '.' + ext;
      fs.writeFileSync(path.join(outDir, '_a', name), body);
    }
  } catch {}
  assets.set(url, name);
  return name;
}

async function crawl(browser, P, outDir) {
  const { ctx, page } = await signIn(browser, P.user);
  const dir = path.join(outDir, P.id);
  fs.mkdirSync(dir, { recursive: true });
  const seen = new Set(), counts = new Map(), pages = [];
  let order = 1;
  const queue = [{ key: '/dashboard', depth: 0, prio: 0, n: 0 }];
  const take = (key) => {
    if (seen.has(key)) return false;
    const s = shape(key);
    const cap = (CAP.find(([re]) => re.test(s)) || [null, Infinity])[1];
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
    await page.evaluate(() => { window.scrollTo(0, 0); });
    const snap = await page.evaluate(freeze);
    let html = snap.html;
    for (const u of new Set(snap.css)) { const f = await asset(ctx, outDir, u, 'css'); html = html.split('demo-css:' + encodeURIComponent(u)).join(f ? `../_a/${f}` : ''); }
    for (const u of new Set(snap.imgs)) { const f = await asset(ctx, outDir, u, 'file'); html = html.split('demo-img:' + encodeURIComponent(u)).join(f ? `../_a/${f}` : ''); }
    const n = pages.length;
    pages.push({ key, title: snap.title, depth, html });
    console.log(`  + ${n} ${key} — ${snap.title} (${Math.round(html.length / 1024)} KB)`);
    const ordered = [...snap.links.filter((l) => l.nav), ...snap.links.filter((l) => !l.nav)];
    for (const l of ordered) {
      const k = keyOf(l.href);
      if (!k || !l.shown || !take(k)) continue;
      const d = l.nav && depth === 0 ? 1 : depth + 1;
      const imp = IMPORTANT.findIndex((re) => re.test(shape(k)));
      // The menu, then a list's own tabs and filters, then the detail pages people open most, then the rest.
      const sameList = k.split('?')[0] === key.split('?')[0] && depth <= 1;
      queue.push({ key: k, depth: d, prio: d <= 1 ? d : sameList ? 5 : 10 + (imp < 0 ? 50 : imp) + d * 100, n: order++ });
    }
    queue.sort((a, b) => a.prio - b.prio || a.n - b.n);
  }
  await ctx.close();
  // Point each link at its copy; a link to a page that wasn't copied is marked, not followed.
  const index = new Map(pages.map((p, i) => [p.key, i]));
  for (const [i, p] of pages.entries()) {
    const html = p.html.replace(/href="demo-go:([^"]*)"/g, (_, enc) => {
      const url = decodeURIComponent(enc.replace(/&amp;/g, '&'));
      const t = index.get(keyOf(url));
      if (t !== undefined) return `href="${t}.html"`;
      let ext = false; try { ext = new URL(url).origin !== new URL(BASE).origin; } catch {}
      return ext ? 'href="#" data-demo="out"' : 'href="#" data-demo="none"';
    }).replace('</head>', `<link rel="stylesheet" href="../frame.css"><script>window.DEMO=${JSON.stringify({ who: P.id, n: i, path: p.key, title: p.title })}</script><script src="../frame.js"></script></head>`);
    fs.writeFileSync(path.join(dir, `${i}.html`), html);
  }
  fs.writeFileSync(path.join(outDir, `${P.id}.json`), JSON.stringify({ id: P.id, dept: P.dept, who: P.who, pages: pages.map((p) => ({ path: p.key, title: p.title })) }));
  console.log(`== ${P.id}: ${pages.length} pages`);
}

(async () => {
  const [outDir, only] = process.argv.slice(2);
  fs.mkdirSync(path.join(outDir, '_a'), { recursive: true });
  const browser = await chromium.launch();
  for (const P of PERSONAS) {
    if (only && !only.split(',').includes(P.id)) continue;
    if (process.env.MAX) P.max = Number(process.env.MAX);
    console.log(`== ${P.id} (${P.who})`);
    await crawl(browser, P, outDir);
  }
  await browser.close();
})();
