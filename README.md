# Frosthold: Galecry

A snowy action-RPG vertical slice built for **Safari on iPhone 15**. It also runs in any modern browser. Everything is plain HTML5 canvas and vanilla JS modules, with no build step and no downloaded assets: the art is drawn in code and the sound is synthesized with WebAudio. The world and all names are original.

**Play:** https://ogcheeto.github.io/skyrim-iphone/

![screenshot](screenshot.png)

## Playing on iPhone
1. Open the link above in **Safari**.
2. Rotate the phone to **landscape**.
3. For fullscreen, tap **Share → Add to Home Screen**, then launch *Frosthold* from the icon.
4. Tap **New Journey** and choose *Shieldborn Warrior*, *Rimecaller Mage*, or *Veilstep Rogue*.

The game saves to localStorage on its own: on quest changes, level-ups, and chests, every 30 s, and when the app goes to the background. You can also save manually in **Pack → Character → Save game**. Saves are tied to the device and browser. The home-screen app keeps its storage separate from Safari.

## Controls
| Touch | Keyboard | Action |
|---|---|---|
| Left joystick | WASD / arrows | Move |
| ⚔ Attack (hold) | J / Space | Melee swing (uses stamina) |
| ✦ Spell (hold) | K | Frost bolt (uses magicka; a mage's bolts pierce) |
| ≋ Galecry | L / Q | **Signature shout.** A storm cone that damages, knocks back, and stuns enemies and blows away enemy fire. It has a cooldown. |
| ✋ Use | E | Talk, open chests, take items |
| ⚗ Heal | — | Drink a health potion |
| ☰ Pack | I | Inventory / Journal / Character (save and load) |

## What to try first
1. Talk to **Elder Maren** (purple, with a "!") in Kettleford to start the main quest, *The Ashwing Wakes*.
2. Talk to **Hunter Brannoc** to start the side quest, *Teeth in the Snow*: slay 5 frost wolves.
3. Follow the road north-east (up and right) to the **Barrow of Ostmark**. Fight past the Hollow Wights, take the glowing Galestone, and loot the chests.
4. Bring the stone back to Maren. This **empowers Galecry**: more damage, longer range, and a shorter cooldown.
5. Buy potions from **Ilsa** or sell her your loot. Equip better gear from the Pack.
6. Go south-east to **Cinderhorn Peak** and fight **Vorthrax the Ashwing**. He breathes fans of fire, so use Galecry to blow it away. Below half health he becomes enraged.

Fog of war covers the map and lifts as you explore. A minimap sits in the top right.

## Running locally
```bash
python3 -m http.server 8000   # open http://localhost:8000
node test/core.test.mjs       # logic tests: world reachability, quests, leveling, items, fog, save round-trip
```
`test/smoke.playwright.mjs` is a headless-Chrome smoke test that runs at iPhone 15 landscape size (852×393). It needs `playwright-core`, Chrome, and a server on port 8765.

## Layout
- `index.html`, `style.css`: HUD, touch controls, menus, safe-area insets
- `js/core.js`: pure logic (world generation, classes, loot, quests, XP, save format)
- `js/game.js`: game loop, rendering, combat, AI, input, menus
- `js/audio.js`: procedural WebAudio sound effects
- `manifest.webmanifest`, `icon*`: Add to Home Screen support
