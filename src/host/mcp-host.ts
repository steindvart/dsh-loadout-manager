/**
 * MCP servers of the running Host, read from `ctx.mcpManager`, and the
 * workspace hiding of their tools. Global switching goes through
 * `ctx.settings.mutate`, the path DSH's own Settings form takes, so it obeys
 * the same validation and higher-layer overrides.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import type { McpProbeView, McpServerView } from '../shared/api.ts'
import type { Homes } from './inventory.ts'
import { readLevels } from './inventory.ts'
import { mcpEnabled, type Loadout } from './loadout.ts'
import { deniedTools, statusView, toolsByServer } from './mcp.ts'
import { findProjectRoot } from './paths.ts'
import { cwdOf, messageOf } from './shadow.ts'

const MANAGER_PACKAGE = '@deepseek-ai/dsh-mcp-manager'

export class McpUnavailableError extends Error {}

/** Servers in the manager's order, with their tools; `undefined` without an MCP manager. */
export function readMcpServers(ctx: Context, projectLoadout?: Loadout): McpServerView[] | undefined {
  const manager = ctx.get('mcpManager')
  if (manager === undefined) return undefined
  const configured = manager.config.servers.get()
  const views = manager.list().filter(view => view.configured)
  const tools = (ctx.get('tools')?.definitions() ?? []).filter(tool => tool.name.startsWith('mcp__'))
  const grouped = toolsByServer(views.map(view => view.name), tools)
  return views.map((view): McpServerView => {
    const entry = configured[view.name]
    const endpoint = entry === undefined
      ? undefined
      : entry.transport === 'stdio' ? [entry.command, ...entry.args].join(' ') : entry.url
    return {
      name: view.name,
      source: entry === undefined ? 'plugin' : 'profile',
      ...entry !== undefined ? { transport: entry.transport } : {},
      ...endpoint !== undefined && endpoint !== '' ? { endpoint } : {},
      enabled: entry === undefined ? true : entry.enabled,
      ...projectLoadout !== undefined ? { hidden: !mcpEnabled(projectLoadout, view.name) } : {},
      status: statusView(view.status),
      tools: view.status.state === 'connected' ? grouped.get(view.name) ?? [] : [],
    }
  })
}

/** Start or stop a profile server: the same write DSH Settings makes. */
export async function setMcpEnabled(ctx: Context, name: string, enabled: boolean): Promise<string> {
  const manager = ctx.get('mcpManager')
  const settings = ctx.get('settings')
  const entry = ctx.get('configEditor')?.entries().find(row => row.options.name === MANAGER_PACKAGE)
  if (manager === undefined || settings === undefined || entry === undefined) {
    throw new McpUnavailableError('MCP servers cannot be switched in this profile')
  }
  if (!Object.hasOwn(manager.config.servers.get(), name)) {
    throw new McpUnavailableError(`"${name}" is registered by a plugin; disable that plugin to stop it`)
  }
  await settings.mutate(entry.options.id, [{ op: 'set', path: ['servers', name, 'enabled'], value: enabled }])
  return ctx.get('configEditor')?.documentPath ?? 'profile settings'
}

export async function restartMcp(ctx: Context, name: string): Promise<void> {
  const manager = ctx.get('mcpManager')
  if (manager === undefined) throw new McpUnavailableError('this profile has no MCP manager')
  await manager.restart(name)
}

/** A separate test connection: lists the server's tools even while it is stopped. */
export async function probeMcp(ctx: Context, name: string): Promise<McpProbeView> {
  const manager = ctx.get('mcpManager')
  if (manager === undefined) throw new McpUnavailableError('this profile has no MCP manager')
  const result = await manager.probe(name, { timeoutMs: 10_000 })
  if (!result.ok) return { ok: false, stage: result.stage, message: result.message, durationMs: result.durationMs }
  return {
    ok: true,
    ...result.serverInfo !== undefined ? { serverName: result.serverInfo.name, serverVersion: result.serverInfo.version } : {},
    tools: result.toolNames,
    truncated: result.truncated,
    durationMs: result.durationMs,
  }
}

interface Restriction {
  key: string
  dispose(): void
}

/**
 * Hide the tools of servers the project `loadout.json` turns off from the
 * agents working in that project. Re-evaluated before every step, because a
 * server's tool list changes while it reconnects.
 */
export function registerMcpRestrictions(ctx: Context, homes: Homes): void {
  const applied = new Map<Agent, Restriction>()
  const lift = (agent: Agent): void => {
    const current = applied.get(agent)
    applied.delete(agent)
    try {
      current?.dispose()
    } catch (error) {
      ctx.logger.warn(`dsh-loadout: could not lift an MCP restriction: ${messageOf(error)}`)
    }
  }

  ctx.effect(() => () => {
    for (const agent of [...applied.keys()]) lift(agent)
  }, 'dsh-loadout: MCP restrictions')
  ctx.on('agent/disposed', ({ agent }) => { lift(agent) })

  // The catalog of the first step is built when the agent is created, so the
  // restriction must be in place before that. `agent/created` listeners are
  // awaited before creation resolves (see dsh-agent runtime-types).
  ctx.on('agent/created', ({ agent, signal }) => {
    void sync(agent, signal ?? new AbortController().signal).catch(error => {
      ctx.logger.warn(`dsh-loadout: MCP servers were not hidden for this agent: ${messageOf(error)}`)
    })
    return undefined
  })

  // The working directory can move between steps; re-evaluate then. Also
  // catches a server's tool list changing while it reconnects.
  ctx.on('agent/pre-step', async (event, next) => {
    try {
      await sync(event.agent, event.signal)
    } catch (error) {
      ctx.logger.warn(`dsh-loadout: MCP servers were not hidden for this step: ${messageOf(error)}`)
    }
    return next()
  })

  async function sync(agent: Agent, signal: AbortSignal): Promise<void> {
    const manager = ctx.get('mcpManager')
    const cwd = manager === undefined ? undefined : await cwdOf(ctx, agent, signal)
    const projectRoot = cwd === undefined ? undefined : await findProjectRoot(cwd)
    const project = projectRoot === undefined ? undefined : (await readLevels({ ...homes, projectRoot })).project
    const servers = manager?.list().map(view => view.name) ?? []
    const hidden = project === undefined ? [] : servers.filter(name => !mcpEnabled(project.loadout, name))
    const deny = deniedTools(hidden, servers, ctx.get('tools')?.definitions() ?? [])
    const key = deny.join('\n')
    if (applied.get(agent)?.key === key) return
    lift(agent)
    if (deny.length === 0) return
    const tools = agent.ctx.get('tools')
    if (tools === undefined) return
    applied.set(agent, { key, dispose: tools.restrict({ deny }) })
  }
}
