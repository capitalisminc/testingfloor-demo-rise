# rise × Testing Floor

This fork of [zzox's rise](https://github.com/zzox/rise) is a browser-game reference for [Testing Floor](https://testingfloor.com): player and enemy tracking, gameplay events, level attempts, and maps that line up with recorded positions.

It sends through the [Testing Floor browser SDK](https://github.com/capitalisminc/testingfloor-sdk-browser) when the build has a telemetry write key. Without one, calls stay in a local stub so you can play and inspect the events offline.

**[Play the example](https://capitalisminc.github.io/testingfloor-demo-rise/)** · [Testing Floor game and maps](https://testingfloor.com/orgs/example-studio/rise)

## Play locally

Use Node.js 22.18 or newer:

```sh
npm ci
npm start
```

Open the local URL printed by Vite. Press **Enter** to start or confirm a menu choice; **W/S** select menu items. Move with **A/D**, jump or wall-jump with **J**, swing a collected weapon with **K**, shoot with **L**, and dash with **I** when the level enables it. Keep ahead of the rising camera. The footer's Mute button controls sound.

## Use the example

- Follow the player, enemies and bosses at 10 Hz.
- Inspect jumps, attacks, pickups, damage, deaths and boss defeats.
- Compare retries and progress through Desert, Desert / Forest and Forest.
- Render each full level with `npm run maps`; PNGs and matching pixel-space bounds are in [`maps/`](maps/).

To send to Testing Floor, copy `.env.example` to `.env` and add a telemetry write key from your Testing Floor game before `npm start` or `npm run build`. Without a key, use `riseTelemetry.snapshot()` in the browser console to inspect calls or `riseTelemetry.download()` to save them as JSON; the stub keeps the latest 10,000 entries in memory and sends nothing.

The [integration guide](docs/testing-floor.md) covers the gameplay hooks, the SDK adapter, events and map coordinates. `npm run build` produces a static site in `dist/`.

Original game, music and art by **zzox (tyler)**. [Play the original](https://zzox.itch.io/rise). Code is [MIT licensed](LICENSE); assets are [CC BY 4.0](assets/LICENSE). This fork adds telemetry hooks, map exports and a current build setup.

![Title](assets/readme/riseTitle.png)

## About the original


A challenging vertical-scrolling combat-platformer.  Made using Phaser 3 for the [itch.io Game Off](https://itch.io/jam/game-off-2018).  Inspired by [Celeste](https://mattmakesgames.itch.io/celeste) and [Towerfall](https://mattmakesgames.itch.io/towerfall), as well as games with vertical scrolling levels like [Rayman](https://en.wikipedia.org/wiki/Rayman_(video_game)). All music, sound effects, sprites, animations and game programming were created by zzox (tyler).  The font is a slightly altered version of [Manaspace Font](https://www.fontspace.com/codeman38/manaspace). The backgrounds were created by using images in the public domain and converting them to pixel art with [Pixelator](http://pixelatorapp.com/). All code is convered under the MIT license, while all assests are covered under the CC-BY-Attribution license.

## Thanks to/built with
- [@photonstorm](https://github.com/photonstorm) for [Phaser](https://github.com/photonstorm/phaser)
- [@nkholski](https://github.com/nkholski) for the awesome [boilerplate](https://github.com/nkholski/phaser3-es6-webpack), a great entry point into Phaser especially if you want to build platformers.
- [@simiancraft](https://github.com/simiancraft) for [create-phaser-app](https://github.com/simiancraft/create-phaser-app)
- [Piskel](https://www.piskelapp.com/)
- [Tiled](https://www.mapeditor.org/)
- [audiosprite](https://github.com/tonistiigi/audiosprite)
- [Pixelator](http://pixelatorapp.com/)
- [codeman38](http://www.zone38.net/) for [Manaspace font](https://www.fontspace.com/codeman38/manaspace)

![one](assets/readme/rise1.png)
![two](assets/readme/rise2.png)
![three](assets/readme/rise3.png)
