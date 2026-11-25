/**
 * dsh-loadout-manager Host half: skill shadowing in each agent's layer, rule
 * injection next to AGENTS.md, and the operations the Loadout Manager page and the
 * `loadout` tool call. Wiring only; behaviour lives in ./host.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { createOperations } from './host/operations.ts'
import { resolveHomes } from './host/paths.ts'
import { registerMcpRestrictions } from './host/mcp-host.ts'
import { registerRoutes } from './host/routes.ts'
import { registerRuleContext } from './host/rules-context.ts'
import { registerShadows } from './host/shadow.ts'
import { loadoutTool } from './host/tool.ts'

export const name = 'dsh-loadout-manager'

export interface Config {
  /** UTF-8 byte budget of one rules message; `0` turns rule injection off. Default 65536. */
  maxBytes?: number
}

const DEFAULT_MAX_BYTES = 65536

export function apply(ctx: Context, config: Config = {}): void {
  const maxBytes = readMaxBytes(config)
  const homes = resolveHomes(ctx)
  const shadows = registerShadows(ctx, homes)
  if (maxBytes > 0) registerRuleContext(ctx, homes, { maxBytes })
  registerMcpRestrictions(ctx, homes)
  const operations = createOperations(ctx, homes, { invalidate: () => shadows.invalidateAll() })
  registerRoutes(ctx, operations)
  ctx.inject(['tools'], (scoped) => {
    scoped.effect(() => scoped.tools.register(loadoutTool(ctx, operations)), 'dsh-loadout-manager: loadout tool')
  })
}

function readMaxBytes(config: Config): number {
  const value = config.maxBytes
  if (value === undefined) return DEFAULT_MAX_BYTES
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('dsh-loadout-manager: config.maxBytes must be a finite number')
  }
  return Math.trunc(value)
}
