import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LocalTelemetryStub, TestingFloorAdapter } from '../src/telemetry/sdk-adapter.js'
import { Client } from '../src/telemetry/testingfloor/client.ts'
import { RiseTelemetry, worldPosition } from '../src/telemetry/rise-telemetry.js'

function fixture (stage = 'desert', nextStage = 'forest') {
  const player = { x: 40, y: 960, alive: true, active: true, health: 100, ammo: 0, body: { blocked: { down: true }, velocity: { x: 0, y: 0 } } }
  const enemy = { x: 60, y: 480, alive: true, active: true, health: 30, name: 'snake' }
  return { stage, nextStage, player, map: { heightInPixels: 960 }, pestGroup: { getChildren: () => [enemy] }, bossGroup: { getChildren: () => [] } }
}

const events = sdk => sdk.snapshot().entries.filter(entry => entry.type === 'event')

test('positions remove the HUD offset and match the Y-up map bounds', () => {
  assert.deepEqual(worldPosition({ x: 0, y: 30 }), { x: 0, y: 0, z: 0 })
  assert.deepEqual(worldPosition({ x: 480, y: 990 }), { x: 480, y: -960, z: 0 })
})

test('player and enemies sample at 10 Hz regardless of frame rate; no catch-up burst', () => {
  for (const frameMs of [10, 20, 50]) {
    const sdk = new LocalTelemetryStub()
    const telemetry = new RiseTelemetry(sdk)
    telemetry.startLevel(fixture())
    for (let elapsed = 0; elapsed < 1000; elapsed += frameMs) telemetry.update(frameMs)
    const samples = sdk.snapshot().entries.filter(entry => entry.type === 'entity')
    assert.equal(samples.filter(entry => entry.entity.entity_type === 'player').length, 11)
    assert.equal(samples.filter(entry => entry.entity.entity_type === 'enemy').length, 11)
    telemetry.update(5000)
    assert.equal(sdk.snapshot().entries.filter(entry => entry.type === 'entity').length, 24)
  }
})

test('one death/failure per attempt and retries stay in the same run', () => {
  const sdk = new LocalTelemetryStub()
  const telemetry = new RiseTelemetry(sdk)
  telemetry.startLevel(fixture())
  const session = sdk.sessionId
  telemetry.playerDied('fell_behind')
  telemetry.playerDied('fell_behind')
  telemetry.leaveLevel()
  telemetry.startLevel(fixture())
  assert.equal(sdk.sessionId, session)
  assert.equal(events(sdk).filter(entry => entry.name === 'player_died').length, 1)
  assert.equal(events(sdk).filter(entry => entry.name === 'level_failed').length, 1)
  assert.deepEqual(events(sdk).filter(entry => entry.name === 'level_started').map(entry => [entry.properties.attempt, entry.properties.retry]), [[1, false], [2, true]])
})

test('progress is monotonic; enemy defeat and despawn appear once', () => {
  const sdk = new LocalTelemetryStub()
  const telemetry = new RiseTelemetry(sdk)
  const scene = fixture()
  telemetry.startLevel(scene)
  scene.player.y = 100
  telemetry.update(100)
  scene.player.y = 900
  telemetry.update(100)
  scene.player.y = 100
  telemetry.update(100)
  const enemy = scene.pestGroup.getChildren()[0]
  telemetry.enemyDefeated(enemy)
  telemetry.enemyDefeated(enemy)
  enemy.alive = false
  telemetry.update(100)
  assert.deepEqual(events(sdk).filter(entry => entry.name === 'level_progress').map(entry => entry.properties.progress), [0.25, 0.5, 0.75])
  assert.equal(events(sdk).filter(entry => entry.name === 'enemy_defeated').length, 1)
  assert.equal(sdk.snapshot().entries.filter(entry => entry.type === 'entity' && entry.entity.entity_type === 'enemy' && entry.entity.properties.active === false).length, 1)
})

test('finishing the last level completes the run and stops sampling', () => {
  const sdk = new LocalTelemetryStub()
  const telemetry = new RiseTelemetry(sdk)
  telemetry.startLevel(fixture('forest', 'end'))
  telemetry.finishLevel('completed')
  telemetry.leaveLevel()
  telemetry.endRun('quit')
  telemetry.update(100)
  assert.deepEqual(events(sdk).map(entry => entry.name), ['run_started', 'level_started', 'level_completed', 'run_completed'])
  assert.equal(sdk.snapshot().entries.filter(entry => entry.type === 'session_ended').length, 1)
})

test('quit records abandonment and a fresh new game resets attempts and identity', () => {
  const sdk = new LocalTelemetryStub()
  const telemetry = new RiseTelemetry(sdk)
  telemetry.startLevel(fixture())
  const first = sdk.sessionId
  telemetry.endRun('quit')
  telemetry.startLevel(fixture())
  assert.notEqual(sdk.sessionId, first)
  assert.equal(telemetry.attempt, 1)
  assert.equal(events(sdk).filter(entry => entry.name === 'level_abandoned').length, 1)
})

test('stub is local, bounded and snapshots cannot mutate the stored data', () => {
  const sdk = new LocalTelemetryStub({ maxEntries: 2, now: () => 123 })
  sdk.startSession({ game: 'rise' })
  sdk.trackEvent('one', { nested: { value: 1 } })
  sdk.trackEvent('two', {})
  const snapshot = sdk.snapshot()
  snapshot.entries[0].properties.nested.value = 99
  assert.equal(sdk.snapshot().entries[0].properties.nested.value, 1)
  assert.equal(snapshot.dropped_entries, 1)
  assert.deepEqual(snapshot.entries.map(entry => entry.sequence), [2, 3])
  assert.equal(snapshot.mode, 'local-stub')
})

test('SDK failures never interrupt gameplay', async () => {
  const sdk = { startSession () { throw new Error('unavailable') }, trackEvent () { return Promise.reject(new Error('offline')) }, trackEntity () { throw new Error('offline') } }
  const telemetry = new RiseTelemetry(sdk)
  telemetry.startLevel(fixture())
  telemetry.update(100)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(telemetry.running, true)
  assert.ok(telemetry.adapterErrors >= 5)
})

test('the Testing Floor adapter sends flat events and each entity as a tracked object', () => {
  let nowMs = 1767225600000
  let seconds = 0
  const bodies = []
  const client = new Client({
    writeKey: 'test-only-never-transmitted',
    flushIntervalSeconds: 1e9,
    clockMs: () => nowMs,
    transport: (body, done) => { bodies.push(body); done(200) }
  })
  client.start(0)
  const telemetry = new RiseTelemetry(new TestingFloorAdapter(client))
  const scene = fixture()
  telemetry.startLevel(scene)
  const advance = ms => { nowMs += ms; seconds += ms / 1000; telemetry.update(ms); client.tick(seconds) }
  advance(300)
  telemetry.enemyDefeated(scene.pestGroup.getChildren()[0])
  advance(300)
  client.flush()
  const sent = bodies.flatMap(body => JSON.parse(body).events)
  const started = sent.find(event => event.$name === 'level_started')
  assert.equal(started['position.y'], -930, 'nested positions are flattened')
  assert.equal(started['game_level.id'], 'desert')
  const defeated = sent.find(event => event.$name === 'enemy_defeated')
  assert.equal(defeated['player.position.x'], 40, 'events after the first sample carry the player position')
  const objects = sent.filter(event => event.$name === '$tf_objects')
  const sampled = objects.flatMap(record => record['sample.id'] ?? [])
  assert.ok(sampled.includes('player') && sampled.includes('desert:1:pest:0'), `entities are tracked: ${sampled}`)
  assert.deepEqual(objects.flatMap(record => record['removed.id'] ?? []), ['desert:1:pest:0'], 'a defeated enemy is removed')
  assert.ok(objects.every(record => record['game_level.id'] === 'desert'))
})
