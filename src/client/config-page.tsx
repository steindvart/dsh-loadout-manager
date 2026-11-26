/**
 * The plugin's configuration page on the Plugins page: one live switch that
 * turns the periodic artifact auto-update on and off. The page owns the value
 * and the write action, so this view only reads the snapshot it is handed and
 * mutates the one volatile field; no Host route is involved.
 */

import { useState, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { messageOf } from './api.ts'
import { Switch, type T } from './controls.tsx'
import css from './Loadout.module.css'

/** The Plugins page passes the view and, for the page view, the Host form. */
type LoadoutConfigProps = PropsRuntime<'plugins.row.config'> & { t: T }

export function LoadoutConfigPage(props: LoadoutConfigProps): ReactNode {
  const { t } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // A row without its own description falls back to this one-liner.
  if (props.view === 'summary') return t('config.autoUpdate.title')

  const form = props.form
  const checked = form?.state.value?.autoUpdate === true
  const disabled = form === undefined || form.state.status !== 'ready' || !form.state.writable || busy

  const toggle = async (next: boolean): Promise<void> => {
    if (form === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const accepted = await form.mutate([{ op: 'set', path: ['autoUpdate'], value: next }], form.state.revision)
      if (!accepted) setError(t('config.saveFailed'))
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.configRow}>
      <div className={css.configText}>
        <span className={css.configTitle}>{t('config.autoUpdate.title')}</span>
        <p className={css.configHint}>{t('config.autoUpdate.hint')}</p>
        {error !== undefined ? <div className={css.error} role="alert">{error}</div> : null}
      </div>
      <Switch t={t} checked={checked} disabled={disabled} label={t('config.autoUpdate.title')} onChange={next => { void toggle(next) }} />
    </div>
  )
}
