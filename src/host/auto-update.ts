/**
 * Periodic auto-update of artifacts installed from indexes. When enabled, the
 * plugin refreshes its index sources and updates the installed skills and
 * rules whose source published newer content, once at startup and then every
 * `AUTO_UPDATE_INTERVAL_MS`. Locally modified copies and copies installed
 * from another index are never touched; only the global level is known to the
 * Host, so project installs stay manual.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Operations } from './operations.ts'
import { messageOf } from './shadow.ts'

export const AUTO_UPDATE_INTERVAL_MS = 30 * 60 * 1000

/** Start the timer and run one pass immediately. */
export function registerAutoUpdate(ctx: Context, operations: Operations): void {
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

  void run()
  const timer = setInterval(() => { void run() }, AUTO_UPDATE_INTERVAL_MS)
  ctx.effect(() => () => { clearInterval(timer) }, 'dsh-loadout-manager: auto-update timer')
}
