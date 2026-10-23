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

## Audio

All sound is generated in real time with WebAudio. The game ships no audio files.

- **Ambience:** wind made from filtered noise, with gusts that vary by region. They are calm in Kettleford and strongest on Cinderhorn Peak. Near the dragon's lair an ash and fire rumble fades in. The wind drops inside the ruins.
- **Combat music:** a slow taiko and war-drum loop. It fades in when enemies are engaged or within reach, and fades out about 4 s after a fight ends. The dragon fight crossfades to a faster, denser variant.
- **Mix:** separate SFX, music, and ambience buses feed a master gain and a limiter, so nothing clips. Music sits under the SFX.
- **iOS:** audio starts on the first tap. It suspends when the page goes to the background and resumes when it comes back.
- **Settings:** Menu → Character → Audio has Music and Ambience volume sliders and mute toggles. They are saved in localStorage under `frosthold.audio.v1`.
- **Performance:** noise buffers are made once and looped. Drums use a 50 ms lookahead scheduler.

Tests: `node test/core.test.mjs && node test/audio.test.mjs && node test/weather.test.mjs`. For the headless check, serve on :8765 and run `test/audio.playwright.mjs` with playwright-core.

## Weather

Logic is in `js/weather.js`: pure functions plus small classes, with no DOM, so it can be unit-tested.

- **States:** Clear, Windstorm, Snowstorm and Rainstorm. Each region picks one at random using its own odds. Kettleford is mostly clear, and the peaks are stormy. A new state is picked on entering a region and every 2–4 minutes, with an 8 s crossfade. The current state is shown in the HUD after the region name.
- **Visuals:** a fixed pool of 240 particles is allocated once and reused. Snow is drawn as flakes; rain is drawn as short angled streaks in a single batched path. Storm gloom is one translucent tint. During rainstorms there is a white lightning flash that decays in about 0.18 s, at least 6 s apart, so it never strobes.
- **Wind push:** in storms, gusts ramp slowly (time constant about 1.5 s) to a small sideways push. The maximum push is 30 px/s on Cinderhorn Peak, 24 in the Highlands, 14 in Whitepass Vale and 12 at the Barrow. The hard cap of 30 px/s is under 25% of the slowest class's speed. The push is **zero in Kettleford, inside the ruins, and during the dragon fight**. The dragon fight was a deliberate choice to keep the boss fair.
- **Projectiles:** frost bolts and the dragon's fire drift with the wind, at 2.5× the player's push. In practice the dragon's fire never drifts, because there is no wind during the boss fight.
- **Audio:** in storms the wind gets louder and gustier. Rainstorms add a procedural rain-hiss layer. Both are on the ambience bus, so the Ambience volume slider and mute apply to them.
- **FPS safety valve:** if the smoothed FPS stays below 45 for 1 s, the particle budget drops by 25%, down to a minimum of 60. When FPS stays above 55 for 3 s, it climbs back up.
- **Saves:** weather is not saved; it is re-rolled on load. Save and load are otherwise unchanged.

Tests: `node test/weather.test.mjs`. For the headless check, run `test/weather.playwright.mjs`. It saves screenshots to `/tmp/wx-*.png`.

## Fishing
- Spots: **Kettle Pond** (just east of Kettleford), **Highland Tarn**, **Vale Stream**. Walk up and tap **Use**.
- Wait for a bite → tap when the bobber dips (0.8 s window) → hold to raise / release to sink, keeping the marker in the tension zone until the catch meter fills. Out of zone drains the meter; too long out snaps the line. Cancel anytime. The world pauses while fishing; you can't start with an awake enemy nearby.
- Fish: Icefin (common), Silverjaw, Glacier Pike, Frostgill Eel (rare). Sell raw to Ilsa the Trader, or cook at the Kettleford fire (Use with raw fish). Frostgill Jerky gives a 120 s frost ward (−30% wolf/wight damage).
- Storms raise the bite rate. Quest: Brannoc's "A Taste of Icefin" (bring 3 icefin → 60 gold + Bone Hook, which widens the tension zone).
- Tests: `node test/fishing.test.mjs`; headless: `test/fishing.playwright.mjs`.

## Caves
Three cave mouths (stone arches) sit on the overworld: **Pinehollow Grotto** (northwest of Kettleford), **Rimewater Hollow** (south) and **Gloamfang Den** (east). Stand at a mouth and tap **Use** to go in.
- Each cave is its own small tile map, generated from a fixed seed, so it is the same every game. The tests check that the exit, the chest, every enemy spawn and the bank of the pool can all be reached.
- It is dark underground. You see a circle of light around you (3.5 tiles), and the cave keeps its own fog of war, saved separately from the overworld map.
- A **Torch** adds 2.5 tiles of light. It burns for 150 s, but only while you are underground, and lights itself when you enter a cave if you are carrying one. You can also light it from the Pack.
- Enemies: Gloam Wolves (a cave wolf variant), wights and plain wolves. They respawn each time you enter.
- **Gloamfang Den** holds *Gloamfang*, a huge elite wolf that stays dead once killed, and a unique chest. The chest gives the **Deepfrost Lantern** (+1.5 light permanently, a quest item) and 60 gold. Gloam Wolves and Gloamfang also count toward Brannoc's wolf quest.
- **Rimewater Hollow** has an underground pool, *Rimewater Pool*, where you can fish.
- Inside a cave there is no weather or wind and no storm bonus to fishing. The audio switches to a muffled low drone with random water drips.
- Tap **Use** at the exit to come out at the exact spot where you went in.
- The game autosaves when you enter or leave. If you save inside a cave, Continue puts you back inside it.

## Woodcutting & crafting
- Stand next to a pine and tap **Use** to chop, or hold Use to keep chopping. Felling a tree takes **4 hits**, or **2** if you have an axe or hatchet equipped. With an axe, Attack also chops the tree you are facing.
- Each hit plays a wood *thock* and throws chips. The tree falls over with a "timber" sound and leaves a stump you can walk over.
- Each tree gives one wood item: **Firewood** (4g, 65%) or **Pine Logs** (9g, 35%). Ilsa buys both at full price.
- Pines inside Kettleford can't be chopped, so the village layout stays as it is. Felling a tree only ever opens up paths, and a test checks that everywhere reachable before is still reachable after every choppable tree is felled.
- **Regrowth:** a stump grows back into a pine after **300 s of in-game play time**. If you or an enemy is standing on the tile, it waits a few seconds and tries again. **Stumps are saved**: the save stores the seconds each stump has left, so a cleared grove stays cleared after a reload and the timer does not run while the game is closed. *(The choice: saving stumps stops you from reloading to get fresh trees, and costs only a few bytes per stump.)*
- **Crafting** (Pack → Craft):
  - **Campfire** (2 Firewood) can be built anywhere, including in caves. Use it to cook fish, or rest once beside it for +35% HP and +50% stamina. It burns out after 180 s.
  - **Torch** (1 Pine Log) widens your light in caves.

Tests for caves and woodcutting: `node test/caves.test.mjs && node test/trees.test.mjs`. For the headless check, run `test/caves.playwright.mjs`. It saves screenshots to `/tmp/cave-*.png` and `/tmp/chop-*.png`.
