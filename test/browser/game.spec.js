import { test, expect } from '@playwright/test'

async function press (page, key) {
  await page.keyboard.down(key)
  await page.waitForTimeout(120)
  await page.keyboard.up(key)
}

async function openGame (page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5179')
  await page.waitForFunction(() => window.riseGame?.scene.isActive('TitleScene'))
  await page.getByRole('button', { name: 'Mute', exact: true }).click()
  await page.locator('canvas').click({ position: { x: 10, y: 10 } })
  await page.waitForFunction(() => window.riseGame.scene.getScene('TitleScene').prevState.startKey === false)
  await press(page, 'Enter')
  await page.waitForFunction(() => window.riseGame.scene.isActive('GameScene'))
  return errors
}

async function eventNames (page) {
  return page.evaluate(() => window.riseTelemetry.snapshot().entries.filter(entry => entry.type === 'event').map(entry => entry.name))
}

test('real gameplay emits movement, jump, pickup, damage and a single failure, then retries', async ({ page }, testInfo) => {
  const errors = await openGame(page)
  await page.waitForFunction(() => window.riseGame.scene.getScene('GameScene').player.body.blocked.down)
  await page.keyboard.down('j')
  await page.waitForTimeout(150)
  await page.keyboard.up('j')
  await expect.poll(() => eventNames(page)).toContain('player_jump')

  await page.evaluate(() => {
    const scene = window.riseGame.scene.getScene('GameScene')
    const item = scene.items.find(item => item.type === 'melee')
    scene.player.body.reset(item.image.x, item.image.y)
  })
  await expect.poll(() => eventNames(page)).toContain('item_collected')
  await press(page, 'k')
  await expect.poll(() => eventNames(page)).toContain('player_attack')
  await page.screenshot({ path: testInfo.outputPath('rise-desert.png') })

  await page.evaluate(() => window.riseGame.scene.getScene('GameScene').player.damage(200, 'test_enemy'))
  await page.waitForFunction(() => window.riseGame.scene.isActive('DeathScene'))
  const failed = await eventNames(page)
  expect(failed.filter(name => name === 'player_died')).toHaveLength(1)
  expect(failed.filter(name => name === 'level_failed')).toHaveLength(1)
  await page.waitForFunction(() => window.riseGame.scene.getScene('DeathScene').prevState.startKey === false)
  await press(page, 'Enter')
  await page.waitForFunction(() => window.riseGame.scene.isActive('GameScene'))
  const snapshot = await page.evaluate(() => window.riseTelemetry.snapshot())
  const starts = snapshot.entries.filter(entry => entry.name === 'level_started')
  expect(starts.map(entry => entry.properties.attempt)).toEqual([1, 2])
  expect(new Set(starts.map(entry => entry.session_id)).size).toBe(1)
  const samples = snapshot.entries.filter(entry => entry.type === 'entity' && entry.entity.properties.active)
  expect(samples.some(entry => entry.entity.entity_type === 'player')).toBe(true)
  expect(samples.some(entry => entry.entity.entity_type === 'enemy')).toBe(true)
  expect(samples.some(entry => entry.entity.entity_type === 'boss')).toBe(true)
  for (const entry of samples) {
    expect(Number.isFinite(entry.entity.position.x)).toBe(true)
    expect(Number.isFinite(entry.entity.position.y)).toBe(true)
  }
  expect(errors).toEqual([])
})

test('all three levels load, map tiles align, bosses finish the run, and narrow screens retain a canvas', async ({ page }, testInfo) => {
  const errors = await openGame(page)
  for (const stage of ['desert', 'desertForest', 'forest']) {
    await page.waitForFunction(stage => {
      const scene = window.riseGame.scene.getScene('GameScene')
      return scene.sys.isActive() && scene.stage === stage && !scene.goingNext
    }, stage)
    const geometry = await page.evaluate(() => {
      const scene = window.riseGame.scene.getScene('GameScene')
      return { x: scene.contactLayer.x, y: scene.contactLayer.y, width: scene.map.widthInPixels, height: scene.map.heightInPixels }
    })
    expect(geometry.x).toBe(0)
    expect(geometry.y).toBe(30)
    expect(geometry.width).toBe(480)
    await page.screenshot({ path: testInfo.outputPath(`${stage}.png`) })
    await page.evaluate(() => {
      const scene = window.riseGame.scene.getScene('GameScene')
      scene.player.body.allowGravity = false
      for (const enemy of [...scene.bossGroup.getChildren(), ...scene.pestGroup.getChildren()]) enemy.damage(10000)
    })
    await page.waitForFunction(() => window.riseGame.scene.isActive('IntermediateScene'))
    if (stage !== 'forest') {
      await page.waitForFunction(() => window.riseGame.scene.getScene('IntermediateScene').prevState.startKey === false)
      await press(page, 'Enter')
    }
  }
  const snapshot = await page.evaluate(() => window.riseTelemetry.snapshot())
  expect(snapshot.entries.filter(entry => entry.name === 'level_completed').map(entry => entry.properties.level_id)).toEqual(['desert', 'desertForest', 'forest'])
  expect(snapshot.entries.filter(entry => entry.name === 'run_completed')).toHaveLength(1)
  expect(snapshot.entries.filter(entry => entry.type === 'session_ended')).toHaveLength(1)
  expect(errors).toEqual([])
  await page.setViewportSize({ width: 375, height: 667 })
  // Phaser resizes the canvas after the window's resize event, not at once.
  await expect.poll(async () => (await page.locator('canvas').boundingBox()).width).toBeLessThanOrEqual(375)
  expect((await page.locator('canvas').boundingBox()).width).toBeGreaterThan(0)
})
