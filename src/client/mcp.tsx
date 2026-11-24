/** One MCP server row: status, switch, tools, check, and restart. */

import { useState, type ReactNode } from 'react'
import type { McpProbeView, McpServerView, McpStatusView } from '../shared/api.ts'
import { call, messageOf } from './api.ts'
import { Switch, type T } from './controls.tsx'
import type { Scope } from './items.tsx'
import css from './Loadout.module.css'

type Tone = 'ok' | 'busy' | 'bad' | 'idle'

function toneOf(status: McpStatusView): Tone {
  switch (status.state) {
    case 'connected': return 'ok'
    case 'connecting':
    case 'reconnecting': return 'busy'
    case 'failed':
    case 'waiting-credentials': return 'bad'
    case 'closed':
    case 'disabled': return 'idle'
  }
}

function statusLabel(t: T, status: McpStatusView): string {
  switch (status.state) {
    case 'connected': return t('mcpState.connected', { count: status.toolCount })
    case 'reconnecting': return t('mcpState.reconnecting', { attempt: status.attempt, max: status.maxAttempts })
    default: return t(`mcpState.${status.state}`)
  }
}

/** Servers still settling: the page re-reads them until they connect or fail. */
export function isSettling(server: McpServerView): boolean {
  return server.enabled && (server.status.state === 'connecting' || server.status.state === 'reconnecting')
}

export function McpRow({ t, scope, locked, reload, server }: {
  t: T
  scope: Scope
  locked: boolean
  reload(): Promise<void>
  server: McpServerView
}): ReactNode {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [showTools, setShowTools] = useState(false)
  const [probe, setProbe] = useState<McpProbeView | 'running' | undefined>(undefined)
  const project = scope.level === 'project'
  const { status } = server
  const statusError = 'error' in status ? status.error : undefined

  const run = async (operation: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await operation()
      await reload()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  const onProbe = async (): Promise<void> => {
    setProbe('running')
    setError(undefined)
    try {
      setProbe(await call('mcp-probe', { name: server.name }))
    } catch (failure) {
      setProbe(undefined)
      setError(messageOf(failure))
    }
  }

  const checked = project ? server.hidden !== true : server.enabled
  const switchable = project || server.source === 'profile'
  const target = scope.workspacePath === undefined ? {} : { workspacePath: scope.workspacePath }

  return (
    <div className={css.row} data-state={checked && server.enabled ? 'on' : 'off'}>
      <div className={css.rowLine}>
        <div className={css.rowMain}>
          <div className={css.name}>
            {server.name}
            <span className={css.mcpStatus} data-tone={toneOf(status)}>{statusLabel(t, status)}</span>
            {server.transport !== undefined ? <span className={css.badge}>{server.transport}</span> : null}
          </div>
          {server.endpoint !== undefined ? <div className={css.mono} title={server.endpoint}>{server.endpoint}</div> : null}
          {server.source === 'plugin' ? <div className={css.desc}>{t('mcpPluginOwned')}</div> : null}
          {project && !server.enabled ? <div className={css.desc}>{t('mcpOffGlobally')}</div> : null}
          {statusError !== undefined ? <div className={css.error}>{statusError}</div> : null}
        </div>
        <div className={css.controls}>
          {server.tools.length > 0
            ? (
              <button type="button" className={css.btn} aria-expanded={showTools} onClick={() => { setShowTools(!showTools) }}>
                {t('mcpTools', { count: server.tools.length })}
              </button>
            )
            : null}
          <button type="button" className={css.btn} disabled={probe === 'running'} onClick={() => { void onProbe() }}>
            {probe === 'running' ? t('mcpProbing') : t('mcpProbe')}
          </button>
          {!project && server.enabled
            ? (
              <button type="button" className={css.btn} disabled={busy} onClick={() => { void run(() => call('mcp-restart', { name: server.name })) }}>
                {t('mcpRestart')}
              </button>
            )
            : null}
          <Switch
            t={t}
            checked={checked}
            label={project ? (checked ? t('mcpUsedHere') : t('mcpHiddenHere')) : (checked ? t('mcpServerOn') : t('mcpServerOff'))}
            disabled={busy || locked || !switchable}
            onChange={enabled => { void run(() => call('mcp-set', { ...target, name: server.name, enabled })) }}
          />
        </div>
      </div>
      {error !== undefined ? <div className={css.error} role="alert">{error}</div> : null}
      {showTools
        ? (
          <ul className={css.toolList}>
            {server.tools.map(tool => (
              <li key={tool.name} className={css.tool}>
                <span className={css.toolName}>{tool.title}</span>
                {tool.description !== '' ? <span className={css.toolDesc} title={tool.description}>{tool.description}</span> : null}
              </li>
            ))}
          </ul>
        )
        : null}
      {probe !== undefined && probe !== 'running' ? <ProbeResult t={t} probe={probe} /> : null}
    </div>
  )
}

function ProbeResult({ t, probe }: { t: T, probe: McpProbeView }): ReactNode {
  if (!probe.ok) {
    return <div className={css.error} role="status">{t('mcpProbeFailed', { stage: probe.stage, message: probe.message })}</div>
  }
  const server = [probe.serverName, probe.serverVersion].filter(Boolean).join(' ') || t('mcpProbeServer')
  return (
    <div className={css.probe} role="status">
      <div>{t('mcpProbeOk', { server, ms: probe.durationMs, count: probe.tools.length })}</div>
      {probe.tools.length > 0 ? <div className={css.mono}>{probe.tools.join(', ')}</div> : null}
      {probe.truncated ? <div className={css.empty}>{t('mcpProbeTruncated')}</div> : null}
    </div>
  )
}
