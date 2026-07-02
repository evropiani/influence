# Changelog

All notable changes to **Influence**, newest first. The latest day's changes are also shown in the "Last changes" box on the [How to Play page](https://evropiani.github.io/influence/).

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
