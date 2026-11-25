/**
 * Durable state of the catalog: the global source list, one cache file per
 * source, and the provenance of installed skills and rules. Everything here
 * is plain JSON under the agents home or `$DSH_HOME`, written atomically.
 */

import { createHash } from 'node:crypto'
import { chmod, copyFile, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { INDEX_FILE, type IndexRuleEntry, type IndexSkillEntry } from './index-doc.ts'
import type { IndexSourceKind } from './index-sources.ts'

export const INDEX_CACHE_DIR = 'loadout-manager/indexes'
export const INSTALLED_FILE = 'installed.json'
export const INSTALLED_DIR = '.loadout-manager'

/** Limits that keep a hostile index from filling the disk or memory. */
export const MAX_INDEX_BYTES = 2 * 1024 * 1024
export const MAX_RULE_BYTES = 1024 * 1024
export const MAX_SKILL_BYTES = 20 * 1024 * 1024
export const MAX_SKILL_FILES = 2000
export const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024

export interface CachedSkill extends IndexSkillEntry {
  /** Git tree id of the skill directory at the cached commit. */
  oid?: string
  /** Content digest for a local source. */
  digest?: string
}

export interface CachedRule extends IndexRuleEntry {
  /** Git blob id of the rule file at the cached commit. */
  oid?: string
  /** Content digest for a local source. */
  digest?: string
}

export interface CachedIndex {
  format: 1
  source: string
  kind: IndexSourceKind
  /** Last successful read, Unix milliseconds. */
  fetchedAt?: number
  /** Last read attempt, successful or not, Unix milliseconds. */
  checkedAt?: number
  /** Last read failure; the cached entries stay usable. */
  error?: string
  title?: string
  description?: string
  /** Final URL of an HTTP index after redirects; relative paths resolve against it. */
  base?: string
  /** Git commit the entries were read at. */
  commit?: string
  skills: CachedSkill[]
  rules: CachedRule[]
}

export interface InstalledItem {
  kind: 'skill' | 'rule'
  name: string
  /** Canonical index source the item came from. */
  source: string
  /** Entry path inside the source. */
  path: string
  /** Version the index declared, else the skill frontmatter version. */
  version?: string
  /** Source revision: a git tree or blob id. */
  oid?: string
  /** Digest of the installed content. */
  digest: string
  /** Git commit the copy was taken from. */
  commit?: string
  installedAt: number
}

export interface InstalledState {
  items: Record<string, InstalledItem>
  error?: string
}

export function installKey(kind: 'skill' | 'rule', name: string): string {
  return `${kind}/${name}`
}

/** Directory holding one source's cache. */
export function cacheDir(dshHome: string, source: string): string {
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 24)
  return resolve(dshHome, INDEX_CACHE_DIR, hash)
}

export function cacheFile(dshHome: string, source: string): string {
  return join(cacheDir(dshHome, source), 'cache.json')
}

export function repoDir(dshHome: string, source: string): string {
  return join(cacheDir(dshHome, source), 'repo')
}

/** Where a level's installed-item manifest lives. */
export function installedFile(agentsHome: string, projectRoot?: string): string {
  return projectRoot === undefined
    ? resolve(agentsHome, INSTALLED_DIR, INSTALLED_FILE)
    : resolve(projectRoot, '.agents', INSTALLED_DIR, INSTALLED_FILE)
}

/** Read a regular file through a size limit; a symbolic link is refused, not followed. */
export async function readBytes(path: string, maxBytes: number): Promise<Uint8Array> {
  const info = await lstat(path)
  if (info.isSymbolicLink()) throw new Error(`${basename(path)} is a symbolic link; index files may not be links`)
  if (!info.isFile()) throw new Error(`${basename(path)} is not a regular file`)
  if (info.size > maxBytes) throw new Error(`${path} is larger than ${String(maxBytes)} bytes`)
  const bytes = await readFile(path)
  if (bytes.byteLength > maxBytes) throw new Error(`${path} is larger than ${String(maxBytes)} bytes`)
  return bytes
}

export async function readTextFile(path: string, maxBytes: number): Promise<string> {
  return Buffer.from(await readBytes(path, maxBytes)).toString('utf8')
}

/**
 * Resolve an entry path inside a source checkout. The entry may not be a
 * symbolic link, and its real location must stay under the root's real
 * location, so a link in a parent directory cannot lead outside the source.
 * @returns the entry path under `root`.
 */
export async function resolveEntry(root: string, path: string, expect: 'file' | 'directory'): Promise<string> {
  const target = within(root, path)
  if (target !== resolve(root) && (await lstat(target)).isSymbolicLink()) {
    throw new Error(`${path} is a symbolic link; index entries may not be links`)
  }
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${sep}`)) throw new Error(`${path} resolves outside the source`)
  const info = await stat(realTarget)
  if (expect === 'file' ? !info.isFile() : !info.isDirectory()) throw new Error(`${path} is not a ${expect}`)
  return target
}

export async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isAbsent(error)) return undefined
    throw error
  }
}

/** Read one cache file; a malformed or missing one reads as absent. */
export async function readCache(path: string): Promise<CachedIndex | undefined> {
  const text = await readOptionalText(path)
  if (text === undefined) return undefined
  try {
    const value = JSON.parse(text) as unknown
    if (!isRecord(value) || value.format !== 1 || typeof value.source !== 'string' || !isSourceKind(value.kind)) return undefined
    if (!Array.isArray(value.skills) || !Array.isArray(value.rules)) return undefined
    if (!value.skills.every(isCachedEntry) || !value.rules.every(isCachedEntry)) return undefined
    return value as unknown as CachedIndex
  } catch {
    return undefined
  }
}

export async function writeCache(path: string, cache: CachedIndex): Promise<void> {
  await writeAtomic(path, `${JSON.stringify(cache, null, 2)}\n`)
}

/** Read a level's install manifest. A malformed file reads as empty and carries the error. */
export async function readInstalled(path: string): Promise<InstalledState> {
  const text = await readOptionalText(path)
  if (text === undefined) return { items: {} }
  try {
    const value = JSON.parse(text) as unknown
    if (!isRecord(value) || !isRecord(value.items)) throw new Error('the file must contain an "items" object')
    const items: Record<string, InstalledItem> = {}
    for (const [key, item] of Object.entries(value.items)) {
      if (!isInstalledItem(item)) throw new Error(`items.${key} is not an installed item`)
      items[key] = item
    }
    return { items }
  } catch (error) {
    return { items: {}, error: `${path} is malformed: ${(error as Error).message}` }
  }
}

export async function writeInstalled(path: string, state: InstalledState): Promise<void> {
  const items = Object.fromEntries(Object.entries(state.items).sort(([a], [b]) => a.localeCompare(b)))
  await writeAtomic(path, `${JSON.stringify({ format: 1, items }, null, 2)}\n`)
}

/** Whether an entry's content is newer than the installed copy. Foreign copies never update. */
export function updateAvailable(item: InstalledItem, source: string, entry: CachedSkill | CachedRule): boolean {
  if (item.source !== source) return false
  const revisionChanged = item.oid !== undefined && entry.oid !== undefined
    ? item.oid !== entry.oid
    : item.digest !== undefined && entry.digest !== undefined
      ? item.digest !== entry.digest
      : false
  return revisionChanged || versionIsNewer(entry.version, item.version)
}

/**
 * Compare two version strings. Returns a positive number when `left` is
 * newer, a negative one when it is older, and `0` when they are equal.
 * `undefined` means at least one side is not a version this function reads.
 *
 * The reader accepts an optional `v` or `=` prefix, any number of numeric
 * core components (`1.2`, `1.2.0`, `1.2.3.4`), a prerelease after `-`, and
 * build metadata after `+`. Prerelease identifiers follow SemVer: numbers
 * compare numerically, a number sorts before text, and a prerelease sorts
 * before the release without one.
 */
export function compareVersions(left: string, right: string): number | undefined {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return undefined
  const length = Math.max(a.core.length, b.core.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const count = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index]
    const rightPart = b.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      if (leftPart !== rightPart) return leftPart - rightPart
    } else if (typeof leftPart === 'number') {
      return -1
    } else if (typeof rightPart === 'number') {
      return 1
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1
    }
  }
  return 0
}

function versionIsNewer(next: string | undefined, current: string | undefined): boolean {
  if (next === undefined) return false
  if (current === undefined) return true
  const order = compareVersions(next, current)
  return order === undefined ? next !== current : order > 0
}

function parseVersion(value: string): { core: number[], prerelease: (number | string)[] } | undefined {
  const text = value.trim().replace(/^[vV]/, '').replace(/^=/, '')
  const withoutBuild = text.split('+', 1)[0] ?? ''
  const dash = withoutBuild.indexOf('-')
  const coreText = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  const prereleaseText = dash === -1 ? '' : withoutBuild.slice(dash + 1)
  if (coreText === '') return undefined
  const core: number[] = []
  for (const part of coreText.split('.')) {
    if (!/^\d+$/.test(part)) return undefined
    core.push(Number(part))
  }
  const prerelease = prereleaseText === ''
    ? []
    : prereleaseText.split('.').map(part => /^\d+$/.test(part) ? Number(part) : part)
  return { core, prerelease }
}

/** sha256 of a file's bytes, prefixed `sha256:`. */
export async function digestFile(path: string): Promise<string> {
  return digestBytes(await readFile(path))
}

export function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

/**
 * Digest of a directory tree: paths and contents in sorted order, so the same
 * files always hash alike. Symbolic links are hashed by target; installing
 * refuses them.
 */
export async function digestTree(root: string): Promise<string> {
  const hash = createHash('sha256')
  await walk(root, '', true)
  return `sha256:${hash.digest('hex')}`

  async function walk(dir: string, prefix: string, top: boolean): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git' || (top && entry.name === INDEX_FILE)) continue
      const path = join(dir, entry.name)
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isSymbolicLink()) {
        hash.update(`link\0${relative}\0${await readlink(path).catch(() => '')}\0`)
      } else if (entry.isDirectory()) {
        hash.update(`dir\0${relative}\0`)
        await walk(path, relative, false)
      } else if (entry.isFile()) {
        hash.update(`file\0${relative}\0`)
        hash.update(await readFile(path))
        hash.update('\0')
      }
    }
  }
}

/**
 * Copy a skill directory, refusing symbolic links and enforcing size limits.
 * The destination is created; its parent must exist.
 */
export async function copySkillTree(from: string, to: string): Promise<void> {
  let files = 0
  let bytes = 0
  await mkdir(to, { recursive: true })
  await walk(from, to, true)

  async function walk(sourceDir: string, targetDir: string, top: boolean): Promise<void> {
    for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
      if (entry.name === '.git' || (top && entry.name === INDEX_FILE)) continue
      const source = join(sourceDir, entry.name)
      const target = join(targetDir, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`${source} is a symbolic link; skills from an index may not contain links`)
      if (entry.isDirectory()) {
        await mkdir(target)
        await walk(source, target, false)
        continue
      }
      if (!entry.isFile()) throw new Error(`${source} is not a regular file`)
      const info = await stat(source)
      files += 1
      bytes += info.size
      if (files > MAX_SKILL_FILES) throw new Error(`the skill has more than ${String(MAX_SKILL_FILES)} files`)
      if (bytes > MAX_SKILL_BYTES) throw new Error(`the skill is larger than ${String(MAX_SKILL_BYTES)} bytes`)
      await copyFile(source, target)
      // Keep scripts executable, drop setuid/setgid and sticky bits.
      await chmod(target, info.mode & 0o777)
    }
  }
}

/** Resolve a path under a root, refusing anything that escapes it. */
export function within(root: string, path: string): string {
  const base = resolve(root)
  const target = resolve(base, path)
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error(`${path} escapes ${root}`)
  return target
}

export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, data)
  await rename(temporary, path)
}

export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

function isAbsent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function isSourceKind(value: unknown): value is IndexSourceKind {
  return value === 'git' || value === 'http' || value === 'local'
}

function isCachedEntry(value: unknown): boolean {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && Array.isArray(value.tags)
}

function isInstalledItem(value: unknown): value is InstalledItem {
  return isRecord(value)
    && (value.kind === 'skill' || value.kind === 'rule')
    && typeof value.name === 'string'
    && typeof value.source === 'string'
    && typeof value.path === 'string'
    && typeof value.digest === 'string'
    && typeof value.installedAt === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
