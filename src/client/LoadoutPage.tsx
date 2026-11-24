/** The Loadout page: scope picker, kind tabs, and the selected kind's sections. */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { StateView } from '../shared/api.ts'
import { call, messageOf, stored } from './api.ts'
import { ChevronIcon, ScopeIcon, type T } from './controls.tsx'
import { countOf, KINDS, Sections, Tabs, type Scope } from './items.tsx'
import css from './Loadout.module.css'

const SCOPE_KEY = 'dsh-loadout.scope'
const TAB_KEY = 'dsh-loadout.tab'
/** Workspace values are absolute paths, so they never equal this one. */
const GLOBAL = 'global'

export interface LoadoutPageProps {
  t: T
  /** Standard slot prop: the registered workspaces. Absent in shells without the workspace controller. */
  useWorkspaces?: SnapshotSelectorHook<WorkspaceSnapshot>
}

type Workspace = WorkspaceSnapshot['items'][number]

const noWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot> = selector => selector({ items: [] } as unknown as WorkspaceSnapshot)

/** Workspace title, with the path only when another workspace shares the title. */
function optionLabel(item: Workspace, all: readonly Workspace[]): string {
  return all.filter(other => other.title === item.title).length > 1 ? `${item.title} – ${item.path}` : item.title
}

export function LoadoutPage({ t, useWorkspaces = noWorkspaces }: LoadoutPageProps): ReactNode {
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const [chosenScope, setChosenScope] = useState(() => stored.read(SCOPE_KEY) ?? GLOBAL)
  const scopeValue = chosenScope !== GLOBAL && workspaces.some(item => item.path === chosenScope) ? chosenScope : GLOBAL
  const workspacePath = scopeValue === GLOBAL ? undefined : scopeValue
  const [chosenTab, setChosenTab] = useState(() => stored.read(TAB_KEY) ?? KINDS[0]?.id ?? '')
  const kind = KINDS.find(item => item.id === chosenTab) ?? KINDS[0]
  const [data, setData] = useState<{ for: string | undefined, value: StateView } | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const reload = useCallback(async () => {
    try {
      const value = await call('state', workspacePath === undefined ? {} : { workspacePath })
      setData({ for: workspacePath, value })
      setError(undefined)
    } catch (failure) {
      setError(messageOf(failure))
    }
  }, [workspacePath])

  useEffect(() => { void reload() }, [reload])

  const pickScope = (value: string): void => {
    setChosenScope(value)
    stored.write(SCOPE_KEY, value)
  }
  const pickTab = (value: string): void => {
    setChosenTab(value)
    stored.write(TAB_KEY, value)
  }

  const current = data !== undefined && data.for === workspacePath ? data.value : undefined
  const group = current === undefined ? undefined : workspacePath === undefined ? current.global : current.workspace
  const scope: Scope = workspacePath === undefined ? { level: 'global' } : { level: 'project', workspacePath }
  const projectRoot = current?.workspace?.projectRoot ?? workspacePath
  const rulesHint = workspacePath === undefined ? '~/.agents/rules' : `${projectRoot}/.agents/rules`
  const locked = group?.error !== undefined
  const counts = group === undefined ? {} : Object.fromEntries(KINDS.map(item => [item.id, countOf(item, group)]))

  return (
    <div className={css.page} aria-busy={group === undefined && error === undefined}>
      <header className={css.head} data-window-drag>
        <div className={css.headInner}>
          <div className={css.heading}>
            <h1 className={css.title}>{t('title')}</h1>
            <p className={css.intro}>{t('intro')}</p>
            <div className={css.scopeMeta}>
              {workspacePath === undefined
                ? <span>{workspaces.length === 0 ? t('noWorkspaces') : t('globalHint')}</span>
                : <code>{projectRoot}</code>}
              {group !== undefined ? <span>{t('savedToLabel')} <code>{group.loadoutPath}</code></span> : null}
            </div>
          </div>
          <div className={css.toolbar}>
            <span className={css.select}>
              <ScopeIcon global={workspacePath === undefined} />
              <select
                className={css.picker}
                aria-label={t('scope')}
                title={workspacePath ?? t('globalHint')}
                value={scopeValue}
                disabled={workspaces.length === 0}
                onChange={event => { pickScope(event.target.value) }}
              >
                <option value={GLOBAL}>{t('global')}</option>
                {workspaces.map(item => <option key={item.workspaceId} value={item.path}>{optionLabel(item, workspaces)}</option>)}
              </select>
              <ChevronIcon />
            </span>
          </div>
          <div className={css.headTabs}>
            <Tabs t={t} value={kind?.id ?? ''} counts={counts} onChange={pickTab} />
          </div>
        </div>
      </header>
      <div className={css.body}>
        <div className={css.tabpanel} role="tabpanel" id="dshlo-tabpanel" aria-labelledby={`dshlo-tab-${kind?.id ?? ''}`}>
          {error !== undefined
            ? (
              <div className={css.error} role="alert">
                <span>{error}</span>
                <button type="button" className={css.btn} data-tone="outline" onClick={() => { void reload() }}>{t('retry')}</button>
              </div>
            )
            : null}
          {group === undefined && error === undefined ? <div className={css.empty} role="status">{t('loading')}</div> : null}
          {group?.error !== undefined ? <div className={css.error} role="alert">{t('malformed', { path: group.loadoutPath, error: group.error })}</div> : null}
          {group !== undefined && kind !== undefined
            ? (
              <Sections
                key={`${scopeValue}:${kind.id}`}
                sections={kind.sections(t, group, { level: scope.level, rulesHint })}
                t={t}
                scope={scope}
                locked={locked}
                reload={reload}
              />
            )
            : null}
        </div>
      </div>
    </div>
  )
}
