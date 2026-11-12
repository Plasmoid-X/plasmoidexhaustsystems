# Re-taking the Rocinante demo

`rocinante-site/` is the static Rocinante marketing site and click-through demo (a second
Cloudflare Pages project, build output directory `rocinante-site`). Its screens come from
Rocinante's User Manual demo vessel, **M/Y Example**: every name and figure is invented.

The demo (`rocinante-site/demo.html` + `assets/demo.js`) lets a visitor pick a department and
click around pictures of the real app as that person:

| Department  | Signed in as      | Demo account |
|-------------|-------------------|--------------|
| Captain     | Captain           | Demo Captain |
| Bridge      | Chief Officer     | Jamie Lee (+ Read & write on the Bridge, from `prepare.sql`) |
| Engineering | Chief Engineer    | Demo Chief Engineer |
| Deck        | Bosun             | Tom Becker |
| Interior    | Chief Stewardess  | Demo Chief Stew |

## Steps

1. In a Rocinante checkout: `npm run manual:seed` (fresh dates), then apply `prepare.sql` to
   the `pms_manual` database (`psql <url>/pms_manual -f prepare.sql`), then `npm run manual:dev`
   (http://localhost:3120).
2. `node crawl.js out` (Playwright; `SHARP=<rocinante>/node_modules/sharp` if it isn't at
   `/home/user/Rocinante`). For each person it first maps the pages (`out/<id>.pages.json`:
   the menu first, then the detail pages people open most, capped per kind), then photographs
   each on a computer and a phone, light and dark, recording where every link to another
   photographed page sits. It only follows links and never presses a button, so nothing is
   saved, deleted or signed out. Delete `out/<id>.pages.json` to map that person again.
   `node crawl.js out deck` does one person; `--discover-only` only maps.
3. Copy `out/<id>.json` and `out/<id>/` into `rocinante-site/demo/`.
