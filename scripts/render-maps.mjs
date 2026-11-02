import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { HUD_HEIGHT, TILE_SIZE } from '../src/telemetry/coordinates.js'

const stages = JSON.parse(await readFile('assets/data/stages.json', 'utf8'))
const animations = JSON.parse(await readFile('assets/data/animations.json', 'utf8'))
const maps = []
await mkdir('maps', { recursive: true })

async function pixels (path) {
  return sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

function blit (target, width, height, source, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (dx + x < 0 || dy + y < 0 || dx + x >= width || dy + y >= height) continue
      const src = ((sy + y) * source.info.width + sx + x) * 4
      const dst = ((dy + y) * width + dx + x) * 4
      const alpha = source.data[src + 3] / 255
      for (let c = 0; c < 3; c++) target[dst + c] = Math.round(source.data[src + c] * alpha + target[dst + c] * (1 - alpha))
    }
  }
}

for (const [id, stage] of Object.entries(stages)) {
  const tiled = JSON.parse(await readFile(`assets/tilemaps/${id}.json`, 'utf8'))
  const layer = tiled.layers.find(layer => layer.name === 'contactLayer')
  const tileset = tiled.tilesets[0]
  const width = tiled.width * tiled.tilewidth
  const height = tiled.height * tiled.tileheight
  const data = await sharp({ create: { width, height, channels: 4, background: `#${stage.bgColor}` } }).raw().toBuffer()
  const tiles = await pixels(`assets/tilesets/${id}.png`)

  // Match createDynamicLayer(..., 0, HUD_HEIGHT): Phaser overrides Tiled offsets.
  for (const [index, gid] of layer.data.entries()) {
    if (!gid) continue
    const tile = gid - tileset.firstgid
    if (tile < 0 || tile >= tileset.tilecount) throw new Error(`Unexpected tile ${gid} in ${id}`)
    blit(data, width, height, tiles,
      tileset.margin + (tile % tileset.columns) * (TILE_SIZE + tileset.spacing),
      tileset.margin + Math.floor(tile / tileset.columns) * (TILE_SIZE + tileset.spacing),
      TILE_SIZE, TILE_SIZE, (index % tiled.width) * TILE_SIZE, Math.floor(index / tiled.width) * TILE_SIZE)
  }

  for (const item of stage.items) {
    const sprite = await pixels(`assets/weapons/${item.name}.png`)
    const frame = animations[item.name].anims.find(anim => anim.key === `${item.name}-idle`).frames.start || 0
    const columns = Math.floor((sprite.info.width - 2 + 2) / (item.size.x + 2))
    blit(data, width, height, sprite,
      1 + (frame % columns) * (item.size.x + 2), 1 + Math.floor(frame / columns) * (item.size.y + 2),
      item.size.x, item.size.y,
      Math.round(item.position.x - item.size.x / 2), Math.round(item.position.y - HUD_HEIGHT - item.size.y / 2))
  }

  const image = `${id}.png`
  await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(width * 4, height * 4, { kernel: 'nearest' }).png().toFile(`maps/${image}`)
  maps.push({
    level_id: id,
    image,
    image_width: width * 4,
    image_height: height * 4,
    map_horizontal_axis: 'x',
    map_vertical_axis: 'y',
    map_unit: 'px',
    default_voxel_size: TILE_SIZE,
    variant_key: 'side',
    default_variant: true,
    app_version: '0.1.0',
    bounds: { center_x: width / 2, center_z: -height / 2, size_x: width, size_z: height }
  })
  console.log(`${id}: ${width * 4} × ${height * 4}; ${TILE_SIZE} px grid`)
}

await writeFile('maps/manifest.json', JSON.stringify(maps, null, 2) + '\n')
