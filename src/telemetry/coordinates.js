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

// The part of the world on screen: the camera's view below the HUD, which
// covers the top of the canvas. Its center is in the same Y-up coordinates.
// The scroll position is current as soon as a level starts; Phaser's worldView
// only catches up when the next frame renders. The camera is never zoomed.
export function cameraView (camera) {
  const height = camera.height - HUD_HEIGHT
  return {
    center: {
      x: Math.round((camera.scrollX + camera.width / 2) * 1000) / 1000,
      y: Math.round((-camera.scrollY - height / 2) * 1000) / 1000,
      z: 0
    },
    width: camera.width,
    height
  }
}
