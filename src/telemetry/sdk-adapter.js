// Replace this factory with the browser SDK when it is available.
// This is the example's boundary, not a promised SDK API.
export function createSdkAdapter () {
  return new LocalTelemetryStub()
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
