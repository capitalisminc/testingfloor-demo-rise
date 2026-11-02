import { createSdkAdapter } from './sdk-adapter.js'
import { HUD_HEIGHT, worldPosition } from './coordinates.js'
export { worldPosition } from './coordinates.js'

export const SAMPLE_INTERVAL_MS = 100

const round = value => Math.round(value * 1000) / 1000

export class RiseTelemetry {
  constructor (adapter = createSdkAdapter()) {
    this.adapter = adapter
    this.running = false
    this.level = null
    this.attempts = {}
    this.adapterErrors = 0
  }

  call (method, ...args) {
    try {
      const result = this.adapter[method](...args)
      if (result?.catch) result.catch(() => { this.adapterErrors++ })
    } catch {
      this.adapterErrors++
    }
  }

  startRun () {
    if (this.running) this.endRun('restarted')
    this.running = true
    this.attempts = {}
    this.call('startSession', { game: 'rise', build: '0.1.0', position_unit: 'px' })
    this.event('run_started')
  }

  startLevel (scene) {
    if (!this.running) this.startRun()
    if (this.level) this.finishLevel('abandoned')
    this.level = scene.stage
    this.scene = scene
    this.attempt = this.attempts[this.level] = (this.attempts[this.level] || 0) + 1
    this.elapsed = 0
    this.sampleElapsed = 0
    this.progress = 0
    this.outcome = null
    const bigBossNames = new Set((scene.bigBosses || []).map(boss => boss.name))
    this.entities = [
      { object: scene.player, id: 'player', type: 'player', name: 'player' },
      ...scene.pestGroup.getChildren().map((enemy, index) => ({
        object: enemy,
        id: `${this.level}:${this.attempt}:pest:${index}`,
        type: bigBossNames.has(enemy.name) ? 'boss' : 'enemy',
        name: enemy.name
      })),
      ...scene.bossGroup.getChildren().map((enemy, index) => ({
        object: enemy,
        id: `${this.level}:${this.attempt}:boss:${index}`,
        type: 'boss',
        name: enemy.name
      }))
    ]
    // A retry, or a new game on the same level, puts the player back at the
    // level's start. Recording that as a teleport keeps the path from showing
    // a walk back from where the last attempt ended. A new level is drawn on
    // its own map, so it needs none.
    if (this.lastPlayer?.level === this.level) {
      this.call('trackTeleport', this.lastPlayer.position, worldPosition(scene.player), this.attempt > 1 ? 'retry' : 'new_game')
    }
    // Sample first, so the attempt's first event carries its own positions,
    // not where the previous attempt ended.
    this.sample()
    this.event('level_started', { retry: this.attempt > 1 }, scene.player)
  }

  event (name, properties = {}, entity) {
    if (!this.running) return
    this.call('trackEvent', name, {
      ...(this.level ? { level_id: this.level, attempt: this.attempt, elapsed_seconds: round(this.elapsed / 1000) } : {}),
      ...properties,
      ...(entity ? { position: worldPosition(entity) } : {})
    })
  }

  trackEntity (entry, active = true) {
    const object = entry.object
    if (entry.type === 'player') this.lastPlayer = { level: this.level, position: worldPosition(object) }
    this.call('trackEntity', {
      entity_id: entry.id,
      entity_type: entry.type,
      level_id: this.level,
      attempt: this.attempt,
      position: worldPosition(object),
      properties: {
        name: entry.name,
        active,
        health: object.health,
        ...(entry.type === 'player' ? {
          ammo: object.ammo,
          grounded: object.body.blocked.down,
          velocity_x: round(object.body.velocity.x),
          velocity_y: round(-object.body.velocity.y)
        } : {})
      }
    })
  }

  sample () {
    for (const entry of this.entities) {
      if (entry.object.active && entry.object.alive) this.trackEntity(entry)
    }
  }

  update (delta) {
    if (!this.level || this.outcome) return
    this.elapsed += delta
    this.sampleElapsed += delta
    if (this.sampleElapsed >= SAMPLE_INTERVAL_MS) {
      this.sampleElapsed %= SAMPLE_INTERVAL_MS
      this.sample()
    }
    const ascent = 1 - (this.scene.player.y - HUD_HEIGHT) / this.scene.map.heightInPixels
    for (const checkpoint of [0.25, 0.5, 0.75]) {
      if (ascent >= checkpoint && this.progress < checkpoint) {
        this.event('level_progress', { progress: checkpoint }, this.scene.player)
        this.progress = checkpoint
      }
    }
  }

  enemyDefeated (enemy) {
    const entry = this.entities?.find(entry => entry.object === enemy)
    if (!entry || entry.defeated || this.outcome) return
    entry.defeated = true
    this.event('enemy_defeated', { enemy_id: entry.id, enemy_type: entry.type, enemy_name: entry.name }, enemy)
    this.trackEntity(entry, false)
  }

  playerDied (cause) {
    if (!this.level || this.outcome) return
    this.event('player_died', { cause }, this.scene.player)
    this.finishLevel('failed', { cause })
  }

  finishLevel (outcome, properties = {}) {
    if (!this.level || this.outcome) return
    this.outcome = outcome
    this.event(`level_${outcome}`, properties, this.scene.player)
    for (const entry of this.entities) {
      if (!entry.defeated && entry.object.active) this.trackEntity(entry, false)
    }
    if (outcome === 'completed' && this.scene.nextStage === 'end') this.endRun('completed')
  }

  leaveLevel () {
    this.finishLevel('abandoned')
    this.level = null
    this.scene = null
    this.entities = []
  }

  endRun (reason = 'quit') {
    if (!this.running) return
    if (this.level && !this.outcome) this.finishLevel('abandoned', { reason })
    this.event(reason === 'completed' ? 'run_completed' : 'run_ended', { reason })
    this.call('endSession', reason)
    this.running = false
    this.level = null
    this.scene = null
    this.entities = []
  }
}

export const telemetry = new RiseTelemetry()
