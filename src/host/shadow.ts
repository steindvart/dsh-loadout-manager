/**
 * Skill shadowing in each Agent's own registry layer. DSH mounts
 * `skill-filesystem` inside every preset, and a nearer layer replaces a
 * same-named skill outright, so the shadow must live in the Agent layer.
 * Originals are read from the registry with the Agent's preset scope, whose
 * chain excludes the Agent layer.
 *
 * Services come through `ctx.get()`: property access (`ctx.skills`) throws
 * without an `inject` declaration, and a throwing `agent/created` listener
 * fails agent creation.
 */

import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type {} from '@deepseek-ai/dsh-working-directory'
import { readLevels, shadowsFor, type Homes } from './inventory.ts'
import { findProjectRoot } from './paths.ts'
import { PLUGIN_NAME } from '../shared/identity.ts'

export const PROVIDER_NAME = PLUGIN_NAME

export interface Shadows {
  /** Re-read `loadout.json` in every live agent before its next step. */
  invalidateAll(): void
}

interface ProviderEntry {
  control: SkillProviderControl | undefined
  dispose(): void
}

/** Registers a shadow provider on every agent, current and future. */
export function registerShadows(ctx: Context, homes: Homes): Shadows {
  const providers = new Map<Agent, ProviderEntry>()
  const seen = new Map<string, number>()

  ctx.effect(() => () => {
    for (const entry of providers.values()) entry.dispose()
    providers.clear()
  }, 'dsh-loadout-manager: shadow providers')

  function attach(agent: Agent): void {
    if (ctx.get('skills') === undefined || providers.has(agent)) return
    // `get()` binds the service to agent.ctx, so the registry files the provider under the Agent's scope.
    const skills = agent.ctx.get('skills')
    if (skills === undefined) return
    const entry: ProviderEntry = { control: undefined, dispose: () => {} }
    const disposer = skills.registerProvider((control) => {
      entry.control = control
      return createProvider(ctx, agent, homes)
    })
    let disposed = false
    entry.dispose = () => {
      if (disposed) return
      disposed = true
      providers.delete(agent)
      void Promise.resolve(disposer()).catch(() => {})
    }
    providers.set(agent, entry)
  }

  function safeAttach(agent: Agent): void {
    try {
      attach(agent)
    } catch (error) {
      ctx.logger.warn(`dsh-loadout-manager: skill states are not applied to this agent: ${messageOf(error)}`)
    }
  }

  ctx.on('agent/created', ({ agent }) => {
    safeAttach(agent)
    return undefined
  })
  // Agents that were already live when the plugin activated (installation through HMR).
  for (const agent of ctx.get('agents')?.list() ?? []) safeAttach(agent)

  ctx.on('agent/disposed', ({ agent }) => {
    providers.get(agent)?.dispose()
  })

  // loadout.json edited outside the panel and the tool: compare mtimes before each step.
  ctx.on('agent/pre-step', async (event, next) => {
    const entry = providers.get(event.agent)
    if (entry?.control !== undefined) {
      try {
        const cwd = await cwdOf(ctx, event.agent, event.signal)
        const projectRoot = cwd === undefined ? undefined : await findProjectRoot(cwd)
        const paths = [`${homes.agentsHome}/loadout.json`]
        if (projectRoot !== undefined) paths.push(`${projectRoot}/.agents/loadout.json`)
        for (const path of paths) {
          const mtime = await mtimeOf(path)
          if (seen.has(path) && seen.get(path) !== mtime) invalidateAll()
          seen.set(path, mtime)
        }
      } catch (error) {
        ctx.logger.warn(`dsh-loadout-manager: loadout.json check failed: ${messageOf(error)}`)
      }
    }
    return next()
  })

  function invalidateAll(): void {
    for (const { control } of providers.values()) control?.invalidate()
  }

  return { invalidateAll }
}

function createProvider(ctx: Context, agent: Agent, homes: Homes): SkillProvider {
  return {
    name: PROVIDER_NAME,
    async list(options: SkillLookupOptions): Promise<SkillCandidate[]> {
      const registry = ctx.get('skills')
      if (registry === undefined) return []
      const cwd = options.cwd
      const winners = await withPresetScope(ctx, agent, scope => registry.list({ cwd, signal: options.signal, scope }))
      const projectRoot = cwd === undefined ? undefined : await findProjectRoot(cwd)
      const levels = await readLevels({ ...homes, projectRoot })
      const shadows = shadowsFor(winners.filter(summary => summary.provider !== PROVIDER_NAME), {
        global: levels.global.loadout,
        project: levels.project?.loadout,
      })
      return shadows.map(shadow => ({ ...shadow, provider: PROVIDER_NAME, rank: 0, locator: { name: shadow.name } }))
    },
    async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
      if (!candidate.invocation.userInvocable && !candidate.invocation.modelInvocable) return undefined
      const registry = ctx.get('skills')
      if (registry === undefined) return undefined
      const original = await withPresetScope(ctx, agent, scope =>
        registry.get(candidate.name, { cwd: options.cwd, signal: options.signal, scope }))
      if (original === undefined) return undefined
      return { ...original, invocation: candidate.invocation, provider: PROVIDER_NAME }
    },
  }
}

/** Run `read` with the registry scope of the Agent's preset revision; `undefined` scope reads the global layer. */
export async function withPresetScope<T>(ctx: Context, agent: Agent | undefined, read: (scope: ScopeKey | undefined) => Promise<T>): Promise<T> {
  const presets = ctx.get('agentPresets')
  const id = agent === undefined ? undefined : presets?.composedPreset(agent.ctx)
  if (presets === undefined || (agent !== undefined && id === undefined)) return read(undefined)
  const lease = await presets.acquireScope(id)
  try {
    return await read(lease.key)
  } finally {
    await lease[Symbol.asyncDispose]()
  }
}

export async function cwdOf(ctx: Context, agent: Agent, signal?: AbortSignal): Promise<string | undefined> {
  const workingDirectory = ctx.get('workingDirectory')
  if (workingDirectory === undefined) return undefined
  return workingDirectory.ensure(agent, signal)
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function mtimeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return 0
  }
}
