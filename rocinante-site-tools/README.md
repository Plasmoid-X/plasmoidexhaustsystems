# Re-taking the Rocinante demo

`rocinante-site/` is the static Rocinante marketing site and click-through demo (a second
Cloudflare Pages project, build output directory `rocinante-site`). Its screens come from
Rocinante's User Manual demo vessel, **M/Y Example**: every name and figure is invented.

The demo (`rocinante-site/demo.html` + `assets/demo.js`) lets a visitor pick a department and
use copies of the app's real screens as that person. Each copy is the page's real HTML with the
app's own stylesheets and no scripts, shown in a frame: so it is sharp, scrolls, fits a computer
or a phone, and switches light/dark. `demo/frame.js` runs inside each copy (theme, the phone
menu, a note when a button is pressed).

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
2. `node snap.js out` (Playwright). For each person it starts at the dashboard and follows
   links: the menu first, then each list's tabs and filters, then the detail pages people open
   most, capped per kind of page. It only follows links and never presses a button, so nothing
   is saved, deleted or signed out. `node snap.js out deck` does one person.
3. Replace `rocinante-site/demo/<id>/`, `demo/<id>.json` and `demo/_a/` with the ones in `out/`
   (keep `demo/frame.js` and `demo/frame.css`).
