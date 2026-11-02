import { createTestingFloor } from '@testingfloor/browser'

// The build's telemetry write key. Without one, the example keeps everything in
// the local stub and sends nothing.
const WRITE_KEY = import.meta.env?.VITE_TESTING_FLOOR_WRITE_KEY ?? ''

// This is the example's boundary, not an SDK API: RiseTelemetry calls these
// five methods, and the adapter turns them into Testing Floor SDK calls.
export function createSdkAdapter () {
  if (!WRITE_KEY || typeof window === 'undefined') return new LocalTelemetryStub()
  // src/index.js closes the SDK on pagehide after the run's final events. A
  // jump lasts about half a second, so tracked objects are checked ten times a
  // second, the SDK's most, to draw jumps as arcs rather than straight lines.
  return new TestingFloorAdapter(createTestingFloor({ writeKey: WRITE_KEY, appVersion: '0.1.0', closeOnPageHide: false, objectChecksPerSecond: 10 }))
}

// Sends through the Testing Floor browser SDK. A run is marked by the
// run_started and run_ended events; the SDK's own session spans the page.
export class TestingFloorAdapter {
  constructor (client) {
    this.client = client
    this.positions = new Map()
    this.level = null
    this.player = null
    client.contextProvider = () => (this.level ? { 'game_level.id': this.level } : {})
    client.activitySource = () => (this.player ? { playerPosition: this.player } : null)
  }

  // A new run starts without the previous run's level or player position.
  startSession () {
    this.level = null
    this.player = null
  }

  trackEvent (name, properties) {
    if (properties.level_id) this.level = properties.level_id
    this.client.track(name, flatten(properties))
  }

  // Each entity is a tracked object with its own path. An inactive entity is
  // removed, sending its final position.
  trackEntity ({ entity_id: id, entity_type: kind, position, properties = {} }) {
    if (kind === 'player') this.player = position
    this.positions.set(id, position)
    if (properties.active === false) {
      this.client.removeObject(id, 'removed')
      this.positions.delete(id)
      return
    }
    this.client.trackObject(kind, () => this.positions.get(id) ?? null, id)
    for (const [key, value] of Object.entries(properties)) {
      if (key !== 'active' && value !== undefined && value !== null) this.client.setObjectState(id, key, value)
    }
  }

  // The player moved without walking, such as respawning at a level's start.
  // The level is set first: a new game's teleport comes before its
  // level_started, and startSession has cleared the level by then.
  trackTeleport ({ level_id: level, from, to, reason }) {
    if (level) this.level = level
    this.client.recordTeleport(from, to, reason)
    this.player = to
  }

  endSession () {
    this.client.flush()
  }

  snapshot () {
    return {
      mode: 'testing-floor',
      play_session_id: this.client.playSessionId,
      collecting: this.client.isCollecting(),
      collection_reason: this.client.collectionReason(),
      recording: this.client.getRecording()?.recordingUuid ?? null,
      pending_events: this.client.pendingCount(),
      dropped_events: this.client.droppedEvents
    }
  }
}

// Telemetry properties are flat: { position: { x: 1 } } becomes { 'position.x': 1 }.
function flatten (properties, prefix = '', into = {}) {
  for (const [key, value] of Object.entries(properties)) {
    const name = prefix + key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, `${name}.`, into)
    else into[name] = value
  }
  return into
}

export class LocalTelemetryStub {
  constructor ({ maxEntries = 10000, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries
    this.now = now
    this.entries = []
    this.sequence = 0
    this.droppedEntries = 0
    this.sessionId = null
  }

  record (type, data) {
    this.entries.push({
      type,
      session_id: this.sessionId,
      sequence: ++this.sequence,
      timestamp: this.now(),
      ...data
    })
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
      this.droppedEntries++
    }
  }

  startSession (metadata) {
    this.sessionId = globalThis.crypto.randomUUID()
    this.record('session_started', { metadata })
  }

  trackEvent (name, properties) {
    this.record('event', { name, properties })
  }

  trackEntity (entity) {
    this.record('entity', { entity })
  }

  trackTeleport (teleport) {
    this.record('teleport', { teleport })
  }

  endSession (reason) {
    this.record('session_ended', { reason })
    this.sessionId = null
  }

  snapshot () {
    return structuredClone({
      mode: 'local-stub',
      dropped_entries: this.droppedEntries,
      entries: this.entries
    })
  }
}
