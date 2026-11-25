/**
 * Catalog operations: the cached view the page shows, refreshing sources,
 * editing the source list, installing or updating one entry, and the
 * read-only search the `loadout` tool uses. Fetching and installation are
 * serialized per source so two clicks cannot interleave a clone and a copy.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Homes } from './inventory.ts'
import { OperationError } from './errors.ts'
import { parseFrontmatter, type FrontmatterValue } from './frontmatter.ts'
import { isStale, refreshSource, ruleContent, stageSkill } from './index-fetch.ts'
import { classifySource, indexesPath, parseIndexesFile, serializeIndexesFile, type IndexSource } from './index-sources.ts'
import {
  cacheFile, digestFile, digestTree, installedFile, installKey, readCache, readInstalled, readOptionalText,
  updateAvailable, writeAtomic, writeInstalled, type CachedIndex, type CachedRule, type CachedSkill, type InstalledItem,
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

export interface IndexService {
  state(projectRoot: string | undefined): Promise<IndexView>
  refresh(projectRoot: string | undefined, request: { source?: string | undefined, ifStale?: boolean }): Promise<IndexView>
  addSource(source: string, projectRoot: string | undefined): Promise<IndexView>
  removeSource(source: string, projectRoot: string | undefined): Promise<IndexView>
  install(request: { source: string, kind: IndexKind, name: string, projectRoot: string | undefined, force: boolean }): Promise<Responses['index-install']>
  search(request: { projectRoot: string | undefined, query?: string | undefined, kind?: IndexKind | undefined, limit?: number | undefined }): Promise<IndexSearchView>
  /** Drop the provenance of an item the user deleted through the regular Remove action. */
  forget(kind: IndexKind, name: string, projectRoot: string | undefined): Promise<void>
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
      if (item === undefined) continue
      const path = targetOf(level, kind, entry.name, homes.agentsHome, ctx.projectRoot)
      if (!existsSync(path)) continue
      const modified = await isModified(kind, path, item)
      installs.push({
        level,
        ...item.version !== undefined ? { version: item.version } : {},
        installedAt: item.installedAt,
        updateAvailable: updateAvailable(item, cache.source, entry),
        modified,
        foreign: item.source !== cache.source,
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

  async function isModified(kind: IndexKind, path: string, item: InstalledItem): Promise<boolean> {
    try {
      return await digestOf(kind, path) !== item.digest
    } catch {
      return true
    }
  }

  async function cacheFor(source: IndexSource): Promise<CachedIndex> {
    const cached = await readCache(cacheFile(homes.dshHome, source.id))
    if (cached !== undefined) return cached
    return serialized(source.id, async () => await refreshSource(source, { dshHome: homes.dshHome }))
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
        return await view(await context(projectRoot))
      })
    },

    async install({ source: sourceId, kind, name, projectRoot, force }) {
      return await serialized('@install', async () => {
      const source = await findSource(sourceId)
      const cache = await cacheFor(source)
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
      if (kind === 'skill' && existsSync(join(root, `${name}.md`))) {
        throw new OperationError('unmanaged', `${join(root, `${name}.md`)} already exists and was not installed from an index`)
      }
      const installed = await readInstalled(manifest)
      if (installed.error !== undefined) throw new OperationError('install-failed', `${manifest} is malformed: ${installed.error}`)
      const key = installKey(kind, name)
      const existing = installed.items[key]
      const targetExists = existsSync(target)
      if (targetExists) {
        if (existing === undefined) {
          throw new OperationError('unmanaged', `${target} already exists and was not installed from an index`)
        }
        if (existing.source !== source.id) {
          throw new OperationError('conflict', `${target} is installed from ${existing.source}; remove it first`)
        }
        if (!force && await isModified(kind, target, existing)) {
          throw new OperationError('modified', `${target} has local changes; confirm the update to replace it`)
        }
      }

      await mkdir(root, { recursive: true })
      // Staging and backups live beside the manifest, outside the roots DSH scans.
      const workRoot = join(dirname(manifest), 'work')
      await mkdir(workRoot, { recursive: true })
      const staging = kind === 'skill'
        ? await mkdtemp(join(workRoot, 'skill-'))
        : join(workRoot, `rule-${randomUUID()}.tmp`)
      let renamed = false
      try {
        let version: string | undefined
        if (kind === 'skill') {
          await stageSkill(cache, entry as CachedSkill, { dshHome: homes.dshHome }, staging)
          version = entry.version ?? await validateSkill(staging, entry.name)
        } else {
          const bytes = await ruleContent(cache, entry as CachedRule, { dshHome: homes.dshHome })
          if (bytes.byteLength === 0) throw new OperationError('install-failed', `${entry.path} is empty`)
          await writeFile(staging, bytes)
          version = entry.version
        }
        const digest = kind === 'skill' ? await digestTree(staging) : await digestFile(staging)
        const resolvedVersion = version ?? entry.version
        const item: InstalledItem = {
          kind,
          name,
          source: source.id,
          path: entry.path,
          ...resolvedVersion !== undefined ? { version: resolvedVersion } : {},
          ...entry.oid !== undefined ? { oid: entry.oid } : {},
          digest,
          ...cache.commit !== undefined ? { commit: cache.commit } : {},
          installedAt: Date.now(),
        }
        const backup = targetExists ? join(dirname(manifest), 'backups', `${kind}-${name}-${randomUUID()}`) : undefined
        if (backup !== undefined) {
          await mkdir(dirname(backup), { recursive: true })
          await rename(target, backup)
        }
        try {
          await rename(staging, target)
          renamed = true
          await writeInstalled(manifest, { items: { ...installed.items, [key]: item } })
        } catch (error) {
          await rollback(target, backup)
          throw error
        }
        let note: string | undefined
        if (backup !== undefined) {
          try {
            await hooks.trash(backup)
          } catch {
            note = `the previous copy is at ${backup}`
          }
        }
        hooks.invalidate()
        return {
          source: source.id, kind, name, level, path: target,
          action: targetExists ? 'updated' as const : 'installed' as const,
          ...note !== undefined ? { note } : {},
        }
      } finally {
        if (!renamed && existsSync(staging)) {
          await rm(staging, { recursive: kind === 'skill', force: true })
        }
      }
      })
    },

    async forget(kind, name, projectRoot) {
      await serialized('@install', async () => {
        const manifest = installedFile(homes.agentsHome, projectRoot)
        const installed = await readInstalled(manifest)
        if (installed.error !== undefined) return
        const key = installKey(kind, name)
        if (!(key in installed.items)) return
        const items = { ...installed.items }
        delete items[key]
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

async function rollback(target: string, backup: string | undefined): Promise<void> {
  if (backup === undefined) {
    await rm(target, { recursive: true, force: true })
    return
  }
  await rm(target, { recursive: true, force: true })
  await rename(backup, target)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
