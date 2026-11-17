# EMBERHOLD — Last Lantern

[![best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/KuntoSadewo/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/KuntoSadewo/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01)

An original top-down arena survival shooter, built for the
[best-game-01](https://make.fun/bounty/best-game-01) bounty on make.fun.

The dark has swallowed the valley. You hold the last lantern. Survive all
10 waves of shadow — wisps, skitters, spitters, brutes and splitters — slay
the Gloom Herald on waves 5 and 10, and pick 1 of 3 lantern blessings after
every cleared wave to shape your build.

## Play

Serve `game/` with any static server (or `node serve.ts`) and open
`http://localhost:8080` in desktop Chrome. No network request, no build step.

- **WASD / arrows** — move
- **Mouse** — aim, **hold click** — fire
- **SPACE** — dash (brief invulnerability)
- **P** — pause, **M** — mute, **R** — restart after game over / victory

## The game

- 10 escalating waves, 5 enemy kinds + a boss with radial bursts, summons and a charge attack
- Between-wave upgrade draft: 10 blessings (damage, fire rate, multishot, speed, max HP, magnet, regen, bullet speed, dash recharge, score)
- Pickups: embers (score), hearts (heal), shield orbs (block one hit)
- Particles, screen shake, floating score text, synthesised WebAudio sound (no audio files)
- HUD: HP, score, wave, embers, dash cooldown, boss bar; best score kept in localStorage
- Title, upgrade, pause, game-over and victory screens, each with a restart

## Layout

- `game/` — the playable game: `index.html`, `css/style.css`, `js/` (`main.js` loop & phases, `entities.js` player/enemies/bullets/pickups, `waves.js` wave table & upgrades, `render.js` all drawing, `audio.js` WebAudio synth, `util.js` helpers)
- `screenshots/` — real renders of the game (deterministic `?shot=` scenes)
- `main.ts` — hands the game in: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

MIT licensed. (c) 2026 KuntoSadewo.
