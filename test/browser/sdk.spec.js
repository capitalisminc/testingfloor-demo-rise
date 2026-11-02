import { test, expect } from '@playwright/test'

// Runs the game with a write key, so telemetry goes through the Testing Floor
// browser SDK. Every request to Testing Floor is answered here; nothing leaves the machine.
async function playRecorded (page) {
  const testingFloor = { events: [], closed: false, errors: [] }
  const allowAny = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  await page.route('https://dataentry.testingfloor.com/v1/batch', async route => {
    testingFloor.events.push(...JSON.parse(route.request().postData()).events)
    await route.fulfill({ status: 200, headers: allowAny, body: '{}' })
  })
  await page.route('https://api.testingfloor.com/telemetry/recording_state', async route => {
    const answer = testingFloor.closed ? { closed: true } : { closed: false, lease_expires_at_unix_ms: Date.now() + 20_000 }
    await route.fulfill({ status: 200, headers: allowAny, body: JSON.stringify(answer) })
  })
  // The SDK collects nothing under automation. This test stands in for a tester's browser.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
  page.on('pageerror', error => testingFloor.errors.push(error.message))

  await page.goto('http://127.0.0.1:5180/?tf_recording_uuid=example-recording')
  await page.waitForFunction(() => window.riseGame?.scene.isActive('TitleScene'))
  await page.getByRole('button', { name: 'Mute', exact: true }).click()
  await page.locator('canvas').click({ position: { x: 10, y: 10 } })
  await page.waitForFunction(() => window.riseGame.scene.getScene('TitleScene').prevState.startKey === false)
  // The game reads held keys each frame, so hold Enter long enough for one.
  await page.keyboard.down('Enter')
  await page.waitForTimeout(120)
  await page.keyboard.up('Enter')
  await page.waitForFunction(() => window.riseGame.scene.isActive('GameScene'))
  return testingFloor
}

test('gameplay reaches Testing Floor tagged with the recording, which completes when it closes', async ({ page }) => {
  const testingFloor = await playRecorded(page)
  const { events } = testingFloor
  await expect.poll(() => events.find(event => event.$name === 'level_started')).toBeTruthy()
  const started = events.find(event => event.$name === 'level_started')
  expect(started.$tf.recording_uuid).toBe('example-recording')
  expect(started.$tf.engine).toMatch(/^Phaser \d/)
  expect(started['game_level.id']).toBeTruthy()
  await expect.poll(() => events.some(event => event.$name === '$tf_objects' && event['sample.id']?.includes('player'))).toBe(true)
  expect(await page.evaluate(() => window.riseTelemetry.snapshot().mode)).toBe('testing-floor')

  testingFloor.closed = true
  await expect.poll(() => events.find(event => event.$name === '$tf_telemetry_complete'), { timeout: 15_000 }).toBeTruthy()
  expect(events.find(event => event.$name === '$tf_telemetry_complete').$tf.recording_uuid).toBe('example-recording')
  expect(testingFloor.errors).toEqual([])
})

test('leaving the page mid-run sends the run ending and completes the recording', async ({ page }) => {
  const testingFloor = await playRecorded(page)
  const { events } = testingFloor
  await expect.poll(() => events.find(event => event.$name === 'level_started')).toBeTruthy()
  // Playwright does not see the requests a page sends while it unloads, so the
  // page stays open and pagehide is fired as the browser would on leaving.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })))
  await expect.poll(() => events.find(event => event.$name === '$tf_telemetry_complete')).toBeTruthy()
  const ended = events.find(event => event.$name === 'run_ended')
  expect(ended?.reason).toBe('page_hidden')
  expect(ended.$tf.recording_uuid).toBe('example-recording')
  expect(events.find(event => event.$name === 'level_abandoned')).toBeTruthy()
  expect(testingFloor.errors).toEqual([])
})

test('jumping sends the player path about ten times a second', async ({ page }) => {
  const testingFloor = await playRecorded(page)
  const { events } = testingFloor
  await expect.poll(() => events.find(event => event.$name === 'level_started')).toBeTruthy()
  for (let jump = 0; jump < 3; jump++) {
    await page.keyboard.down('j')
    await page.waitForTimeout(150)
    await page.keyboard.up('j')
    await page.waitForTimeout(650)
  }
  // Three jumps last about two seconds; at most two samples a second would
  // leave each arc as a straight line.
  await expect.poll(() => events.filter(event => event.$name === 'player_moved').length).toBeGreaterThanOrEqual(10)
  const heights = new Set(events.filter(event => event.$name === 'player_moved').map(event => event['player.position.y']))
  expect(heights.size).toBeGreaterThanOrEqual(5)
  expect(testingFloor.errors).toEqual([])
})
