/** The Loadout Manager page: the loadout itself and the catalog subpage. */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { StateView } from '../shared/api.ts'
import { call, messageOf, stored } from './api.ts'
import { CatalogPanel } from './catalog.tsx'
import { ChevronIcon, ScopeIcon, type T } from './controls.tsx'
import { countOf, KINDS, Sections, Tabs, type Scope } from './items.tsx'
import { isSettling } from './mcp.tsx'
import css from './Loadout.module.css'

const SCOPE_KEY = 'dsh-loadout-manager.scope'
const TAB_KEY = 'dsh-loadout-manager.tab'
/** Workspace values are absolute paths, so they never equal this one. */
const GLOBAL = 'global'

type Subpage = 'loadout' | 'catalog'

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
  const [subpage, setSubpage] = useState<Subpage>('loadout')
  const [data, setData] = useState<{ for: string | undefined, value: StateView } | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<{ for: string, text: string } | undefined>(undefined)

  const reload = useCallback(async () => {
    try {
      const value = await call('state', workspacePath === undefined ? {} : { workspacePath })
      setData({ for: workspacePath, value })
      setError(undefined)
    } catch (failure) {
      setError(messageOf(failure))
    }
  }, [workspacePath])

  // reload() sets state only after the awaited request, so the effect does not render in a cascade.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload() }, [reload])

  // MCP servers connect in the background: re-read while any of them is still settling.
  const settling = subpage === 'loadout' && kind?.id === 'mcp' && (data?.value.global.mcp ?? []).some(isSettling)
  useEffect(() => {
    if (!settling) return undefined
    const timer = window.setInterval(() => { void reload() }, 2000)
    return () => { window.clearInterval(timer) }
  }, [settling, reload])

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
  const catalogOpen = subpage === 'catalog'

  const scopeHint = workspacePath === undefined
    ? <span>{workspaces.length === 0 ? t('noWorkspaces') : t('globalHint')}</span>
    : <code>{projectRoot}</code>

  const scopePicker = (
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
  )

  return (
    <div className={css.page} aria-busy={!catalogOpen && group === undefined && error === undefined}>
      <header className={css.head} data-window-drag>
        <div className={css.headInner}>
          {catalogOpen
            ? (
              <div className={css.heading}>
                <nav className={css.crumbs} aria-label={t('breadcrumbs')}>
                  <button type="button" className={css.crumb} onClick={() => { setSubpage('loadout') }}>{t('title')}</button>
                  <span className={css.crumbSep} aria-hidden>/</span>
                  <span className={css.crumbCurrent}>{t('catalogTab')}</span>
                </nav>
                <h1 className={css.title}>{t('catalogTab')}</h1>
                <p className={css.intro}>{t('catalogIntro')}</p>
                <div className={css.scopeMeta}>{scopeHint}</div>
              </div>
            )
            : (
              <div className={css.heading}>
                <h1 className={css.title}>{t('title')}</h1>
                <p className={css.intro}>{t('intro')}</p>
                <div className={css.scopeMeta}>
                  {scopeHint}
                  {group !== undefined ? <span>{t('savedToLabel')} <code>{group.loadoutPath}</code></span> : null}
                </div>
              </div>
            )}
          <div className={css.toolbar}>
            {catalogOpen
              ? <button type="button" id="dshlo-back" className={css.btn} data-tone="outline" onClick={() => { setSubpage('loadout') }}>{t('back')}</button>
              : <button type="button" id="dshlo-open-catalog" className={css.btn} data-tone="outline" onClick={() => { setSubpage('catalog') }}>{t('catalogTab')}</button>}
            {scopePicker}
          </div>
          {catalogOpen ? null : <div className={css.headTabs}><Tabs t={t} value={kind?.id ?? ''} counts={counts} onChange={pickTab} /></div>}
        </div>
      </header>
      <div className={css.body}>
        {catalogOpen
          ? <CatalogPanel key={`catalog:${scopeValue}`} t={t} scope={scope} onChanged={reload} />
          : (
            <div className={css.tabpanel} role="tabpanel" id="dshlo-tabpanel" aria-labelledby={`dshlo-tab-${kind?.id ?? ''}`}>
              {notice !== undefined && notice.for === scopeValue
                ? (
                  <div className={css.notice} role="status">
                    <span>{notice.text}</span>
                    <button type="button" className={css.btn} data-tone="outline" onClick={() => { setNotice(undefined) }}>{t('dismiss')}</button>
                  </div>
                )
                : null}
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
                    sections={kind.sections(t, group, { level: scope.level, rulesHint, loadoutPath: group.loadoutPath })}
                    t={t}
                    scope={scope}
                    locked={locked}
                    reload={reload}
                    notify={text => { setNotice({ for: scopeValue, text }) }}
                  />
                )
                : null}
            </div>
          )}
      </div>
    </div>
  )
}
