/**
 * Catalog operations: the cached view the page shows, refreshing sources,
 * editing the source list, installing or updating one entry, and the
 * read-only search the `loadout` tool uses. Every read of a source takes
 * that source's lock, so a refresh cannot reset a clone while an install
 * copies from it. Locks are taken in one order: `@sources` or `@install`
 * first, then the source.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Homes } from './inventory.ts'
import { OperationError } from './errors.ts'
import { parseFrontmatter, type FrontmatterValue } from './frontmatter.ts'
import { isStale, refreshSource, ruleContent, stageSkill } from './index-fetch.ts'
import { classifySource, indexesPath, parseIndexesFile, serializeIndexesFile, type IndexSource } from './index-sources.ts'
import {
  cacheDir, cacheFile, digestFile, digestTree, installedFile, installKey, readCache, readInstalled, readOptionalText,
  removeDirectory, updateAvailable, writeAtomic, writeInstalled, type CachedIndex, type CachedRule, type CachedSkill, type InstalledItem,
  type InstalledState,
} from './index-store.ts'
import type {
  IndexEntryView, IndexInstallView, IndexKind, IndexSearchView, IndexSourceView, IndexView, Level, Responses,
} from '../shared/api.ts'

/** How long a successful or failed read is reused before a tab opening refreshes it. */
export const INDEX_TTL_MS = 10 * 60 * 1000

export interface IndexHooks {
  invalidate(): void
  /** Move a replaced copy aside; on failure the copy stays next to the install. */
  trash(path: string): Promise<void>
}

/** One pass of the periodic auto-update. */
export interface AutoUpdateResult {
  /** Sources refreshed during the pass. */
  refreshed: number
  /** Installed copies updated to newer source content. */
  updated: number
  /** Copies left alone: locally modified, foreign, or a failed update. */
  skipped: number
}

export interface IndexService {
  state(projectRoot: string | undefined): Promise<IndexView>
  refresh(projectRoot: string | undefined, request: { source?: string | undefined, ifStale?: boolean }): Promise<IndexView>
  addSource(source: string, projectRoot: string | undefined): Promise<IndexView>
  removeSource(source: string, projectRoot: string | undefined): Promise<IndexView>
  install(request: { source: string, kind: IndexKind, name: string, projectRoot: string | undefined, force: boolean }): Promise<Responses['index-install']>
  search(request: { projectRoot: string | undefined, query?: string | undefined, kind?: IndexKind | undefined, limit?: number | undefined }): Promise<IndexSearchView>
  /** Refresh every source and update the global installs that have newer source content. */
  updateAll(): Promise<AutoUpdateResult>
  /**
   * Drop the provenance of the copy at `path`, deleted through the regular
   * Remove action. A same-named item in another root keeps the record.
   */
  forget(path: string, projectRoot: string | undefined): Promise<void>
}

interface ViewContext {
  sources: IndexSource[]
  caches: Map<string, CachedIndex | undefined>
  projectRoot: string | undefined
  installed: { global: InstalledState, project?: InstalledState }
  sourcesError?: string
  installsError?: string
}

export function createIndexService(homes: Homes, hooks: IndexHooks): IndexService {
  const locks = new Map<string, Promise<void>>()

  async function readSources(): Promise<{ sources: IndexSource[], path: string, error?: string }> {
    const path = indexesPath(homes.agentsHome)
    const text = await readOptionalText(path)
    if (text === undefined) return { sources: [], path }
    try {
      return { sources: parseIndexesFile(text).map(classifySource), path }
    } catch (error) {
      return { sources: [], path, error: messageOf(error) }
    }
  }

  async function readSourcesStrict(): Promise<{ sources: IndexSource[], path: string }> {
    const list = await readSources()
    if (list.error !== undefined) throw new OperationError('sources-malformed', list.error)
    return { sources: list.sources, path: list.path }
  }

  async function context(projectRoot: string | undefined): Promise<ViewContext> {
    const list = await readSources()
    const caches = new Map<string, CachedIndex | undefined>()
    await Promise.all(list.sources.map(async (source) => { caches.set(source.id, await readCache(cacheFile(homes.dshHome, source.id))) }))
    const global = await readInstalled(installedFile(homes.agentsHome))
    const project = projectRoot === undefined ? undefined : await readInstalled(installedFile(homes.agentsHome, projectRoot))
    const installsError = [global.error, project?.error].filter((error): error is string => error !== undefined).join('; ')
    return {
      sources: list.sources,
      caches,
      projectRoot,
      installed: { global, ...project !== undefined ? { project } : {} },
      ...list.error !== undefined ? { sourcesError: list.error } : {},
      ...installsError !== '' ? { installsError } : {},
    }
  }

  async function view(ctx: ViewContext): Promise<IndexView> {
    const entries: IndexEntryView[] = []
    const sources: IndexSourceView[] = []
    for (const source of ctx.sources) {
      const cache = ctx.caches.get(source.id)
      sources.push({
        source: source.id,
        kind: source.kind,
        ...cache?.title !== undefined ? { title: cache.title } : {},
        ...cache?.description !== undefined ? { description: cache.description } : {},
        ...cache?.fetchedAt !== undefined ? { fetchedAt: cache.fetchedAt } : {},
        ...cache?.error !== undefined ? { error: cache.error } : {},
        itemCount: (cache?.skills.length ?? 0) + (cache?.rules.length ?? 0),
      })
      if (cache === undefined) continue
      for (const entry of cache.skills) entries.push(await entryView(ctx, cache, 'skill', entry))
      for (const entry of cache.rules) entries.push(await entryView(ctx, cache, 'rule', entry))
    }
    return {
      sourcesPath: indexesPath(homes.agentsHome),
      ...ctx.sourcesError !== undefined ? { sourcesError: ctx.sourcesError } : {},
      ...ctx.installsError !== undefined ? { installsError: ctx.installsError } : {},
      sources,
      entries,
    }
  }

  async function entryView(ctx: ViewContext, cache: CachedIndex, kind: IndexKind, entry: CachedSkill | CachedRule): Promise<IndexEntryView> {
    const key = installKey(kind, entry.name)
    const installs: IndexInstallView[] = []
    for (const level of ['global', 'project'] as const) {
      if (level === 'project' && ctx.projectRoot === undefined) continue
      const state = level === 'global' ? ctx.installed.global : ctx.installed.project
      const item = state?.items[key]
      const path = targetOf(level, kind, entry.name, homes.agentsHome, ctx.projectRoot)
      if (item === undefined || !existsSync(path)) {
        const own = occupants(level, kind, entry.name, ctx.projectRoot)[0]
        if (own !== undefined) installs.push({ level, updateAvailable: false, modified: false, foreign: false, unmanaged: true, path: own })
        continue
      }
      const modified = await isModified(kind, path, item)
      installs.push({
        level,
        ...item.version !== undefined ? { version: item.version } : {},
        installedAt: item.installedAt,
        updateAvailable: updateAvailable(item, cache.source, entry),
        modified,
        foreign: item.source !== cache.source,
        unmanaged: false,
        installedFrom: item.source,
        path,
      })
    }
    return {
      source: cache.source,
      kind,
      name: entry.name,
      ...entry.description !== undefined ? { description: entry.description } : {},
      ...entry.version !== undefined ? { version: entry.version } : {},
      tags: entry.tags,
      installs,
    }
  }

  /**
   * Existing files that hold `name` in a scope: the install target and, for a
   * skill, a flat `<name>.md` that DSH would read as the same skill.
   */
  function occupants(level: Level, kind: IndexKind, name: string, projectRoot: string | undefined): string[] {
    const paths = [targetOf(level, kind, name, homes.agentsHome, projectRoot)]
    if (kind === 'skill') paths.push(join(rootOf(level, kind, homes.agentsHome, projectRoot), `${name}.md`))
    return paths.filter(path => existsSync(path))
  }

  async function isModified(kind: IndexKind, path: string, item: InstalledItem): Promise<boolean> {
    try {
      return await digestOf(kind, path) !== item.digest
    } catch {
      return true
    }
  }

  function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    const tracked: Promise<void> = next.then(() => undefined, () => undefined)
    locks.set(key, tracked)
    void tracked.finally(() => { if (locks.get(key) === tracked) locks.delete(key) })
    return next
  }

  async function findSource(source: string): Promise<IndexSource> {
    const { sources } = await readSourcesStrict()
    const found = sources.find(item => item.id === source)
    if (found === undefined) throw new OperationError('unknown-source', `"${source}" is not a configured index source`)
    return found
  }

  return {
    async state(projectRoot) {
      return await view(await context(projectRoot))
    },

    async refresh(projectRoot, { source, ifStale: onlyStale = false }) {
      const { sources } = await readSources()
      const targets = source === undefined ? sources : [await findSource(source)]
      for (const item of targets) {
        if (onlyStale && !isStale(await readCache(cacheFile(homes.dshHome, item.id)), INDEX_TTL_MS)) continue
        await serialized(item.id, async () => { await refreshSource(item, { dshHome: homes.dshHome }) })
      }
      return await view(await context(projectRoot))
    },

    async addSource(text, projectRoot) {
      let source: IndexSource
      try {
        source = classifySource(text)
      } catch (error) {
        throw new OperationError('bad-request', messageOf(error))
      }
      return await serialized('@sources', async () => {
        const list = await readSourcesStrict()
        if (!list.sources.some(item => item.id === source.id)) {
          await writeAtomic(list.path, serializeIndexesFile([...list.sources.map(item => item.id), source.id]))
        }
        await serialized(source.id, async () => { await refreshSource(source, { dshHome: homes.dshHome }) })
        return await view(await context(projectRoot))
      })
    },

    async removeSource(source, projectRoot) {
      return await serialized('@sources', async () => {
        const list = await readSourcesStrict()
        if (!list.sources.some(item => item.id === source)) throw new OperationError('unknown-source', `"${source}" is not a configured index source`)
        await writeAtomic(list.path, serializeIndexesFile(list.sources.filter(item => item.id !== source).map(item => item.id)))
        await serialized(source, async () => { await removeDirectory(cacheDir(homes.dshHome, source)) })
        return await view(await context(projectRoot))
      })
    },

    async install({ source: sourceId, kind, name, projectRoot, force }) {
      return await serialized('@install', async () => await serialized(sourceId, async () => {
        const source = await findSource(sourceId)
        const cache = await readCache(cacheFile(homes.dshHome, source.id)) ?? await refreshSource(source, { dshHome: homes.dshHome })
        const entry = kind === 'skill'
          ? cache.skills.find(item => item.name === name)
          : cache.rules.find(item => item.name === name)
        if (entry === undefined) {
          throw new OperationError(
            'not-found',
            cache.error === undefined
              ? `"${sourceId}" lists no ${kind} named "${name}"`
              : `"${sourceId}" lists no ${kind} named "${name}"; the last read failed: ${cache.error}`,
          )
        }
        const level: Level = projectRoot === undefined ? 'global' : 'project'
        const root = rootOf(level, kind, homes.agentsHome, projectRoot)
        const target = targetOf(level, kind, name, homes.agentsHome, projectRoot)
        const manifest = installedFile(homes.agentsHome, projectRoot)
        const installed = await readInstalled(manifest)
        if (installed.error !== undefined) throw new OperationError('install-failed', `${manifest} is malformed: ${installed.error}`)
        const key = installKey(kind, name)
        const existing = installed.items[key]
        const targetExists = existsSync(target)
        // `force` is the user's confirmation to replace whatever holds the name.
        const replaced = occupants(level, kind, name, projectRoot)
        if (!force) {
          const own = replaced.find(path => path !== target || existing === undefined)
          if (own !== undefined) {
            throw new OperationError('unmanaged', `${own} already exists and was not installed from an index; confirm to replace it`)
          }
          if (targetExists && existing !== undefined && existing.source !== source.id) {
            throw new OperationError('conflict', `${target} is installed from ${existing.source}; confirm to replace it with the copy from ${source.id}`)
          }
          if (targetExists && existing !== undefined && await isModified(kind, target, existing)) {
            throw new OperationError('modified', `${target} has local changes; confirm the update to replace it`)
          }
        }

        await mkdir(root, { recursive: true })
        // Staging and backups live beside the manifest, outside the roots DSH scans.
        const workRoot = join(dirname(manifest), 'work')
        await mkdir(workRoot, { recursive: true })
        await ignoreScratch(dirname(manifest))
        const staging = kind === 'skill'
          ? await mkdtemp(join(workRoot, 'skill-'))
          : join(workRoot, `rule-${randomUUID()}.tmp`)
        let renamed = false
        try {
          let version: string | undefined
          if (kind === 'skill') {
            await stageSkill(cache, entry as CachedSkill, { dshHome: homes.dshHome }, staging)
            const fileVersion = await validateSkill(staging, entry.name)
            version = entry.version ?? fileVersion
          } else {
            const bytes = await ruleContent(cache, entry as CachedRule, { dshHome: homes.dshHome })
            if (bytes.byteLength === 0) throw new OperationError('install-failed', `${entry.path} is empty`)
            await writeFile(staging, bytes)
            version = entry.version
          }
          const digest = kind === 'skill' ? await digestTree(staging) : await digestFile(staging)
          const item: InstalledItem = {
            kind,
            name,
            source: source.id,
            path: entry.path,
            ...version !== undefined ? { version } : {},
            ...entry.oid !== undefined ? { oid: entry.oid } : {},
            digest,
            ...cache.commit !== undefined ? { commit: cache.commit } : {},
            installedAt: Date.now(),
          }
          const backups: Backup[] = []
          try {
            for (const path of replaced) {
              const backup = join(dirname(manifest), 'backups', `${kind}-${name}-${randomUUID()}`)
              await mkdir(dirname(backup), { recursive: true })
              await rename(path, backup)
              backups.push({ path, backup })
            }
            await rename(staging, target)
            renamed = true
            await writeInstalled(manifest, { items: { ...installed.items, [key]: item } })
          } catch (error) {
            await rollback(target, renamed, backups)
            throw error
          }
          const left: string[] = []
          for (const { backup } of backups) {
            try {
              await hooks.trash(backup)
            } catch {
              left.push(backup)
            }
          }
          const note = left.length === 0 ? undefined : `the previous copy is at ${left.join(', ')}`
          hooks.invalidate()
          return {
            source: source.id, kind, name, level, path: target,
            action: replaced.length > 0 ? 'updated' as const : 'installed' as const,
            ...note !== undefined ? { note } : {},
          }
        } finally {
          if (!renamed && existsSync(staging)) {
            await rm(staging, { recursive: kind === 'skill', force: true })
          }
        }
      }))
    },

    async updateAll() {
      // A full refresh reads every source, then the global installs are
      // updated one at a time. Project installs are out of scope here: the
      // Host does not enumerate projects, so only the global level is known.
      const view = await this.refresh(undefined, {})
      let updated = 0
      let skipped = 0
      for (const entry of view.entries) {
        const install = entry.installs.find(item => item.level === 'global')
        if (install === undefined || !install.updateAvailable) continue
        if (install.modified || install.foreign) {
          skipped += 1
          continue
        }
        try {
          await this.install({ source: entry.source, kind: entry.kind, name: entry.name, projectRoot: undefined, force: false })
          updated += 1
        } catch {
          // Local edits made between the view and the install, a source that
          // broke mid-pass: leave the copy alone and count it.
          skipped += 1
        }
      }
      return { refreshed: view.sources.length, updated, skipped }
    },

    async forget(path, projectRoot) {
      await serialized('@install', async () => {
        const manifest = installedFile(homes.agentsHome, projectRoot)
        const installed = await readInstalled(manifest)
        if (installed.error !== undefined) return
        const level: Level = projectRoot === undefined ? 'global' : 'project'
        const deleted = resolve(path)
        const keys = Object.entries(installed.items)
          .filter(([, item]) => targetOf(level, item.kind, item.name, homes.agentsHome, projectRoot) === deleted)
          .map(([key]) => key)
        if (keys.length === 0) return
        const items = { ...installed.items }
        for (const key of keys) delete items[key]
        await writeInstalled(manifest, { items })
      })
    },

    async search({ projectRoot, query, kind, limit = 50 }) {
      const ctx = await context(projectRoot)
      const text = query?.trim().toLowerCase() ?? ''
      const max = Math.min(Math.max(Math.trunc(limit), 1), 100)
      const entries: IndexEntryView[] = []
      for (const source of ctx.sources) {
        const cache = ctx.caches.get(source.id)
        if (cache === undefined) continue
        for (const [entryKind, list] of [['skill', cache.skills], ['rule', cache.rules]] as const) {
          if (kind !== undefined && entryKind !== kind) continue
          for (const entry of list) {
            if (entries.length >= max) break
            if (text !== '' && !matches(entry, text)) continue
            entries.push(await entryView(ctx, cache, entryKind, entry))
          }
        }
      }
      return {
        entries,
        sources: ctx.sources.map(source => ({
          source: source.id,
          ...ctx.caches.get(source.id)?.error !== undefined ? { error: ctx.caches.get(source.id)?.error as string } : {},
        })),
      }
    },
  }
}

/** Where one level installs a skill directory or rule file. */
export function rootOf(level: Level, kind: IndexKind, agentsHome: string, projectRoot: string | undefined): string {
  if (level === 'global') return join(agentsHome, kind === 'skill' ? 'skills' : 'rules')
  if (projectRoot === undefined) throw new Error('a project install needs a project root')
  return join(projectRoot, '.agents', kind === 'skill' ? 'skills' : 'rules')
}

export function targetOf(level: Level, kind: IndexKind, name: string, agentsHome: string, projectRoot: string | undefined): string {
  const root = rootOf(level, kind, agentsHome, projectRoot)
  return join(root, kind === 'skill' ? name : `${name}.md`)
}

function matches(entry: CachedSkill | CachedRule, text: string): boolean {
  const haystack = [entry.name, entry.description ?? '', ...entry.tags].join('\n').toLowerCase()
  return text.split(/\s+/).every(word => haystack.includes(word))
}

async function validateSkill(staging: string, expectedName: string): Promise<string | undefined> {
  let text: string
  try {
    text = await readFile(join(staging, 'SKILL.md'), 'utf8')
  } catch {
    throw new OperationError('install-failed', `${expectedName}: the source did not provide SKILL.md`)
  }
  const parsed = parseFrontmatter(text)
  if (parsed === undefined) throw new OperationError('install-failed', `${expectedName}: SKILL.md has no YAML frontmatter`)
  const name = parsed.data.name
  if (typeof name !== 'string' || name !== expectedName) {
    throw new OperationError('install-failed', `${expectedName}: SKILL.md names the skill "${String(name)}"`)
  }
  const description = parsed.data.description
  if (typeof description !== 'string' || description === '') {
    throw new OperationError('install-failed', `${expectedName}: SKILL.md needs a non-empty description`)
  }
  return versionOf(parsed.data)
}

function versionOf(data: Record<string, FrontmatterValue>): string | undefined {
  const metadata = data.metadata
  const nested = typeof metadata === 'object' && metadata !== null ? metadata.version : undefined
  for (const value of [nested, data.version]) {
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

async function digestOf(kind: IndexKind, path: string): Promise<string> {
  return kind === 'skill' ? await digestTree(path) : await digestFile(path)
}

/** Keep staging and backups out of version control; a .gitignore the user wrote is left alone. */
async function ignoreScratch(dir: string): Promise<void> {
  const path = join(dir, '.gitignore')
  if (!existsSync(path)) await writeFile(path, 'work/\nbackups/\n')
}

/** A copy moved aside before the install takes its name. */
interface Backup {
  path: string
  backup: string
}

/** Undo a failed swap: drop the new copy if it landed, then put every moved copy back. */
async function rollback(target: string, renamed: boolean, backups: readonly Backup[]): Promise<void> {
  if (renamed) await rm(target, { recursive: true, force: true })
  for (const { path, backup } of backups) await rename(backup, path)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
