/**
 * Reading index sources: a git repository (fetched into a cache clone), a
 * local directory, or an HTTP JSON document. Also materializes one entry into
 * a staging directory – copying a skill tree or fetching a rule file – so the
 * installer can validate it before it replaces anything.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { INDEX_FILE, parseIndexDocument, type IndexSkillEntry } from './index-doc.ts'
import type { IndexSource } from './index-sources.ts'
import {
  MAX_ARCHIVE_BYTES, MAX_INDEX_BYTES, MAX_RULE_BYTES, cacheDir, cacheFile, copySkillTree, digestFile, digestTree,
  readBytes, readCache, readTextFile, removeDirectory, repoDir, resolveEntry, within, writeCache,
  type CachedIndex, type CachedRule, type CachedSkill,
} from './index-store.ts'

const INDEX_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 30_000
const GIT_TIMEOUT_MS = 60_000
const GIT_MAX_BUFFER = 16 * 1024 * 1024
const ARCHIVE_EXTENSIONS = ['.tar.gz', '.tgz', '.zip']

export interface FetchOptions {
  dshHome: string
  signal?: AbortSignal | undefined
  fetchImpl?: typeof fetch | undefined
}

/**
 * Read one source and write its cache file. Failures are returned in the cache
 * `error` field with the previously cached entries intact, so one broken
 * source never hides the rest of the catalog.
 */
export async function refreshSource(source: IndexSource, options: FetchOptions): Promise<CachedIndex> {
  const previous = await readCache(cacheFile(options.dshHome, source.id))
  const checkedAt = Date.now()
  try {
    const cache = source.kind === 'git'
      ? await refreshGit(source, options)
      : source.kind === 'local' ? await refreshLocal(source) : await refreshHttp(source, options)
    const fresh = { ...cache, checkedAt }
    await writeCache(cacheFile(options.dshHome, source.id), fresh)
    return fresh
  } catch (error) {
    const failed: CachedIndex = {
      ...previous ?? emptyCache(source),
      checkedAt,
      error: messageOf(error),
    }
    try {
      await writeCache(cacheFile(options.dshHome, source.id), failed)
    } catch {
      // The cache directory is unwritable; the in-memory result still reaches the page.
    }
    return failed
  }
}

/** A source is stale when it was never read or its last attempt is older than `ttlMs`. */
export function isStale(cache: CachedIndex | undefined, ttlMs: number, now = Date.now()): boolean {
  if (cache === undefined) return true
  return now - (cache.checkedAt ?? 0) > ttlMs
}

function emptyCache(source: IndexSource): CachedIndex {
  return { format: 1, source: source.id, kind: source.kind, skills: [], rules: [] }
}

async function refreshGit(source: IndexSource, { dshHome }: FetchOptions): Promise<CachedIndex> {
  const dir = repoDir(dshHome, source.id)
  await mkdir(cacheDir(dshHome, source.id), { recursive: true })
  if (!existsSync(join(dir, '.git'))) {
    await removeDirectory(dir)
    await git(['clone', '--depth', '1', '--single-branch', '--no-tags', '--quiet', '--', source.gitUrl ?? source.id, dir])
  } else {
    await git(['fetch', '--depth', '1', '--no-tags', '--quiet', 'origin', 'HEAD'], dir)
    await git(['reset', '--hard', '--quiet', 'FETCH_HEAD'], dir)
    await git(['clean', '-fdq'], dir)
  }
  return await scanGitCheckout(source, dir)
}

/**
 * Read the index of a checked-out clone at its HEAD: entry ids come from the
 * git tree, so a symbolic link is refused even before it reaches the disk.
 */
export async function scanGitCheckout(source: IndexSource, dir: string): Promise<CachedIndex> {
  const commit = (await git(['rev-parse', 'HEAD'], dir)).trim()
  const text = await readTextFile(join(dir, INDEX_FILE), MAX_INDEX_BYTES)
  const document = parseIndexDocument(text, `${source.id}/${INDEX_FILE}`)
  const skills: CachedSkill[] = []
  for (const entry of document.skills) {
    const item = await treeEntry(dir, entry.path)
    if (item.type !== 'tree') throw new Error(`${source.id}: ${notTree(entry.path, item.mode)}`)
    const skillFile = await treeEntry(dir, childPath(entry.path, 'SKILL.md'))
    if (skillFile.type !== 'blob' || skillFile.mode === SYMLINK_MODE) throw new Error(`${source.id}: ${childPath(entry.path, 'SKILL.md')} is not a regular file`)
    skills.push({ ...entry, oid: item.oid })
  }
  const rules: CachedRule[] = []
  for (const entry of document.rules) {
    const item = await treeEntry(dir, entry.path)
    if (item.mode === SYMLINK_MODE) throw new Error(`${source.id}: ${entry.path} is a symbolic link; index entries may not be links`)
    if (item.type !== 'blob') throw new Error(`${source.id}: ${entry.path} is not a file in the source`)
    rules.push({ ...entry, oid: item.oid })
  }
  return {
    format: 1,
    source: source.id,
    kind: 'git',
    fetchedAt: Date.now(),
    ...document.title !== undefined ? { title: document.title } : {},
    ...document.description !== undefined ? { description: document.description } : {},
    commit,
    skills,
    rules,
  }
}

async function refreshLocal(source: IndexSource): Promise<CachedIndex> {
  await resolveEntry(source.id, '.', 'directory')
  const text = await readTextFile(join(source.id, INDEX_FILE), MAX_INDEX_BYTES)
  const document = parseIndexDocument(text, `${source.id}/${INDEX_FILE}`)
  const skills: CachedSkill[] = []
  for (const entry of document.skills) {
    const dir = await resolveEntry(source.id, entry.path, 'directory')
    await resolveEntry(source.id, childPath(entry.path, 'SKILL.md'), 'file')
    skills.push({ ...entry, digest: await digestTree(dir) })
  }
  const rules: CachedRule[] = []
  for (const entry of document.rules) {
    rules.push({ ...entry, digest: await digestFile(await resolveEntry(source.id, entry.path, 'file')) })
  }
  return {
    format: 1,
    source: source.id,
    kind: 'local',
    fetchedAt: Date.now(),
    ...document.title !== undefined ? { title: document.title } : {},
    ...document.description !== undefined ? { description: document.description } : {},
    skills,
    rules,
  }
}

async function refreshHttp(source: IndexSource, { fetchImpl = fetch, signal }: FetchOptions): Promise<CachedIndex> {
  const { bytes, url } = await fetchBytes(source.id, MAX_INDEX_BYTES, INDEX_TIMEOUT_MS, fetchImpl, signal)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const document = parseIndexDocument(text, source.id)
  return {
    format: 1,
    source: source.id,
    kind: 'http',
    fetchedAt: Date.now(),
    base: url,
    ...document.title !== undefined ? { title: document.title } : {},
    ...document.description !== undefined ? { description: document.description } : {},
    skills: document.skills,
    rules: document.rules,
  }
}

/** Write a skill's files into `staging`, which must not exist yet. */
export async function stageSkill(cache: CachedIndex, entry: CachedSkill, options: FetchOptions, staging: string): Promise<void> {
  if (cache.kind === 'git') {
    const dir = repoDir(options.dshHome, cache.source)
    await assertHead(dir, cache)
    await copySkillTree(await resolveEntry(dir, entry.path, 'directory'), staging)
    return
  }
  if (cache.kind === 'local') {
    await copySkillTree(await resolveEntry(cache.source, entry.path, 'directory'), staging)
    return
  }
  await stageHttpSkill(cache, entry, options, staging)
}

/** Read a rule file from the source, bounded by `MAX_RULE_BYTES`. */
export async function ruleContent(cache: CachedIndex, entry: CachedRule, options: FetchOptions): Promise<Uint8Array> {
  if (cache.kind === 'git') {
    const dir = repoDir(options.dshHome, cache.source)
    await assertHead(dir, cache)
    return await readBytes(await resolveEntry(dir, entry.path, 'file'), MAX_RULE_BYTES)
  }
  if (cache.kind === 'local') return await readBytes(await resolveEntry(cache.source, entry.path, 'file'), MAX_RULE_BYTES)
  const base = cache.base ?? cache.source
  const { bytes } = await fetchBytes(resolveUrl(base, entry.path), MAX_RULE_BYTES, DOWNLOAD_TIMEOUT_MS, options.fetchImpl ?? fetch, options.signal)
  return bytes
}

async function stageHttpSkill(cache: CachedIndex, entry: IndexSkillEntry, options: FetchOptions, staging: string): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = cache.base ?? cache.source
  const entryUrl = resolveUrl(base, entry.path)
  if (ARCHIVE_EXTENSIONS.some(extension => new URL(entryUrl).pathname.toLowerCase().endsWith(extension))) {
    await stageArchive(entryUrl, options, staging)
    return
  }
  const directory = entry.path === '.' ? new URL('.', base).href : ensureDirectoryUrl(entryUrl)
  const files = entry.files ?? ['SKILL.md']
  if (files.length > 2000) throw new Error(`${entry.name}: more than 2000 files`)
  let bytesTotal = 0
  for (const file of files) {
    const url = resolveUrl(directory, file)
    const { bytes } = await fetchBytes(url, MAX_ARCHIVE_BYTES, DOWNLOAD_TIMEOUT_MS, fetchImpl, options.signal)
    bytesTotal += bytes.byteLength
    if (bytesTotal > MAX_ARCHIVE_BYTES) throw new Error(`${entry.name} is larger than ${String(MAX_ARCHIVE_BYTES)} bytes`)
    const target = within(staging, file)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, bytes)
  }
  if (!existsSync(join(staging, 'SKILL.md'))) throw new Error(`${entry.name}: the source did not provide SKILL.md`)
}

async function stageArchive(url: string, options: FetchOptions, staging: string): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const { bytes } = await fetchBytes(url, MAX_ARCHIVE_BYTES, DOWNLOAD_TIMEOUT_MS, fetchImpl, options.signal)
  const parent = join(cacheDir(options.dshHome, url), 'tmp')
  await mkdir(parent, { recursive: true })
  const temp = await mkdtemp(join(parent, 'archive-'))
  try {
    const archive = join(temp, 'archive')
    await writeFile(archive, bytes)
    const extracted = join(temp, 'extracted')
    await mkdir(extracted)
    const zip = new URL(url).pathname.toLowerCase().endsWith('.zip')
    const entries = await listArchive(archive, zip, options.signal)
    if (entries.some(entry => !safeArchivePath(entry))) throw new Error('the archive contains an unsafe path')
    if (zip) {
      await runTool('unzip', ['-q', '-o', archive, '-d', extracted], options.signal)
    } else {
      await runTool('tar', ['-xzf', archive, '-C', extracted, '--no-same-owner', '--no-same-permissions'], options.signal)
    }
    const root = await skillRoot(extracted)
    await copySkillTree(root, staging)
  } finally {
    await removeDirectory(temp)
  }
}

/** The archive root holding SKILL.md: itself, or its single top-level directory. */
async function skillRoot(extracted: string): Promise<string> {
  if (existsSync(join(extracted, 'SKILL.md'))) return extracted
  const candidates: string[] = []
  for (const entry of await readdir(extracted, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const root = join(extracted, entry.name)
    if (existsSync(join(root, 'SKILL.md'))) candidates.push(root)
  }
  if (candidates.length === 1) return candidates[0] as string
  throw new Error('the archive must contain SKILL.md at its root or inside one top-level directory')
}

async function assertHead(repo: string, cache: CachedIndex): Promise<void> {
  if (cache.commit === undefined) throw new Error('the cached git source has no commit')
  const head = (await git(['rev-parse', 'HEAD'], repo)).trim()
  if (head !== cache.commit) throw new Error('the cached clone changed; refresh the source and try again')
}

const SYMLINK_MODE = '120000'

/** Mode, object type, and id of one path at HEAD, as `git ls-tree` reports it. */
async function treeEntry(repo: string, path: string): Promise<{ mode: string, type: string, oid: string }> {
  // `HEAD:` alone is not a valid tree expression, so the root tree is asked for directly.
  if (path === '.') return { mode: '040000', type: 'tree', oid: (await git(['rev-parse', '--verify', 'HEAD^{tree}'], repo)).trim() }
  const line = (await git(['ls-tree', '-z', 'HEAD', '--', path], repo)).split('\0')[0] ?? ''
  const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(line)
  if (match?.[4] !== path) throw new Error(`${path} is missing in the source`)
  return { mode: match[1] ?? '', type: match[2] ?? '', oid: match[3] ?? '' }
}

function notTree(path: string, mode: string): string {
  return mode === SYMLINK_MODE ? `${path} is a symbolic link; index entries may not be links` : `${path} is not a directory in the source`
}

function childPath(path: string, file: string): string {
  return path === '.' ? file : `${path}/${file}`
}

function resolveUrl(base: string, path: string): string {
  return new URL(path === '.' ? '' : path, base).href
}

/** Ensure a file URL is treated as a directory base for relative files. */
function ensureDirectoryUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

async function fetchBytes(url: string, maxBytes: number, timeoutMs: number, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ bytes: Uint8Array, url: string }> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal === undefined ? timeout : AbortSignal.any([timeout, signal])
  let response: Response
  try {
    response = await fetchImpl(url, { signal: combined, redirect: 'follow' })
  } catch (error) {
    throw new Error(`could not fetch ${url}: ${messageOf(error)}`, { cause: error })
  }
  if (!response.ok) throw new Error(`${url} answered HTTP ${String(response.status)}`)
  const length = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(length) && length > maxBytes) throw new Error(`${url} is larger than ${String(maxBytes)} bytes`)
  const reader = response.body?.getReader()
  if (reader === undefined) {
    const fallback = new Uint8Array(await response.arrayBuffer())
    if (fallback.byteLength > maxBytes) throw new Error(`${url} is larger than ${String(maxBytes)} bytes`)
    return { bytes: fallback, url: response.url }
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`${url} is larger than ${String(maxBytes)} bytes`)
    }
    chunks.push(value)
  }
  return { bytes: Buffer.concat(chunks), url: response.url }
}

function git(args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', [
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'core.fsmonitor=false',
      '-c', 'submodule.recurse=false',
      '-c', 'gc.auto=0',
      '-c', 'protocol.allow=never',
      '-c', 'protocol.https.allow=always',
      '-c', 'protocol.http.allow=always',
      '-c', 'protocol.ssh.allow=always',
      ...args,
    ], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      env: gitEnv(),
    }, (error, stdout, stderr) => {
      if (error !== null) {
        const code = (error as NodeJS.ErrnoException).code
        reject(new Error(code === 'ENOENT' ? 'git is not installed' : `git ${args[0] ?? ''} failed: ${stderr.trim() || error.message}`))
        return
      }
      resolve(stdout)
    })
  })
}

/** Git without inherited repository overrides, prompts, or LFS downloads. */
function gitEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.startsWith('GIT_') || name === 'GIT_SSH' || name === 'GIT_SSH_COMMAND'))
  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_SSH_COMMAND: env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_LITERAL_PATHSPECS: '1',
    LC_ALL: 'C',
  }
}

function runTool(command: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: GIT_TIMEOUT_MS, signal, maxBuffer: GIT_MAX_BUFFER }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout)
        return
      }
      const code = (error as NodeJS.ErrnoException).code
      reject(new Error(code === 'ENOENT' ? `${command} is not installed` : `${command} failed: ${stderr.trim() || error.message}`))
    })
  })
}

/** Archive member names, read before extraction so a `../` entry never reaches the disk. */
function listArchive(archive: string, zip: boolean, signal?: AbortSignal): Promise<string[]> {
  return runTool(zip ? 'unzip' : 'tar', zip ? ['-Z1', archive] : ['-tzf', archive], signal)
    .then(stdout => stdout.split('\n').map(line => line.trim()).filter(line => line !== ''))
}

function safeArchivePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return false
  return normalized.split('/').every(part => part !== '..')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

