# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
All of these, equally (owner, 16 Nov 2026): chief engineers and captains who run the engine room and recommend
equipment; yacht owners and their representatives who pay for a refit; management companies and yards who specify
refits across vessels. They arrive from a referral or a search, usually on a phone or a bridge/office computer, and
decide whether to send an enquiry.

## Product Purpose
Plasmoid X (PLASMOID X LTD, UK) sells a retrofit for yacht diesel engines. It treats the intake air before combustion
instead of cleaning the exhaust after it. The site's job is to make that idea understood and get an enquiry by email
(the enquiry form). Success = a qualified enquiry.

## Positioning
Every other system (SCR, diesel particulate filters) works on the exhaust after combustion. Plasmoid X works on the air
going in: no filter media to clog, no chemicals to dose, and it connects to the exhaust runs the vessel already has.

## Operating Context
How the system works (owner's description):
1. Air in: fresh air is drawn into the system instead of going straight into the turbo.
2. Ionizer: the air bubbles through water under UV light, which turns it into plasmoids; filters keep the water out of
   the engine.
3. Vajra: two linked stainless spheres. The plasmoid air spirals down through the inner chamber around a sealed
   stainless core sphere in each one (tornado-like swirl).
4. Counter-flow heat exchange: hot exhaust spirals the opposite way (upwards) through the thin-walled outer chamber and
   around the neck, warming the plasmoids through the wall.
5. Into the engine: the warmed plasmoids feed the turbo inlet.
6. Exhaust out: the exhaust leaves through the outer chamber, cooler, and out of the boat.
It works better at higher loads. Process: initial meeting, site visit and 3D scan of the engine room, design and
drawings in house, approval, scheduling in the vessel's downtime, installation and handover. One quoted price covers
the complete retrofit; Plasmoid X oversees every installation.

## Capabilities and Constraints
- Static site: plain HTML/CSS/JS in `public/`, hosted on Cloudflare Pages (production branch `main`, live at
  plasmoidx.co.uk). No build step.
- Enquiries only by the form (Web3Forms); the owner handles them by email.
- Never use "aboard": "on board", two words.
- No "trial", "in development" or "unfinished" wording (owner).
- Claims stay as "designed to" until measured figures are supplied.

## Brand Commitments
- Name PLASMOID X; ring-and-dot mark; phthalocyanine-green palette (dark green #123524, teal #2d848a, blue-green,
  uranian blue).
- In drawings of the system: intake air / plasmoids are blue, exhaust is red/orange.
- Founder: Ricardo Negri, 13 years as an engineer on sailing and motor yachts (photo `public/assets/img/ricardo-negri.webp`).
- Sister product: Rocinante (rocinante.plasmoidx.co.uk), planned maintenance for yachts.

## Evidence on Hand
- Test evidence reviewed with the owner on 16 Nov 2026 (the owner's own summary of every test held). No diesel test
  with a released same-engine baseline exists yet; an independent diesel baseline has been taken and its results are
  awaited. The accredited laboratory results that exist are on small petrol engines and are mixed (fuel use and CO
  down, NOx up). Until a diesel result with a baseline exists: no numbers on the site, no claim that the system
  lowers NOx, and "designed to" wording only. The owner's position is that the system is a substitute for existing
  emission equipment; the site neither claims nor denies that, and says only that changes to certified emission
  equipment need flag or class approval (agreed 17 Nov 2026).
- The owner's CAD model of the Vajra (STEP, 17 Nov 2026) set the 3D model's dimensions: 12 in outer spheres, 8 in inner
  chambers, 4 in sealed cores, centres 426.29 mm apart, 1.65 mm walls, 4 in exhaust ports and 73 mm air ports set
  off-centre so both flows enter on a tangent. The numbers are at the top of `public/assets/js/vajra.js`; the CAD file
  itself is not kept in the repository. Flanges, bolts and weld seams on the site's model are not in the CAD. The
  ionizer has not been drawn yet.
- No customer names, testimonials or installation photos exist; never invent them.

## Product Principles
1. Show the mechanism; it is the one thing no competitor has.
2. Engineer to engineer: plain, specific, nothing that can't be stood behind.
3. One action: enquire.
4. The vessel's time matters: fit, yard time and upkeep are answered early.
