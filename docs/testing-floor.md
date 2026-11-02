# Instrumenting a Phaser game

This example adds gameplay instrumentation to [rise](https://github.com/zzox/rise), a single-player Phaser platformer by zzox. Use it as a reference for placing events at the point where an action actually happens, tracking characters, and matching their positions to a level image.

**The browser SDK is being developed separately.** This fork currently records calls into a local, bounded stub. It does not send telemetry or capture video. The game and maps are ready for the real SDK adapter.

## Where to start

- [`src/telemetry/sdk-adapter.js`](../src/telemetry/sdk-adapter.js): the replacement point for the browser SDK. It owns session and event delivery. The current `LocalTelemetryStub` implements the example's small interface; these method names are not a proposed public SDK API.
- [`src/telemetry/rise-telemetry.js`](../src/telemetry/rise-telemetry.js): game-specific context, attempts, sampling, entity IDs, progress and coordinate conversion.
- [`GameScene`](../src/Scenes/GameScene.js), [`Player`](../src/Player/Player.js), and [`Enemies`](../src/Enemies): hooks where gameplay succeeds, fails or changes level.

To connect an SDK, replace `createSdkAdapter()` with an adapter implementing these four calls:

| Call | Meaning |
| --- | --- |
| `startSession(metadata)` | One run, starting at New Game. Attach the SDK's identity and recording-sync integration here. |
| `trackEvent(name, properties)` | A successful action or lifecycle change. Properties include the level and attempt, plus a position for spatial events. |
| `trackEntity(entity)` | Character position and state. `properties.active: false` means stop tracking this entity. |
| `endSession(reason)` | Completed, quit, restarted or page hidden/unloaded. |

The browser SDK adapter should translate these calls into the SDK's actual API, including its own transport, timestamps, identity, batching and recording synchronization. SDK exceptions and rejected promises are isolated from gameplay. `pagehide` ends an open run; ordinary tab switching only mutes sound and lets Phaser pause normally.

## Runs, levels and entities

A run spans all three levels and any retries. Each level visit increments its own attempt number. A death produces one `player_died` and one `level_failed` event. A retry starts a new attempt in the same run. Defeating the last boss completes the level; completing Forest ends the run.

The player has the stable entity ID `player`. Enemies and bosses use IDs containing level, attempt, group and spawn index, so a retry does not accidentally continue tracking a dead character from the previous attempt. Entity updates include name, health and active state. The player also includes ammo, velocity and whether they are grounded. Positions sample at **10 Hz** without emitting a catch-up burst after a stalled frame.

| Events | Useful questions |
| --- | --- |
| `run_started`, `run_completed`, `run_ended` | How many people finish, and where do they stop? |
| `level_started`, `level_completed`, `level_failed`, `level_abandoned` | Which levels take retries or lose players? |
| `level_progress` | How many attempts reach 25%, 50% or 75% of the climb? Each threshold appears once per attempt. |
| `player_jump`, `player_dash` | Where are ground, air and wall jumps used? Where do players use charged dashes? |
| `player_attack`, `player_damaged`, `player_died` | Which weapons are used, and where do players take damage or fall behind the camera? |
| `item_collected`, `enemy_defeated` | Which pickups are missed, and which enemies block progress? |

## Inspecting the stub

Play normally, then use the browser console:

```js
riseTelemetry.snapshot() // session, events, entity samples and dropped-entry count
riseTelemetry.download() // download the same data as JSON
```

The stub keeps the latest **10,000 entries in memory** and sends no network requests. Reloading clears it. `sequence` and `timestamp` describe local stub calls, not a collector wire format. During `npm start`, `window.riseGame` also exposes the Phaser game for debugging; production builds omit that handle.

## Map coordinates

Keep game positions in **pixels**. A tile is **16 × 16 px**, so the default heatmap cell is **16 px**. No physical meter conversion is needed.

The tile layer starts 30 px below Phaser's origin to allow for the HUD. Telemetry removes that offset and flips Y so rising through the level increases Y:

```js
position = { x: sprite.x, y: 30 - sprite.y, z: 0 }
```

Use the **X / Y** projection. The map image's top-left is `(0, 0)`; its bottom-right is `(480, -levelHeight)`. The manifest uses Testing Floor's generic plane-bound names `center_x`, `center_z`, `size_x`, `size_z`; the second coordinate maps to Y because `map_vertical_axis` is `y`.

Run `npm run maps` after changing level art or layout. [`maps/manifest.json`](../maps/manifest.json) contains the corresponding bounds, axes and cell size for each PNG. Images use the original tiles and initial pickup locations, with a flat stage-colored background. Moving characters are supplied by entity tracking. The screen-relative parallax backdrop is omitted because it has no single world position. The 4× nearest-neighbor export preserves the pixel art; it does not invent extra detail.

## Run and check

```sh
npm ci
npm start
npm test
npm run build
```

`dist/` is a self-contained static site and works at a subdirectory URL. `npm run preview` serves the production build locally. Browser tests run with `npm run test:browser` after `npx playwright install chromium`; an installed Chrome can be used with `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.
