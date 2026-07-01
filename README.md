# Influence

A fast, browser-based territory game inspired by titles like territorial.io — claim land, capture nodes, and outgrow everyone else before the clock runs out (or wipe them all off the map in battle royale).

**[Play it here](https://evropiani.github.io/influence/)**

## How it works

Spend **influence** to claim cells one-for-one. Tap or click toward where you want to grow, and your nearest border pushes in that direction. Empty land is cheap; enemy land costs more, and the longer it's been held the tougher it gets — fresh ground is bright, dug-in territory is dark.

Capture **nodes** scattered across the map for income, a bigger influence cap, and supply range. Guard your **base** (shown as a star) — lose it and your income drops until you rebuild on a fully entrenched node.

### Buildables

Spend influence on structures inside your own territory:

- **Walls** — 20 influence per cell. Hold `Ctrl` and click (or toggle the Wall button on mobile) to paint them. Enemies pay an extra 15 to break through.
- **Farms** — 400 influence, pay out +120 influence every 15 seconds and raise your influence cap.
- **Outposts** — 300 influence. Every 12 seconds they claim up to 40 cells around them, favouring enemy land, leaving a defended beachhead, and softening nearby enemy entrenchment. They also act as a forward supply point you can expand cheaply from.

### Modes

- **Timed** — most territory when the clock runs out wins.
- **Battle royale** — no timer, last one standing wins.

The map is carved up by impassable **rock barriers** — expansion routes around them, so you can't snipe straight across open ground at a distant node or rival. Fresh barriers also form during the round, so choke points shift over time.

Each round opens with a short **spawn phase** where you pick your starting location before the map goes live.

## Controls

| | PC | Mobile |
|---|---|---|
| Grow territory | Click toward target | Tap toward target |
| Pan | Drag | One-finger drag |
| Zoom | Mouse wheel | Pinch |
| Paint walls | `Ctrl` + click | Wall button, then tap |
| Jump | Click minimap | Tap minimap |

## Project structure

```
.
├── index.html      # landing page / how-to-play
├── influence.html  # game markup
├── influence.css   # game styles
├── influence.js    # game logic
└── favicon.svg
```

Everything is self-contained vanilla HTML, CSS, and JavaScript — no build step, no dependencies, no framework. Open `influence.html` directly in a browser or serve the folder statically.

## Running locally

Just open the files, or serve them with any static server, e.g.:

```
npx serve .
```

## Deployment

Hosted via GitHub Pages directly from this repo. Pushing to the default branch updates the live site.

## Tuning

Game balance lives in a single `CONFIG` object at the top of `influence.js` — map size (`COLS`/`ROWS`), node count, round length, income rates, structure costs, and so on. Adjust and reload, no build step required.

## Feedback

This is an active beta — bugs, ideas, and balance feedback are welcome. Reach out on Discord: [@evropiani](https://discord.com/users/319246364246540288/)
