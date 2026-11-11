// Capture the Rocinante demo tours from the User Manual's demo vessel (M/Y Example, made-up data).
// node capture-tours.js <tours.json> <out-dir> [tourId]
// Writes <out-dir>/img/<shot>.webp and <out-dir>/tours.js (the tour data with image sizes and hotspot boxes).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const sharp = require('/home/user/Rocinante/node_modules/sharp');
const BASE = 'http://localhost:3120', PW = 'manual-demo-password-1';
const VP = { computer: { width: 1280, height: 800, scale: 1.5 }, phone: { width: 390, height: 844, scale: 2, mobile: true } };

const [specFile, outDir, only] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
fs.mkdirSync(path.join(outDir, 'img'), { recursive: true });

const locate = (page, t) => {
  if (t.role) return page.getByRole(t.role, { name: t.name, exact: !!t.exact }).first();
  if (t.label) return page.getByLabel(t.label).first();
  if (t.text) return page.getByText(t.text).first();
  return page.locator(t.css).first();
};
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
}
async function step(page, s) {
  if (s.click) await locate(page, s.click).click();
  else if (s.fill) await locate(page, s.fill).fill(s.value);
  else if (s.waitFor) await page.waitForFunction((t) => document.body.innerText.includes(t), s.waitFor, { timeout: 30000 });
  await settle(page);
}

const contexts = new Map();
async function contextFor(browser, as, vpName, custom) {
  const v = VP[vpName];
  const size = custom || { width: v.width, height: v.height };
  const key = `${as}|${vpName}|${size.width}x${size.height}`;
  if (contexts.has(key)) return contexts.get(key);
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: v.scale, isMobile: !!v.mobile, hasTouch: !!v.mobile,
    reducedMotion: 'reduce', locale: 'en-GB', colorScheme: 'light' });
  const page = await ctx.newPage();
  for (let i = 0; i < 2; i++) {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await settle(page);
    await page.getByLabel('Username', { exact: true }).fill(as);
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Sign In' }).click();
    if (await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).then(() => true).catch(() => false)) break;
  }
  await page.close();
  contexts.set(key, ctx);
  return ctx;
}

(async () => {
  const browser = await chromium.launch();
  const result = { tours: [] };
  for (const tour of spec.tours) {
    if (only && tour.id !== only) continue;
    const out = { ...tour, steps: [] };
    for (const s of tour.steps) {
      const vpName = tour.viewport || 'computer';
      const ctx = await contextFor(browser, s.as, vpName, s.viewport);
      const page = await ctx.newPage();
      let hot = null, ok = true;
      try {
        await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await settle(page);
        for (const p of s.pre || []) await step(page, p);
        await page.addStyleTag({ content: '*{caret-color:transparent!important}nextjs-portal{display:none!important}span[aria-hidden].pointer-events-none.z-50.rounded-md{display:none!important}#alarms{display:none!important}' });
        if (s.hotspot) {
          const el = locate(page, s.hotspot);
          await el.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(300);
          const box = await el.boundingBox().catch(() => null);
          const vs = page.viewportSize();
          if (box && box.width > 0 && box.y >= 0 && box.y + box.height <= vs.height) {
            hot = { x: box.x / vs.width, y: box.y / vs.height, w: box.width / vs.width, h: box.height / vs.height };
          } else console.warn(`  ! ${s.shot}: hotspot not on screen`);
        }
        const png = await page.screenshot();
        const meta = await sharp(png).metadata();
        let q = 80, buf = await sharp(png).webp({ quality: q, effort: 5 }).toBuffer();
        while (buf.length > 260000 && q > 50) { q -= 8; buf = await sharp(png).webp({ quality: q, effort: 5 }).toBuffer(); }
        fs.writeFileSync(path.join(outDir, 'img', `${s.shot}.webp`), buf);
        out.steps.push({ shot: s.shot, title: s.title, text: s.text, w: meta.width, h: meta.height, hotspot: hot });
        console.log(`✓ ${tour.id}/${s.shot} ${meta.width}x${meta.height} ${(buf.length / 1024).toFixed(0)} KB${hot ? ' +hotspot' : ''}`);
      } catch (e) {
        ok = false;
        console.error(`✗ ${tour.id}/${s.shot}: ${e.message.split('\n')[0]}`);
      } finally { await page.close(); }
    }
    result.tours.push(out);
  }
  fs.writeFileSync(path.join(outDir, only ? `tours-${only}.json` : 'tours.json'), JSON.stringify(result, null, 1));
  await browser.close();
})();
