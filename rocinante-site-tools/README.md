# Re-taking the Rocinante demo screens

`rocinante-site/` is the static Rocinante marketing site and click-through demo (a second
Cloudflare Pages project, build output directory `rocinante-site`). Its screens come from
Rocinante's User Manual demo vessel, **M/Y Example**: every name and figure is invented.

1. In a Rocinante checkout: `npm run manual:seed`, then `npm run manual:dev` (http://localhost:3120).
2. Edit `tours.json` here (each step: who signs in, the page, clicks before the picture, the
   spot to highlight, and the caption).
3. `node capture-tours.js tours.json out` (Playwright; set the `sharp` path at the top to the
   Rocinante checkout's `node_modules/sharp`).
4. Copy `out/img/*.webp` to `rocinante-site/img/` and turn `out/tours.json` into
   `rocinante-site/assets/tours.js` (`window.TOURS = [...]`, the `tours` array).
