/**
 * Index sources: the user's `~/.agents/loadout-indexes.json`, and how a
 * source string maps to the way its index is read.
 */

import { homedir } from 'node:os'
import { resolve } from 'node:path'

export type IndexSourceKind = 'git' | 'local' | 'http'

export interface IndexSource {
  /** Canonical source string, as stored and shown. */
  id: string
  kind: IndexSourceKind
  /** Repository URL a git source clones; equal to `id` unless the shorthand was expanded. */
  gitUrl?: string
}

export const INDEXES_FILE = 'loadout-indexes.json'

/** The global source list path. */
export function indexesPath(agentsHome: string): string {
  return resolve(agentsHome, INDEXES_FILE)
}

/**
 * Classify one source string.
 * - a local directory: an absolute path or `~/…`;
 * - an HTTP index: an `http(s)` URL whose path ends in `.json`;
 * - a git repository: any other `http(s)`, `ssh`, `git@host:path`, or `owner/repo` string.
 * @throws with the accepted forms when the string matches none of them.
 */
export function classifySource(text: string): IndexSource {
  const source = text.trim()
  if (source === '') throw new Error('an index source cannot be empty')
  if (source.startsWith('-')) throw new Error('an index source cannot start with "-"')
  if (source === '~' || source.startsWith('~/') || source.startsWith('/')) {
    return { id: source === '~' ? homedir() : source.startsWith('~/') ? resolve(homedir(), source.slice(2)) : resolve(source), kind: 'local' }
  }
  if (/^https?:\/\//i.test(source)) {
    let url: URL
    try {
      url = new URL(source)
    } catch {
      throw new Error(`not a valid URL: ${source}`)
    }
    if (url.username !== '' || url.password !== '') throw new Error(`index URLs carry no credentials: ${source}`)
    if (source.includes('#')) throw new Error(fragmentError(source, url))
    return url.pathname.toLowerCase().endsWith('.json') ? { id: source, kind: 'http' } : { id: source, kind: 'git' }
  }
  if (/^ssh:\/\//i.test(source)) return { id: source, kind: 'git' }
  if (/^[^@\s]+@[^:\s]+:.+$/.test(source)) return { id: source, kind: 'git' }
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source)) {
    return { id: source, kind: 'git', gitUrl: `https://github.com/${source.replace(/\.git$/, '')}.git` }
  }
  throw new Error(
    `unrecognized index source "${source}": use an absolute directory path, an http(s) URL to index.json, `
    + 'a git URL such as https://github.com/owner/repo, or owner/repo',
  )
}

/**
 * Explain a refused `#` fragment. A fragment never reaches `fetch` or git, so
 * the source would be read by its path alone; links copied from the Nexus web
 * UI (`#preview/browse/<repo>/<path>`, `#browse/browse:<repo>:<path>`) get the
 * file URL they stand for.
 */
function fragmentError(source: string, url: URL): string {
  const fragment = url.hash.slice(1)
  const link = /^preview\/browse\/([^/]+)(?:\/(.+))?$/.exec(fragment) ?? /^browse\/browse:([^:]+)(?::(.+))?$/.exec(fragment)
  if (link === null) return `index URLs cannot have a "#" fragment: ${source}`
  const repository = decodeURIComponent(link[1] ?? '')
  const path = link[2] === undefined ? '<path to the index file>' : decodeURIComponent(link[2])
  const prefix = url.pathname.replace(/\/+$/, '')
  return `${source} is a page of the Nexus web UI, not a file; use ${url.origin}${prefix}/repository/${repository}/${path}`
}

/**
 * Read `loadout-indexes.json`. Both `{ "indexes": [...] }` and a bare array
 * are accepted, so the file stays easy to edit by hand.
 * @throws when the text is malformed or a source is not recognized.
 */
export function parseIndexesFile(text: string): string[] {
  if (text.trim() === '') return []
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`${INDEXES_FILE} is not valid JSON: ${(error as Error).message}`, { cause: error })
  }
  if (!Array.isArray(value) && isRecord(value) && value.format !== undefined && value.format !== 1) {
    throw new Error(`${INDEXES_FILE}: unsupported format ${JSON.stringify(value.format)}; this version reads 1`)
  }
  const entries = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.indexes) ? value.indexes : undefined
  if (entries === undefined) throw new Error(`${INDEXES_FILE} must contain an "indexes" array of source strings`)
  const sources: string[] = []
  for (const [index, entry] of entries.entries()) {
    if (typeof entry !== 'string') throw new Error(`${INDEXES_FILE}: indexes[${index}] must be a string`)
    const normalized = classifySource(entry).id
    if (!sources.includes(normalized)) sources.push(normalized)
  }
  return sources
}

export function serializeIndexesFile(sources: readonly string[]): string {
  return `${JSON.stringify({ format: 1, indexes: [...sources] }, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
