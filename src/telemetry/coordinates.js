export const TILE_SIZE = 16
export const HUD_HEIGHT = 30

// Phaser's Y grows downwards. Map images and telemetry share this Y-up origin.
export function worldPosition (entity) {
  return {
    x: Math.round(entity.x * 1000) / 1000,
    y: Math.round((HUD_HEIGHT - entity.y) * 1000) / 1000,
    z: 0
  }
}
