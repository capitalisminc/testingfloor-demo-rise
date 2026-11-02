import Phaser from 'phaser'
import { telemetry } from './telemetry/rise-telemetry.js'
import BootScene from './Scenes/BootScene'
import TitleScene from './Scenes/TitleScene'
import GameScene from './Scenes/GameScene'
import IntermediateScene from './Scenes/IntermediateScene'
import DeathScene from './Scenes/DeathScene'

const config = {
  type: Phaser.WEBGL,
  parent: 'content',
  width: 480,
  height: 270,
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: {y: 800}
    }
  },
  scene: [
    BootScene,
    TitleScene,
    IntermediateScene,
    GameScene,
    DeathScene
  ]
}

const game = new Phaser.Game(config)

window.riseTelemetry = {
  snapshot: () => telemetry.adapter.snapshot(),
  download () {
    const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rise-telemetry.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

if (import.meta.env.DEV) window.riseGame = game
window.addEventListener('pagehide', () => telemetry.endRun('page_hidden'))
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.sound.mute = true
  else game.sound.mute = document.getElementById('mute').getAttribute('aria-pressed') === 'true'
})
document.getElementById('mute').addEventListener('click', event => {
  game.sound.mute = !game.sound.mute
  event.currentTarget.setAttribute('aria-pressed', String(game.sound.mute))
  event.currentTarget.textContent = game.sound.mute ? 'Unmute' : 'Mute'
})
