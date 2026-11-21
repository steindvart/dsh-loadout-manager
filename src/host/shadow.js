/**
 * Skill shadowing in each Agent's own registry layer. DSH mounts
 * `skill-filesystem` inside every preset, and a nearer layer replaces a
 * same-named skill outright, so the shadow must live in the Agent layer.
 * Originals are read from the registry with the Agent's preset scope, whose
 * chain excludes the Agent layer.
 */

import { stat } from 'node:fs/promises'
import { readLevels, shadowsFor } from './inventory.js'
import { findProjectRoot } from './paths.js'

export const PROVIDER_NAME = 'dsh-loadout'

/**
 * @param {object} ctx - plugin root context
 * @param {{ dshHome: string, agentsHome: string }} homes
 * @returns {{ invalidateAll(): void }}
 */
export function registerShadows(ctx, homes) {
  const providers = new Map()
  const seen = new Map()

  ctx.effect(() => () => {
    for (const entry of providers.values()) entry.dispose()
    providers.clear()
  }, 'dsh-loadout: shadow providers')

  ctx.on('agent/created', ({ agent }) => {
    if (ctx.get('skills') === undefined || providers.has(agent)) return
    // Through agent.ctx, so the registry files the provider under the Agent's scope.
    const skills = agent.ctx.skills
    const entry = { control: undefined, dispose: () => {} }
    const disposer = skills.registerProvider((control) => {
      entry.control = control
      return createProvider(ctx, agent, homes)
    })
    let disposed = false
    entry.dispose = () => {
      if (disposed) return
      disposed = true
      providers.delete(agent)
      if (typeof disposer === 'function') void Promise.resolve(disposer()).catch(() => {})
    }
    providers.set(agent, entry)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    providers.get(agent)?.dispose()
  })

  // loadout.json edited outside the panel and the tool: compare mtimes before each step.
  ctx.on('agent/pre-step', async (event, next) => {
    const entry = providers.get(event.agent)
    if (entry?.control !== undefined) {
      try {
        const cwd = await cwdOf(ctx, event.agent, event.signal)
        const levels = { agentsHome: homes.agentsHome, projectRoot: cwd === undefined ? undefined : await findProjectRoot(cwd) }
        const paths = [`${levels.agentsHome}/loadout.json`]
        if (levels.projectRoot !== undefined) paths.push(`${levels.projectRoot}/.agents/loadout.json`)
        for (const path of paths) {
          const mtime = await mtimeOf(path)
          if (seen.has(path) && seen.get(path) !== mtime) invalidateAll()
          seen.set(path, mtime)
        }
      } catch (error) {
        ctx.logger?.warn?.(`dsh-loadout: loadout.json check failed: ${error?.message ?? error}`)
      }
    }
    return next()
  })

  function invalidateAll() {
    for (const { control } of providers.values()) control?.invalidate()
  }

  return { invalidateAll }
}

function createProvider(ctx, agent, homes) {
  return {
    name: PROVIDER_NAME,
    async list(options) {
      const cwd = options.cwd
      const winners = await withPresetScope(ctx, agent, scope =>
        ctx.skills.list({ cwd, signal: options.signal, scope }))
      const projectRoot = cwd === undefined ? undefined : await findProjectRoot(cwd)
      const levels = await readLevels({ ...homes, projectRoot })
      const shadows = shadowsFor(winners.filter(isFromOtherProvider), {
        global: levels.global.loadout,
        project: levels.project?.loadout,
      })
      return shadows.map(shadow => ({ ...shadow, provider: PROVIDER_NAME, rank: 0, locator: { name: shadow.name } }))
    },
    async get(candidate, options) {
      if (!candidate.invocation.userInvocable && !candidate.invocation.modelInvocable) return undefined
      const original = await withPresetScope(ctx, agent, scope =>
        ctx.skills.get(candidate.name, { cwd: options.cwd, signal: options.signal, scope }))
      if (original === undefined) return undefined
      return { ...original, invocation: candidate.invocation, provider: PROVIDER_NAME }
    },
  }
}

function isFromOtherProvider(summary) {
  return summary.provider !== PROVIDER_NAME
}

/** Run `read` with the registry scope of the Agent's preset revision; `undefined` scope reads the global layer. */
export async function withPresetScope(ctx, agent, read) {
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

export async function cwdOf(ctx, agent, signal) {
  const workingDirectory = ctx.get('workingDirectory')
  if (workingDirectory === undefined) return undefined
  return workingDirectory.ensure(agent, signal)
}

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return 0
  }
}
