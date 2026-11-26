/**
 * dsh-loadout-manager Host half: skill shadowing in each agent's layer, rule
 * injection next to AGENTS.md, and the operations the Loadout Manager page and the
 * `loadout` tool call. Wiring only; behaviour lives in ./host.
 */

import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { registerAutoUpdate } from './host/auto-update.ts'
import { createOperations } from './host/operations.ts'
import { resolveHomes } from './host/paths.ts'
import { registerMcpRestrictions } from './host/mcp-host.ts'
import { registerRoutes } from './host/routes.ts'
import { registerRuleContext } from './host/rules-context.ts'
import { registerShadows } from './host/shadow.ts'
import { loadoutTool } from './host/tool.ts'
import { PLUGIN_NAME } from './shared/identity.ts'

export const name = PLUGIN_NAME

const DEFAULT_MAX_BYTES = 65536

export interface Config {
  /** UTF-8 byte budget of one rules message; `0` turns rule injection off. Default 65536. */
  maxBytes?: number
  /** Refresh indexes and update installed skills and rules on a timer. Default false. */
  autoUpdate?: boolean
}

/** Settings schema: the fields below appear in the plugin's Settings page. */
export const Config = z.object({
  maxBytes: z.number().default(DEFAULT_MAX_BYTES).description('UTF-8 byte budget of one rules message; 0 turns rule injection off.'),
  autoUpdate: z.boolean().default(false).description('Refresh indexes and update installed skills and rules every 30 minutes. Local edits and project installs are left alone.'),
})

export function apply(ctx: Context, config: Config = {}): void {
  const maxBytes = readMaxBytes(config)
  const autoUpdate = readAutoUpdate(config)
  const homes = resolveHomes(ctx)
  const shadows = registerShadows(ctx, homes)
  if (maxBytes > 0) registerRuleContext(ctx, homes, { maxBytes })
  registerMcpRestrictions(ctx, homes)
  const operations = createOperations(ctx, homes, { invalidate: () => shadows.invalidateAll() })
  registerRoutes(ctx, operations)
  ctx.inject(['tools'], (scoped) => {
    scoped.effect(() => scoped.tools.register(loadoutTool(ctx, operations)), 'dsh-loadout-manager: loadout tool')
  })
  if (autoUpdate) registerAutoUpdate(ctx, operations)
}

function readMaxBytes(config: Config): number {
  const value = config.maxBytes
  if (value === undefined) return DEFAULT_MAX_BYTES
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('dsh-loadout-manager: config.maxBytes must be a finite number')
  }
  return Math.trunc(value)
}

function readAutoUpdate(config: Config): boolean {
  return config.autoUpdate === true
}
