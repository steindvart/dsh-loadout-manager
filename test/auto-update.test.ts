import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { AUTO_UPDATE_INTERVAL_MS, registerAutoUpdate } from '../src/host/auto-update.ts'
import type { Operations } from '../src/host/operations.ts'

/** Let the `void run()` pass finish its microtasks and one macrotask. */
const flush = (): Promise<void> => new Promise(resolve => { setImmediate(resolve) })

function harness(results: Array<'ok' | 'fail'> = []) {
  const flag = { value: false }
  const ref: Volatile<boolean> = { get: () => flag.value }
  let calls = 0
  let failures = 0
  const operations = {
    async autoUpdate() {
      calls += 1
      const next = results.shift() ?? 'ok'
      if (next === 'fail') {
        failures += 1
        throw new Error('source unavailable')
      }
      return { refreshed: 1, updated: 0, skipped: 0 }
    },
  } as unknown as Operations
  let volatileListener: (() => void) | undefined
  const disposers: Array<() => void> = []
  const ctx = {
    on(event: string, listener: () => void) {
      if (event === 'loader/volatile-update') volatileListener = listener
      return () => {}
    },
    effect(setup: () => () => void) {
      disposers.push(setup())
      return () => {}
    },
    logger: { info() {}, warn() {} },
  } as unknown as Context
  return {
    flag,
    ref,
    operations,
    ctx,
    calls: () => calls,
    failures: () => failures,
    fireVolatile: () => { volatileListener?.() },
    dispose: () => { for (const dispose of disposers) dispose() },
  }
}

test('the switch off by default runs nothing; turning it on runs one pass and starts the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const h = harness()
  t.after(() => { h.dispose(); t.mock.timers.reset() })
  registerAutoUpdate(h.ctx, h.operations, h.ref)
  await flush()
  assert.equal(h.calls(), 0, 'off by default: no pass')

  h.flag.value = true
  h.fireVolatile()
  await flush()
  assert.equal(h.calls(), 1, 'turning it on runs a pass immediately')

  t.mock.timers.tick(AUTO_UPDATE_INTERVAL_MS)
  await flush()
  assert.equal(h.calls(), 2, 'and every interval afterwards')

  h.flag.value = false
  h.fireVolatile()
  t.mock.timers.tick(AUTO_UPDATE_INTERVAL_MS * 3)
  await flush()
  assert.equal(h.calls(), 2, 'turning it off stops the interval')
})

test('a switch already on at load runs one pass without waiting for the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const h = harness()
  t.after(() => { h.dispose(); t.mock.timers.reset() })
  h.flag.value = true
  registerAutoUpdate(h.ctx, h.operations, h.ref)
  await flush()
  assert.equal(h.calls(), 1)
})

test('a failing pass is logged and the interval keeps running', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const h = harness(['fail', 'ok'])
  t.after(() => { h.dispose(); t.mock.timers.reset() })
  h.flag.value = true
  registerAutoUpdate(h.ctx, h.operations, h.ref)
  await flush()
  assert.equal(h.failures(), 1, 'the failure was caught, not thrown')

  t.mock.timers.tick(AUTO_UPDATE_INTERVAL_MS)
  await flush()
  assert.equal(h.calls(), 2, 'the next interval still runs a pass')
})

test('disposing the plugin clears the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const h = harness()
  t.after(() => t.mock.timers.reset())
  h.flag.value = true
  registerAutoUpdate(h.ctx, h.operations, h.ref)
  await flush()
  assert.equal(h.calls(), 1)

  h.dispose()
  t.mock.timers.tick(AUTO_UPDATE_INTERVAL_MS * 3)
  await flush()
  assert.equal(h.calls(), 1, 'no pass after dispose')
})
