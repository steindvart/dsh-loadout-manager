/** Tabs, rows, and grouped sections of the Loadout page. */

import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { InstructionView, Level, LevelView, McpServerView, Responses, RuleView, SkillView } from '../shared/api.ts'
import { call, messageOf } from './api.ts'
import { SkillStateControl, Switch, TrashIcon, type T } from './controls.tsx'
import css from './Loadout.module.css'
import { McpRow } from './mcp.tsx'

/** Where the page points: the level and the request fields that select it. */
export interface Scope {
  level: Level
  workspacePath?: string
}

interface SectionText {
  title?: string
  /** What the switches of this section do, shown above the list. */
  note?: string
  empty: string
}

export type Section = SectionText & (
  | { kind: 'skill', items: SkillView[] }
  | { kind: 'rule', items: RuleView[] }
  | { kind: 'instruction', items: InstructionView[] }
  | { kind: 'mcp', items: McpServerView[] }
)

export interface Kind {
  id: string
  label: 'skills' | 'instructionsTab' | 'mcpTab'
  sections(t: T, group: LevelView, context: { level: Level, rulesHint: string, loadoutPath: string }): Section[]
}

/**
 * Tabs. Each lists sections built from the Host state; the instructions tab
 * shows AGENTS.md files before rules, the order they take in the agent's
 * context. A new kind is one more entry here and one more list in the
 * shared contract.
 */
export const KINDS: readonly Kind[] = [
  {
    id: 'skills',
    label: 'skills',
    sections: (t, group) => [{ kind: 'skill', items: group.skills, empty: t('noSkills') }],
  },
  {
    id: 'rules',
    label: 'instructionsTab',
    sections: (t, group, { level, rulesHint }) => [
      { kind: 'instruction', title: t('instructionFiles'), items: group.instructions, empty: t(level === 'global' ? 'noGlobalInstructions' : 'noProjectInstructions') },
      { kind: 'rule', title: t('rules'), items: group.rules, empty: t('noRules', { path: rulesHint }) },
    ],
  },
  {
    id: 'mcp',
    label: 'mcpTab',
    sections: (t, group, { level, loadoutPath }) => [{
      kind: 'mcp',
      items: group.mcp ?? [],
      note: level === 'global' ? t('mcpNoteGlobal') : t('mcpNoteProject', { path: loadoutPath }),
      empty: group.mcp === undefined ? t('mcpUnavailable') : t('noMcp'),
    }],
  },
]

export function countOf(kind: Kind, group: LevelView): number {
  return kind.sections(key => key, group, { level: 'global', rulesHint: '', loadoutPath: '' })
    .reduce((sum, section) => sum + section.items.length, 0)
}

export function Tabs({ t, value, counts, onChange }: {
  t: T
  value: string
  counts: Readonly<Record<string, number>>
  onChange(id: string): void
}): ReactNode {
  const index = Math.max(0, KINDS.findIndex(kind => kind.id === value))
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number): void => {
    const last = KINDS.length - 1
    const next = ({ ArrowLeft: at === 0 ? last : at - 1, ArrowRight: at === last ? 0 : at + 1, Home: 0, End: last } as Record<string, number>)[event.key]
    const target = next === undefined ? undefined : KINDS[next]
    if (next === undefined || target === undefined) return
    event.preventDefault()
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]').item(next).focus()
    onChange(target.id)
  }
  return (
    <div className={css.tabs} role="tablist" aria-label={t('tabs')} style={{ gridTemplateColumns: `repeat(${KINDS.length}, minmax(0, 1fr))` }}>
      <span className={css.tabIndicator} aria-hidden style={{ width: `calc((100% - 4px) / ${KINDS.length})`, transform: `translateX(${index * 100}%)` }} />
      {KINDS.map((kind, at) => (
        <button
          key={kind.id}
          type="button"
          role="tab"
          id={`dshlo-tab-${kind.id}`}
          className={css.tab}
          aria-selected={kind.id === value}
          aria-controls="dshlo-tabpanel"
          tabIndex={kind.id === value ? 0 : -1}
          onClick={() => { onChange(kind.id) }}
          onKeyDown={event => { onKeyDown(event, at) }}
        >
          {t(kind.label)}
          {counts[kind.id] === undefined ? null : <span className={css.count}>{counts[kind.id]}</span>}
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  t: T
  scope: Scope
  locked: boolean
  reload(): Promise<void>
}

type Item =
  | { kind: 'skill', item: SkillView }
  | { kind: 'rule', item: RuleView }
  | { kind: 'instruction', item: InstructionView }

type Entry = Item | { kind: 'mcp', item: McpServerView }

function Row({ t, scope, locked, reload, entry }: RowProps & { entry: Item }): ReactNode {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [preview, setPreview] = useState<Responses['read'] | undefined>(undefined)
  const target = scope.workspacePath === undefined ? {} : { workspacePath: scope.workspacePath }
  const { kind, item } = entry

  const run = useCallback(async (operation: () => Promise<unknown>) => {
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
  }, [reload])

  const onOpen = async (): Promise<void> => {
    if (preview !== undefined) {
      setPreview(undefined)
      return
    }
    setError(undefined)
    try {
      setPreview(await call('read', { ...target, path: item.file }))
    } catch (failure) {
      setError(messageOf(failure))
    }
  }

  let control: ReactNode
  if (entry.kind === 'instruction') {
    control = <span className={css.fixed} title={t('alwaysLoadedHint')}>{t('alwaysLoaded')}</span>
  } else if (entry.kind === 'skill') {
    const skill = entry.item
    control = (
      <SkillStateControl
        t={t}
        value={skill.state}
        fileManual={skill.fileManual}
        disabled={busy || locked}
        onChange={state => { void run(() => call('set-skill', { ...target, level: scope.level, name: skill.name, state })) }}
      />
    )
  } else {
    const rule = entry.item
    control = (
      <Switch
        t={t}
        checked={rule.enabled}
        disabled={busy || locked}
        onChange={enabled => { void run(() => call('set-rule', { ...target, id: rule.id, enabled })) }}
      />
    )
  }

  const skill = entry.kind === 'skill' ? entry.item : undefined
  const deletable = entry.kind === 'rule' || (skill !== undefined && !skill.readOnly)
  const deletePath = skill?.entry ?? item.file
  const description = entry.kind === 'instruction' ? undefined : entry.item.description
  const state = skill?.state ?? (entry.kind === 'rule' && !entry.item.enabled ? 'off' : 'on')

  return (
    <div className={css.row} data-state={state} data-overridden={skill?.overriddenBy !== undefined}>
      <div className={css.rowLine}>
        <div className={css.rowMain}>
          <div className={css.name}>
            {item.name}
            {skill?.version !== undefined ? <span className={css.version} title={t('version', { version: skill.version })}>{versionTag(skill.version)}</span> : null}
            {skill?.readOnly === true ? <span className={css.badge}>{t('builtIn')}</span> : null}
          </div>
          {description ? <div className={css.desc} title={description}>{description}</div> : null}
          <div className={css.mono}>{item.file}</div>
          {skill?.overriddenBy !== undefined ? <div className={css.mono}>{t('overridden', { path: skill.overriddenBy })}</div> : null}
        </div>
        <div className={css.controls}>
          <button type="button" className={css.btn} aria-expanded={preview !== undefined} onClick={() => { void onOpen() }}>
            {preview === undefined ? t('open') : t('hide')}
          </button>
          {deletable
            ? (
              <button
                type="button"
                className={css.btn}
                data-tone="danger"
                aria-label={t('delete')}
                title={t('delete')}
                disabled={busy || confirming}
                onClick={() => { setConfirming(true) }}
              >
                <TrashIcon />
              </button>
            )
            : null}
          {control}
        </div>
      </div>
      {confirming
        ? (
          <div className={css.confirm}>
            {t('confirmDelete')}
            <button type="button" className={css.btn} data-tone="outline" onClick={() => { setConfirming(false) }}>{t('cancel')}</button>
            <button
              type="button"
              className={css.btn}
              data-tone="primary"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await call('remove', { ...target, path: deletePath })
                  setConfirming(false)
                })
              }}
            >
              {t('confirm')}
            </button>
          </div>
        )
        : null}
      {error !== undefined ? <div className={css.error} role="alert">{error}</div> : null}
      {preview !== undefined
        ? (
          <>
            <pre className={css.preview}>{preview.text}</pre>
            {preview.truncated ? <div className={css.empty}>{t('truncated')}</div> : null}
          </>
        )
        : null}
    </div>
  )
}

/** `3.0.0` → `v3.0.0`; a version that does not start with a digit is shown as written. */
function versionTag(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version
}

/** Group heading: a skill or rule source, the folder an instruction file sits in, or who owns an MCP server. */
function groupTitle(t: T, entry: Entry): string {
  switch (entry.kind) {
    case 'mcp': return t(`mcpSource.${entry.item.source}`)
    case 'skill': return t(`source.${entry.item.source}`)
    case 'rule': return t(`source.${entry.item.source}`)
    case 'instruction': {
      const { location } = entry.item
      if (location === 'dsh' || location === 'agents') return t(`location.${location}`)
      return location === '.' ? t('projectRoot') : location
    }
  }
}

function groupKey(entry: Entry): string {
  return entry.kind === 'instruction' ? entry.item.location : entry.item.source
}

function entryKey(entry: Entry): string {
  return entry.kind === 'mcp' ? `mcp:${entry.item.name}` : entry.item.file
}

function entriesOf(section: Section): Entry[] {
  switch (section.kind) {
    case 'mcp': return section.items.map(item => ({ kind: 'mcp', item }))
    case 'skill': return section.items.map(item => ({ kind: 'skill', item }))
    case 'rule': return section.items.map(item => ({ kind: 'rule', item }))
    case 'instruction': return section.items.map(item => ({ kind: 'instruction', item }))
  }
}

function Groups({ section, ...rowProps }: RowProps & { section: Section }): ReactNode {
  const groups = new Map<string, Entry[]>()
  for (const entry of entriesOf(section)) {
    const key = groupKey(entry)
    groups.set(key, [...groups.get(key) ?? [], entry])
  }
  return [...groups].map(([key, entries]) => (
    <section key={`${section.kind}:${key}`} className={css.group}>
      <div className={css.groupHead}>
        <h3 className={css.groupTitle}>{entries[0] === undefined ? key : groupTitle(rowProps.t, entries[0])}</h3>
        <span className={css.groupCount}>{entries.length}</span>
      </div>
      <div className={css.list}>
        {entries.map(entry => entry.kind === 'mcp'
          ? <McpRow key={entryKey(entry)} server={entry.item} {...rowProps} />
          : <Row key={entryKey(entry)} entry={entry} {...rowProps} />)}
      </div>
    </section>
  ))
}

/**
 * A tab's sections in order. A titled section is a heading over its own
 * groups, with its own empty text; an untitled section renders its groups
 * directly.
 */
export function Sections({ sections, ...rowProps }: RowProps & { sections: Section[] }): ReactNode {
  return sections.map((section) => {
    const list = section.items.length === 0
      ? <div className={css.empty}>{section.empty}</div>
      : <Groups section={section} {...rowProps} />
    const body = section.note === undefined
      ? list
      : <>{section.items.length > 0 ? <p className={css.note}>{section.note}</p> : null}{list}</>
    if (section.title === undefined) return <div key={section.kind} className={css.tabpanel}>{body}</div>
    return (
      <section key={section.kind} className={css.part}>
        <div className={css.partHead}>
          <h2 className={css.partTitle}>{section.title}</h2>
          <span className={css.groupCount}>{section.items.length}</span>
        </div>
        {body}
      </section>
    )
  })
}
