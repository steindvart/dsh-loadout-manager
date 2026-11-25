/**
 * MCP servers as the Loadout Manager page sees them: which global tools belong to
 * which server, which tools a workspace hides, and the status reduced to
 * what the page shows. Pure: callers pass the manager's data in.
 */

import type { McpManagedServerStatus } from '@deepseek-ai/dsh-mcp-manager'
import type { McpStatusView, McpToolView } from '../shared/api.ts'

export interface ToolLike {
  readonly name: string
  readonly description: string
}

const prefixOf = (server: string): string => `mcp__${server}__`

/**
 * Global tools grouped by MCP server. A tool belongs to the longest server
 * name whose `mcp__<server>__` prefix it carries, so `a__b` keeps its tools
 * from `a`.
 */
export function toolsByServer(servers: readonly string[], tools: readonly ToolLike[]): Map<string, McpToolView[]> {
  const byLength = [...servers].sort((a, b) => b.length - a.length)
  const grouped = new Map<string, McpToolView[]>()
  for (const tool of tools) {
    const server = byLength.find(name => tool.name.startsWith(prefixOf(name)))
    if (server === undefined) continue
    const list = grouped.get(server) ?? []
    list.push({ name: tool.name, title: tool.name.slice(prefixOf(server).length), description: tool.description })
    grouped.set(server, list)
  }
  return grouped
}

/** Current tool names of the hidden servers, the deny list for `ctx.tools.restrict`. */
export function deniedTools(hidden: readonly string[], servers: readonly string[], tools: readonly ToolLike[]): string[] {
  const grouped = toolsByServer(servers, tools)
  return hidden.flatMap(server => grouped.get(server)?.map(item => item.name) ?? []).sort()
}

export function statusView(status: McpManagedServerStatus): McpStatusView {
  switch (status.state) {
    case 'connected': return { state: 'connected', toolCount: status.toolCount }
    case 'connecting': return { state: 'connecting', attempt: status.attempt }
    case 'reconnecting': return { state: 'reconnecting', attempt: status.attempt, maxAttempts: status.maxAttempts, error: status.lastError }
    case 'waiting-credentials': return { state: 'waiting-credentials', error: status.lastError }
    case 'disabled': return { state: 'disabled' }
    case 'closed': return { state: 'closed' }
    case 'failed': {
      const error = status.reason === 'cleanup' ? status.result.cleanupError : status.lastError
      return { state: 'failed', reason: status.reason, ...error !== undefined ? { error } : {} }
    }
  }
}
