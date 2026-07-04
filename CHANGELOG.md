# Changelog

All notable changes to **Influence**, newest first. Also published as `changelog.html` on the site, and the latest day's changes appear in the "Latest changes" box on the how-to page.

## 2026-07-04

- **Redesign from a detailed player review** — the game is still meant to be hard; this fixes the *pace* and the *clarity*, not the challenge:
  - **Far fewer nodes (200 → 64), spread wider**: each one is now a real objective you notice and defend, instead of one of eighty you stop caring about.
  - **Anti-snowball — supply lines stretch**: once you already dominate the map, pushing into fresh land costs more per cell, so a lead has to be re-earned instead of steamrolling on its own. Eased off in **Domination** (a deliberate race to 75%).
  - **Stealing a node takes commitment**: cracking a held node now carries a hefty surcharge, so you can't flip it by spiking a single line of cells to its centre — and a node you defend actually holds.
  - **Slower, more deliberate bots**: opponents ease in over the opening, vary how hard they commit, and occasionally hesitate, so they read like players instead of reacting like machines. (Skill is unchanged — hard bots are still hard.)
  - **Calmer, readable opening**: the first drifting barrier is held back, and the menu's live demo is now blurred with the confusing score/timer hidden until you're actually in a game.
  - **Clearer board**: bases have a coloured halo (your own pulses so you can always find it), a big unmissable start countdown, and one-time tips the first time you can afford a farm, outpost or bomb.
  - **Controls & camera**: `Q`/`E` step the commit level without dragging the slider, a **Menu** button quits back to the main menu at any time, and you can zoom out far enough to fit the whole board on screen.
  - **Modes**: all kept, but **Classic** is the default and the rest tuck behind a **"More modes"** toggle, so a first game isn't a wall of choices.
- **Invite codes shortened to 6 characters**: with the optional signaling relay, hosting a friend match now gives a short 6-character code your friend just types in — no more copying long strings back and forth. (The long copy-paste codes still work as a fallback.)

## 2026-07-03

- **Play with friends (P2P multiplayer)**: humans and bots in one match — browsers connect directly to each other over WebRTC, no server, no accounts. The host shares an invite code, friends answer with reply codes, and the host runs the match while friends play live: expanding, walls, farms, outposts and bombs all work for everyone. Works in Classic, Battle Royale, King Of The Hill, Domination and The Zone (teams not yet).
- **New mode — King Of The Hill**: a **golden zone** at the map's center. Own more than half of it and your hold-timer ticks up; **60 cumulative seconds wins**. Getting knocked off pauses your timer instead of resetting it, bots actively fight for the hill, spawns and barriers keep clear of it, and a coloured arc around the ring shows the leader's progress.
- **New mode — Domination**: a race with no clock — the **first player to hold 75% of the map wins**. Everything is turbo-charged: bombs recharge in 5 seconds, farms pay +250 influence, and outposts fire every 6 seconds.
- **Sound**: ambient generative menu music and in-game effects — expanding, bombs, wall placing/cracking/breaking, node and base captures, farms, outposts, zone alarms, round start and win/lose stingers. Everything is synthesized live in the browser (no audio files). Toggle with `M` or the ♪ button; the preference is remembered.
- **Bomb fix**: craters now stay **scorched for 10 seconds** — the burning ground is visible on the map, and the player you bombed can't flood back in while it burns (you and your teammates can). Previously the victim usually re-took the crater within a second or two, which made every bomb after the first feel like it did nothing.
- The changelog got a page of its own (`changelog.html`), so the "Full changelog" link works the same everywhere the game is hosted.

## 2026-07-02

- **New mode — The Zone**: a circular map that collapses in 5 phases (2 minutes each) toward a **random** point. A red warning ring appears 20 seconds before each collapse, on the map and minimap. Crushed ground is destroyed — land, walls, buildings, and **nodes**, which take their income and cap with them. After the fifth collapse, a 60-second final countdown decides the winner by territory.
- **New modes — Teams 2v2 & 3v3**: bot allies share your colour against a matched enemy team. No friendly fire — expansion, bombs and outposts all spare teammates — and ally nodes/outposts extend your supply range. Most combined ground wins; the results screen shows team totals.
- **New tool — Bomb (250)**: an aimed strike on a 25-second cooldown that blasts a neutral crater out of enemy territory anywhere within supply range (cells, walls and buildings — nodes survive). Outposts extend its reach. The aiming reticle shows valid (orange) and invalid (red) targets.
- **Bot difficulty selector**: Easy / Normal / Hard on the start screen. Harder bots act faster, commit more influence, and build farms and outposts of their own.
- **Hotkeys**: `1` Wall · `2` Farm · `3` Outpost · `4` Bomb (Ctrl+click still paints walls).
- **Walls reworked**: build for 20, with **25 durability**. Attacks that can't afford a full break now chip the wall instead of bouncing off, and the damage shows as growing **cracks**. Hovering a wall shows its remaining durability.
- **Renames**: mode "Timed" → **"Classic"**; tool "Bombard" → **"Bomb"**.
- **How-to page rebuilt**: categorized accordions with an illustrated step-by-step tutorial for every mode and every tool (7 new screenshots).
- **README redesigned**: pixel-art banner, badges, screenshot gallery and tables.

## 2026-07-01

- **Barriers**: impassable rock walls carve up the map, so expansion has to route around them — no more sniping straight across open ground at a distant node or player. New barriers keep forming mid-round.
- **Farms buffed**: cost 400 (was 500), pay +120 influence every 15s (was +100 / 30s), and each farm raises your influence cap.
- **Outposts buffed**: fire every 12s (was 20s) claiming up to 40 cells (was 30), prefer enemy land, leave a defended beachhead, soften nearby enemy entrenchment, and act as a forward supply point you can expand from.
- **Random spawns**: players and bots now spawn genuinely scattered (only a minimum safe spacing is enforced) instead of being pushed into a predictable, evenly-spread pattern.
- **Code split**: the single-file game was split into `influence.html` / `influence.css` / `influence.js`.
- **Docs fixes**: corrected the influence bar's location, the outpost splash shape, and the spawn restrictions on the how-to page.
- **Bigger map**: the field was enlarged to 440×300 cells with 200 nodes.
- **Initial release**: Influence (formerly "territory") published — territory-painting gameplay, nodes and bases, walls, farms and outposts, Timed and Battle-royale modes, landing page and README.
