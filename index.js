/**
 * dsh-loadout Host half: skill shadowing in each agent's layer, rule
 * injection next to AGENTS.md, and the operations the settings page and the
 * `loadout` tool call. Wiring only; behaviour lives in ./src/host.
 */

import { createOperations } from './src/host/operations.js'
import { resolveHomes } from './src/host/paths.js'
import { registerRoutes } from './src/host/routes.js'
import { registerRuleContext } from './src/host/rules-context.js'
import { registerShadows } from './src/host/shadow.js'
import { loadoutTool } from './src/host/tool.js'

export const name = 'dsh-loadout'

const DEFAULT_MAX_BYTES = 65536

export function apply(ctx, config = {}) {
  const maxBytes = readMaxBytes(config)
  const homes = resolveHomes(ctx)
  const shadows = registerShadows(ctx, homes)
  if (maxBytes > 0) registerRuleContext(ctx, homes, { maxBytes })
  const operations = createOperations(ctx, homes, { invalidate: () => shadows.invalidateAll() })
  registerRoutes(ctx, operations)
  ctx.inject(['tools'], (scoped) => {
    scoped.effect(() => scoped.tools.register(loadoutTool(ctx, operations)), 'dsh-loadout: loadout tool')
  })
}

function readMaxBytes(config) {
  const value = config?.maxBytes
  if (value === undefined) return DEFAULT_MAX_BYTES
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('dsh-loadout: config.maxBytes must be a finite number')
  }
  return Math.trunc(value)
}
