/**
 * The Catalog subpage: configured indexes, their entries, and
 * install/update/remove actions. It refreshes stale sources when it opens and
 * then works from the Host cache; installing is always an explicit user action.
 */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { IndexEntryView, IndexInstallView, IndexSourceView, IndexView } from '../shared/api.ts'
import { CallError, call, messageOf } from './api.ts'
import { Confirm, TrashIcon, type T } from './controls.tsx'
import css from './Loadout.module.css'
import type { Scope } from './items.tsx'

export interface CatalogPanelProps {
  t: T
  scope: Scope
  /** Reload the page's skills and rules after an install. */
  onChanged(): Promise<void>
}

export function CatalogPanel({ t, scope, onChanged }: CatalogPanelProps): ReactNode {
  const [view, setView] = useState<IndexView | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [sourceBusy, setSourceBusy] = useState<string | undefined>(undefined)
  const [actionBusy, setActionBusy] = useState<string | undefined>(undefined)
  const [rowError, setRowError] = useState<Readonly<Record<string, string>>>({})
  const [rowNote, setRowNote] = useState<Readonly<Record<string, string>>>({})
  const [confirmKey, setConfirmKey] = useState<string | undefined>(undefined)
  const [removeConfirmKey, setRemoveConfirmKey] = useState<string | undefined>(undefined)
  const [removingSource, setRemovingSource] = useState<string | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const target = useCallback(
    () => scope.workspacePath === undefined ? {} : { workspacePath: scope.workspacePath },
    [scope.workspacePath],
  )

  const load = useCallback(async (ifStale: boolean) => {
    setLoading(true)
    setError(undefined)
    try {
      setView(await call('index-refresh', { ...target(), ifStale }))
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setLoading(false)
    }
  }, [target])

  // load() sets state only after the awaited request, so the effect does not render in a cascade.
  useEffect(() => { void load(true) }, [load])

  const refreshSource = async (source?: string): Promise<void> => {
    setSourceBusy(source ?? '*')
    setError(undefined)
    try {
      setView(await call('index-refresh', { ...target(), ...source !== undefined ? { source } : {} }))
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setSourceBusy(undefined)
    }
  }

  const addSource = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (draft.trim() === '' || adding) return
    setAdding(true)
    setError(undefined)
    try {
      setView(await call('index-add-source', { ...target(), source: draft.trim() }))
      setDraft('')
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setAdding(false)
    }
  }

  const removeSource = async (source: string): Promise<void> => {
    setSourceBusy(source)
    setError(undefined)
    try {
      setView(await call('index-remove-source', { ...target(), source }))
      setRemovingSource(undefined)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setSourceBusy(undefined)
    }
  }

  const install = async (entry: IndexEntryView, force: boolean): Promise<void> => {
    const key = entryKey(entry)
    setRemoveConfirmKey(undefined)
    setActionBusy(key)
    setRowError(rest => without(rest, key))
    try {
      const result = await call('index-install', { ...target(), source: entry.source, kind: entry.kind, name: entry.name, force })
      if (result.note !== undefined) setRowNote(rest => ({ ...rest, [key]: result.note as string }))
      else setRowNote(rest => without(rest, key))
      setView(await call('index-state', target()))
      // Close the confirmation and free the row in the same render, before the slower page reload,
      // so focus lands on the row's own controls as they are now.
      setConfirmKey(undefined)
      setActionBusy(undefined)
      await onChanged()
    } catch (failure) {
      if (failure instanceof CallError && REPLACE_CODES.some(code => failure.code.endsWith(code))) {
        // The page may be out of date about what holds the name; reread it so the prompt names the right copy.
        setView(await call('index-state', target()))
        setConfirmKey(key)
      } else {
        setRowError(rest => ({ ...rest, [key]: messageOf(failure) }))
      }
    } finally {
      // Another row may have started its own action during the reload.
      setActionBusy(current => current === key ? undefined : current)
    }
  }

  const remove = async (entry: IndexEntryView, path: string): Promise<void> => {
    const key = entryKey(entry)
    setActionBusy(key)
    setRowError(rest => without(rest, key))
    try {
      const { movedTo } = await call('remove', { ...target(), path })
      if (movedTo !== undefined) setRowNote(rest => ({ ...rest, [key]: t('movedToDshTrash', { name: entry.name, path: movedTo }) }))
      else setRowNote(rest => without(rest, key))
      setView(await call('index-state', target()))
      // As in install(): the row is free again when its confirmation closes.
      setRemoveConfirmKey(undefined)
      setConfirmKey(undefined)
      setActionBusy(undefined)
      await onChanged()
    } catch (failure) {
      setRowError(rest => ({ ...rest, [key]: messageOf(failure) }))
    } finally {
      // Another row may have started its own action during the reload.
      setActionBusy(current => current === key ? undefined : current)
    }
  }

  const sources = view?.sources ?? []
  const sourceTitles = new Map(sources.map(source => [source.source, sourceTitle(source)]))
  const entries = filterEntries(view?.entries ?? [], query)
  const groups = groupBySource(entries)
  const currentLevel = scope.level

  return (
    <div className={css.tabpanel}>
      {error !== undefined
        ? (
          <div className={css.error} role="alert">
            <span>{error}</span>
            <button type="button" className={css.btn} data-tone="outline" onClick={() => { void refreshSource() }}>{t('retry')}</button>
          </div>
        )
        : null}
      {view?.sourcesError !== undefined ? <div className={css.error} role="alert">{view.sourcesError}</div> : null}
      {view?.installsError !== undefined ? <div className={css.error} role="alert">{view.installsError}</div> : null}

      <section className={css.part}>
        <div className={css.partHead}>
          <h2 className={css.partTitle}>{t('catalogSources')}</h2>
          <span className={css.groupCount}>{sources.length}</span>
          <button
            type="button"
            className={`${css.btn} ${css.catalogHeadAction}`}
            data-tone="outline"
            disabled={sources.length === 0 || sourceBusy !== undefined}
            title={t('catalogRefreshAll')}
            onClick={() => { void refreshSource() }}
          >
            {t('catalogRefreshAll')}
          </button>
        </div>
        <p className={css.note}>{t('catalogSourcesNote')}</p>
        {view !== undefined ? <div className={css.mono}>{t('catalogSourcesFile', { path: view.sourcesPath })}</div> : null}
        <div className={css.list}>
          {sources.length === 0
            ? <div className={css.empty} role={loading ? 'status' : undefined}>{loading && view === undefined ? t('catalogLoading') : t('catalogNoSources')}</div>
            : sources.map(source => (
              <div key={source.source} className={css.row}>
                <div className={css.rowLine}>
                  <div className={css.rowMain}>
                    <div className={css.name}>
                      {sourceTitle(source)}
                      <span className={css.badge}>{t(source.kind === 'git' ? 'catalogSource.git' : source.kind === 'http' ? 'catalogSource.http' : 'catalogSource.local')}</span>
                    </div>
                    {source.description !== undefined ? <div className={css.desc} title={source.description}>{source.description}</div> : null}
                    <div className={css.mono}>{source.source}</div>
                    <div className={css.catalogMeta}>
                      {source.fetchedAt === undefined
                        ? source.error === undefined ? <span>{t('catalogNeverRead')}</span> : null
                        : <span>{t('catalogFetched', { time: formatTime(source.fetchedAt) })}</span>}
                      <span>{t('catalogItems', { count: source.itemCount })}</span>
                    </div>
                    {source.error !== undefined ? <div className={css.error} role="alert">{source.error}</div> : null}
                  </div>
                  <div className={css.controls}>
                    <button
                      type="button"
                      className={css.btn}
                      data-tone="outline"
                      disabled={sourceBusy !== undefined}
                      onClick={() => { void refreshSource(source.source) }}
                    >
                      {sourceBusy === source.source ? t('loading') : t('catalogRefresh')}
                    </button>
                    <button type="button" className={css.btn} data-tone="danger" aria-label={t('catalogRemove')} title={t('catalogRemove')} disabled={sourceBusy !== undefined} onClick={() => { setRemovingSource(source.source) }}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {removingSource === source.source
                  ? (
                    <Confirm
                      t={t}
                      message={t('catalogRemoveConfirm')}
                      action={t('catalogRemove')}
                      busy={sourceBusy !== undefined}
                      onCancel={() => { setRemovingSource(undefined) }}
                      onConfirm={() => { void removeSource(source.source) }}
                    />
                  )
                  : null}
              </div>
            ))}
        </div>
        <form className={css.addRow} onSubmit={event => { void addSource(event) }}>
          <input
            className={css.input}
            type="text"
            value={draft}
            aria-label={t('catalogAdd')}
            placeholder={t('catalogPlaceholder')}
            spellCheck={false}
            onChange={event => { setDraft(event.target.value) }}
          />
          <button type="submit" className={css.btn} data-tone="outline" disabled={adding || draft.trim() === ''}>
            {adding ? t('loading') : t('catalogAdd')}
          </button>
        </form>
      </section>

      <section className={css.part}>
        <div className={css.partHead}>
          <h2 className={css.partTitle}>{t('catalogAvailable')}</h2>
          <span className={css.groupCount}>{entries.length}</span>
        </div>
        <p className={css.note}>{t('catalogScopeNote')}</p>
        <div className={css.catalogTools}>
          <input
            className={css.input}
            type="search"
            value={query}
            aria-label={t('catalogSearch')}
            placeholder={t('catalogSearch')}
            onChange={event => { setQuery(event.target.value) }}
          />
        </div>
        {loading && view === undefined
          ? <div className={css.empty} role="status">{t('catalogLoading')}</div>
          : null}
        {entries.length === 0 && sources.length > 0
          ? <div className={css.empty}>{query.trim() !== '' ? t('catalogNoMatches') : t('catalogEmpty')}</div>
          : [...groups].map(([source, items]) => (
            <section key={source} className={css.group}>
              <div className={css.groupHead}>
                <h3 className={css.groupTitle}>{sourceTitles.get(source) ?? source}</h3>
                <span className={css.groupCount}>{items.length}</span>
              </div>
              <div className={css.list}>
                {items.map(entry => (
                  <EntryRow
                    key={entryKey(entry)}
                    t={t}
                    entry={entry}
                    level={currentLevel}
                    sourceName={id => sourceTitles.get(id) ?? id}
                    busy={actionBusy === entryKey(entry)}
                    confirming={confirmKey === entryKey(entry)}
                    confirmingRemove={removeConfirmKey === entryKey(entry)}
                    error={rowError[entryKey(entry)]}
                    note={rowNote[entryKey(entry)]}
                    onInstall={force => { void install(entry, force) }}
                    onConfirm={() => { setConfirmKey(entryKey(entry)); setRemoveConfirmKey(undefined) }}
                    onCancel={() => { setConfirmKey(undefined) }}
                    onRemove={() => {
                      const install = entry.installs.find(item => item.level === currentLevel)
                      if (install !== undefined) void remove(entry, install.path)
                    }}
                    onRemoveConfirm={() => { setRemoveConfirmKey(entryKey(entry)); setConfirmKey(undefined) }}
                    onRemoveCancel={() => { setRemoveConfirmKey(undefined) }}
                  />
                ))}
              </div>
            </section>
          ))}
      </section>
    </div>
  )

}

interface EntryRowProps {
  t: T
  entry: IndexEntryView
  level: Scope['level']
  /** The title of a configured index, or the source string itself. */
  sourceName(source: string): string
  busy: boolean
  confirming: boolean
  confirmingRemove: boolean
  error: string | undefined
  note: string | undefined
  onInstall(force: boolean): void
  onConfirm(): void
  onCancel(): void
  onRemove(): void
  onRemoveConfirm(): void
  onRemoveCancel(): void
}

function EntryRow({
  t, entry, level, sourceName, busy, confirming, confirmingRemove, error, note, onInstall, onConfirm, onCancel, onRemove, onRemoveConfirm, onRemoveCancel,
}: EntryRowProps): ReactNode {
  const here = entry.installs.find(install => install.level === level)
  const foreign = here?.foreign === true
  const unmanaged = here?.unmanaged === true
  const update = here?.updateAvailable === true
  return (
    <div className={css.row}>
      <div className={css.rowLine}>
        <div className={css.rowMain}>
          <div className={css.name}>
            {entry.name}
            {entry.version !== undefined ? <span className={css.version} title={t('version', { version: entry.version })}>{versionTag(entry.version)}</span> : null}
            <span className={css.badge}>{t(entry.kind === 'skill' ? 'catalogKind.skill' : 'catalogKind.rule')}</span>
          </div>
          {entry.description !== undefined ? <div className={css.desc} title={entry.description}>{entry.description}</div> : null}
          {entry.tags.length > 0 ? <div className={css.tags}>{entry.tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}</div> : null}
          <div className={css.catalogMeta}>
            {entry.installs.map(install => (
              <span key={install.level} className={css.badge} data-tone={install.foreign || install.unmanaged || install.modified ? 'warn' : install.updateAvailable ? 'info' : undefined}>
                {installLabel(t, install, sourceName)}
                {install.version !== undefined ? ` · ${versionTag(install.version)}` : ''}
              </span>
            ))}
          </div>
          {error !== undefined ? <div className={css.error} role="alert">{error}</div> : null}
          {note !== undefined ? <div className={css.mono}>{note}</div> : null}
        </div>
        <div className={css.controls}>
          {foreign || unmanaged
            ? <button type="button" className={css.btn} data-tone="outline" disabled={busy} onClick={onConfirm}>{busy ? t('loading') : t('catalogReplaceCopy')}</button>
            : update
              ? <button type="button" className={css.btn} data-tone="outline" disabled={busy} onClick={() => { if (here?.modified === true) onConfirm(); else onInstall(false) }}>{busy ? t('loading') : t('catalogUpdate')}</button>
              : here === undefined
                ? <button type="button" className={css.btn} data-tone="outline" disabled={busy} onClick={() => { onInstall(false) }}>{busy ? t('loading') : t('catalogInstall')}</button>
                : <span className={css.fixed}>{t('catalogInstalled')}</span>}
          {here === undefined || unmanaged
            ? null
            : (
              <button
                type="button"
                className={css.btn}
                data-tone="danger"
                aria-label={t('delete')}
                title={t('delete')}
                disabled={busy}
                onClick={onRemoveConfirm}
              >
                <TrashIcon />
              </button>
            )}
        </div>
      </div>
      {confirming
        ? (
          <Confirm
            t={t}
            message={replaceMessage(t, here, sourceName)}
            action={foreign || unmanaged ? t('catalogReplaceCopy') : t('catalogReplace')}
            busy={busy}
            onCancel={onCancel}
            onConfirm={() => { onInstall(true) }}
          />
        )
        : null}
      {confirmingRemove
        ? (
          <Confirm t={t} message={t('confirmDelete')} action={t('confirm')} busy={busy} onCancel={onRemoveCancel} onConfirm={onRemove} />
        )
        : null}
    </div>
  )
}

/** Host error codes that mean "confirm to replace the copy holding this name". */
const REPLACE_CODES = ['/modified', '/unmanaged', '/conflict'] as const

function installLabel(t: T, install: IndexInstallView, sourceName: (source: string) => string): string {
  if (install.unmanaged) return t('catalogUnmanaged')
  if (install.foreign) return t('catalogForeign', { source: sourceName(install.installedFrom ?? '') })
  if (install.modified) return t('catalogModified')
  if (install.updateAvailable) return t('catalogUpdateAvailable')
  return install.level === 'global' ? t('catalogInstalledGlobal') : t('catalogInstalledProject')
}

function replaceMessage(t: T, here: IndexInstallView | undefined, sourceName: (source: string) => string): string {
  if (here?.unmanaged === true) return t('catalogUnmanagedConfirm', { path: here.path })
  if (here?.foreign === true) return t('catalogForeignConfirm', { source: sourceName(here.installedFrom ?? '') })
  return t('catalogModifiedConfirm')
}

function filterEntries(entries: readonly IndexEntryView[], query: string): IndexEntryView[] {
  const text = query.trim().toLowerCase()
  if (text === '') return [...entries]
  const words = text.split(/\s+/)
  return entries.filter((entry) => {
    const haystack = [entry.name, entry.description ?? '', ...entry.tags].join('\n').toLowerCase()
    return words.every(word => haystack.includes(word))
  })
}

function groupBySource(entries: readonly IndexEntryView[]): Map<string, IndexEntryView[]> {
  const groups = new Map<string, IndexEntryView[]>()
  for (const entry of entries) groups.set(entry.source, [...groups.get(entry.source) ?? [], entry])
  return groups
}

function entryKey(entry: IndexEntryView): string {
  return `${entry.source}\u0000${entry.kind}\u0000${entry.name}`
}

function sourceTitle(source: IndexSourceView): string {
  return source.title ?? source.source
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return new Date(ms).toISOString()
  }
}

function versionTag(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version
}

function without(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  const next = { ...record }
  delete next[key]
  return next
}
