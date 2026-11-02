# rise maps

Run `npm run maps` to render the three side-view level maps from the original Tiled data, tilesets and pickup sprites.

| Level | Image | World extent |
| --- | --- | --- |
| Desert | 1920 × 3840 | 480 × 960 px |
| Desert / Forest | 1920 × 4800 | 480 × 1200 px |
| Forest | 1920 × 5760 | 480 × 1440 px |

Use X / Y with **px** as the unit and **16 px** cells. Bounds and build version are in [manifest.json](manifest.json). See [coordinate conversion](../docs/testing-floor.md#map-coordinates) before adding new spatial events.

These images are derived from rise's art by **zzox (tyler)**, [original game](https://zzox.itch.io/rise), [source](https://github.com/zzox/rise), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Testing Floor's changes assemble full-level views with static pickup locations and scale them 4× using nearest-neighbor interpolation.
