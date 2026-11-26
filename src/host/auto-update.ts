/**
 * Periodic auto-update of artifacts installed from indexes. While the
 * `autoUpdate` switch is on, the plugin refreshes its index sources and
 * updates the installed skills and rules whose source published newer
 * content, once when the switch turns on and then every
 * `AUTO_UPDATE_INTERVAL_MS`. Locally modified copies and copies installed
 * from another index are never touched; only the global level is known to
 * the Host, so project installs stay manual.
 *
 * The switch is a volatile config field: Settings changes it in place and
 * the Loader emits `loader/volatile-update`, so the timer starts or stops
 * without the plugin remounting.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Operations } from './operations.ts'
import { messageOf } from './shadow.ts'

export const AUTO_UPDATE_INTERVAL_MS = 30 * 60 * 1000

/** Follow the switch for the plugin's lifetime: start, stop, and run on turn-on. */
export function registerAutoUpdate(ctx: Context, operations: Operations, enabled: Volatile<boolean>): void {
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  async function run(): Promise<void> {
    if (running) return
    running = true
    try {
      const result = await operations.autoUpdate()
      if (result.updated > 0 || result.skipped > 0) {
        ctx.logger.info(`dsh-loadout-manager: auto-update refreshed ${result.refreshed} source(s), updated ${result.updated}, skipped ${result.skipped}`)
      }
    } catch (error) {
      ctx.logger.warn(`dsh-loadout-manager: auto-update failed: ${messageOf(error)}`)
    } finally {
      running = false
    }
  }

  function sync(): void {
    if (enabled.get() === true) {
      if (timer !== undefined) return
      timer = setInterval(() => { void run() }, AUTO_UPDATE_INTERVAL_MS)
      void run()
      return
    }
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  sync()
  ctx.on('loader/volatile-update', () => { sync() })
  ctx.effect(() => () => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }, 'dsh-loadout-manager: auto-update timer')
}
