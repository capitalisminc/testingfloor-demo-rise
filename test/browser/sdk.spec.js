import { test, expect } from '@playwright/test'

// Runs the game with a write key, so telemetry goes through the Testing Floor
// browser SDK. Every request to Testing Floor is answered here; nothing leaves the machine.
test('gameplay reaches Testing Floor tagged with the recording, which completes when it closes', async ({ page }) => {
  const events = []
  let closed = false
  const allowAny = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
  await page.route('https://dataentry.testingfloor.com/v1/batch', async route => {
    events.push(...JSON.parse(route.request().postData()).events)
    await route.fulfill({ status: 200, headers: allowAny, body: '{}' })
  })
  await page.route('https://api.testingfloor.com/telemetry/recording_state', async route => {
    const answer = closed ? { closed: true } : { closed: false, lease_expires_at_unix_ms: Date.now() + 20_000 }
    await route.fulfill({ status: 200, headers: allowAny, body: JSON.stringify(answer) })
  })
  // The SDK collects nothing under automation. This test stands in for a tester's browser.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

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

  await expect.poll(() => events.find(event => event.$name === 'level_started')).toBeTruthy()
  const started = events.find(event => event.$name === 'level_started')
  expect(started.$tf.recording_uuid).toBe('example-recording')
  expect(started.$tf.engine).toMatch(/^Phaser \d/)
  expect(started['game_level.id']).toBeTruthy()
  await expect.poll(() => events.some(event => event.$name === '$tf_objects' && event['sample.id']?.includes('player'))).toBe(true)
  expect(await page.evaluate(() => window.riseTelemetry.snapshot().mode)).toBe('testing-floor')

  closed = true
  await expect.poll(() => events.find(event => event.$name === '$tf_telemetry_complete'), { timeout: 15_000 }).toBeTruthy()
  expect(events.find(event => event.$name === '$tf_telemetry_complete').$tf.recording_uuid).toBe('example-recording')
  expect(errors).toEqual([])
})
