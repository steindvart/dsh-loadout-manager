/**
 * `loadout-index.json`: the catalog of skills and rules an index publishes.
 * The parser validates everything the installer will later act on – names,
 * relative paths, npm package pins, duplicates – so a malformed index is
 * refused before any file leaves its source.
 *
 * Format 1 entries name a path inside the source. Format 2 entries list npm
 * package versions, as a DSH plugin market index does; the parser pins the
 * one the installer fetches.
 */

import { compareVersions } from './version.ts'

/** The npm package version a format 2 entry installs. */
export interface NpmPin {
  package: string
  /** Exact SemVer version. */
  version: string
  /** Registry URL with a trailing slash. */
  registry: string
}

/** One skill an index offers: a directory (or archive, for HTTP sources) with `SKILL.md`. */
export interface IndexSkillEntry {
  name: string
  description: string | undefined
  version: string | undefined
  tags: string[]
  /** Path relative to the source root; `"."` is the root itself. A format 2 entry holds `<package>@<version>`. */
  path: string
  /** HTTP sources only: files fetched under `path`; omitted means `SKILL.md` alone. */
  files: string[] | undefined
  /** Format 2: the package the skill is installed from instead of `path`. */
  npm?: NpmPin
}

/** One rule an index offers: a single Markdown file. */
export interface IndexRuleEntry {
  name: string
  description: string | undefined
  version: string | undefined
  tags: string[]
  /** Path relative to the source root. A format 2 entry holds `<package>@<version>`. */
  path: string
  /** Format 2: the package the rule is installed from instead of `path`. */
  npm?: NpmPin
}

export interface IndexDocument {
  title: string | undefined
  description: string | undefined
  skills: IndexSkillEntry[]
  rules: IndexRuleEntry[]
}

export const INDEX_FILE = 'loadout-index.json'
export const INDEX_FORMATS = [1, 2] as const

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RULE_NAME = /^[a-z0-9][a-z0-9_-]*$/
/** npm's rule for new package names: lowercase, URL-safe, an optional scope. */
const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const NPM_NAME_MAX = 214
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const MAX_TIMESTAMP = 1e11

/**
 * Parse and validate an index document.
 * @param text - the file contents.
 * @param label - file or URL named in errors.
 * @throws with the JSON path of the first invalid value.
 */
export function parseIndexDocument(text: string, label: string): IndexDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`, { cause: error })
  }
  if (!isRecord(value)) throw invalid(label, '', 'the document must be a JSON object')
  const format = value.format ?? 1
  if (format !== 1 && format !== 2) {
    throw invalid(label, 'format', `unsupported format ${JSON.stringify(value.format)}; this version reads ${INDEX_FORMATS.join(' and ')}`)
  }
  const document: IndexDocument = {
    title: optionalText(value.title, label, 'title'),
    description: optionalText(value.description, label, 'description'),
    skills: [],
    rules: [],
  }
  const seen = new Set<string>()
  for (const [index, raw] of list(value.skills, label, 'skills').entries()) {
    const at = `skills[${index}]`
    const entry = format === 2 ? { ...parseNpmEntry(raw, label, at, 'skill'), files: undefined } : parseSkill(raw, label, at)
    if (seen.has(`skill/${entry.name}`)) throw invalid(label, `${at}.name`, `duplicate skill "${entry.name}"`)
    seen.add(`skill/${entry.name}`)
    document.skills.push(entry)
  }
  for (const [index, raw] of list(value.rules, label, 'rules').entries()) {
    const at = `rules[${index}]`
    const entry = format === 2 ? parseNpmEntry(raw, label, at, 'rule') : parseRule(raw, label, at)
    if (seen.has(`rule/${entry.name}`)) throw invalid(label, `${at}.name`, `duplicate rule "${entry.name}"`)
    seen.add(`rule/${entry.name}`)
    document.rules.push(entry)
  }
  return document
}

function parseSkill(raw: unknown, label: string, at: string): IndexSkillEntry {
  const entry = record(raw, label, at)
  const name = indexName(entry.name, label, `${at}.name`, SKILL_NAME, 'skill')
  const files = entry.files === undefined ? undefined : fileList(entry.files, label, `${at}.files`)
  return {
    name,
    description: optionalText(entry.description, label, `${at}.description`),
    version: optionalVersion(entry.version, label, `${at}.version`),
    tags: optionalTags(entry.tags, label, `${at}.tags`),
    path: relativePath(entry.path, label, `${at}.path`),
    files,
  }
}

function parseRule(raw: unknown, label: string, at: string): IndexRuleEntry {
  const entry = record(raw, label, at)
  const name = indexName(entry.name, label, `${at}.name`, RULE_NAME, 'rule')
  const path = relativePath(entry.path, label, `${at}.path`)
  if (!path.toLowerCase().endsWith('.md')) throw invalid(label, `${at}.path`, 'a rule path must name a .md file')
  return {
    name,
    description: optionalText(entry.description, label, `${at}.description`),
    version: optionalVersion(entry.version, label, `${at}.version`),
    tags: optionalTags(entry.tags, label, `${at}.tags`),
    path,
  }
}

/**
 * A format 2 entry: every listed version with its npm source, and the pin
 * the installer uses – the `latest` dist-tag, else the highest release, else
 * the highest prerelease.
 */
function parseNpmEntry(raw: unknown, label: string, at: string, kind: 'skill' | 'rule'): IndexRuleEntry & { npm: NpmPin } {
  const entry = record(raw, label, at)
  const name = indexName(entry.name, label, `${at}.name`, kind === 'skill' ? SKILL_NAME : RULE_NAME, kind)
  const versions = new Map<string, NpmPin>()
  const listed = entry.versions
  if (!Array.isArray(listed) || listed.length === 0) throw invalid(label, `${at}.versions`, 'must be a non-empty array')
  for (const [index, item] of listed.entries()) {
    const itemAt = `${at}.versions[${index}]`
    const version = record(item, label, itemAt)
    const exact = exactVersion(version.version, label, `${itemAt}.version`)
    if (versions.has(exact)) throw invalid(label, `${itemAt}.version`, `duplicate version "${exact}"`)
    const timestamp = version.publishTimestamp
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp < 0 || timestamp >= MAX_TIMESTAMP) {
      throw invalid(label, `${itemAt}.publishTimestamp`, 'must be a Unix time in seconds')
    }
    versions.set(exact, { ...npmSource(version.source, label, `${itemAt}.source`), version: exact })
  }
  const latest = distTags(entry['dist-tags'], label, `${at}.dist-tags`, versions).latest
  const pin = versions.get(latest ?? highestVersion([...versions.keys()])) as NpmPin
  return {
    name,
    description: optionalText(entry.description, label, `${at}.description`),
    version: pin.version,
    tags: optionalTags(entry.tags, label, `${at}.tags`),
    path: `${pin.package}@${pin.version}`,
    npm: pin,
  }
}

function exactVersion(value: unknown, label: string, at: string): string {
  if (typeof value !== 'string' || !SEMVER.test(value)) throw invalid(label, at, 'must be an exact SemVer version such as 1.2.0')
  return value
}

function npmSource(value: unknown, label: string, at: string): Omit<NpmPin, 'version'> {
  const source = record(value, label, at)
  if (source.type !== 'npm') throw invalid(label, `${at}.type`, `unsupported source type ${JSON.stringify(source.type)}; this version installs "npm"`)
  const pkg = source.package
  if (typeof pkg !== 'string' || pkg.length > NPM_NAME_MAX || !NPM_NAME.test(pkg)) {
    throw invalid(label, `${at}.package`, `${JSON.stringify(pkg)} is not a valid npm package name`)
  }
  return { package: pkg, registry: registryUrl(source.registry, label, `${at}.registry`) }
}

/** An http(s) registry URL without credentials, query, or fragment, with a trailing slash. */
function registryUrl(value: unknown, label: string, at: string): string {
  let url: URL
  try {
    if (typeof value !== 'string') throw new TypeError('not a string')
    url = new URL(value)
  } catch {
    throw invalid(label, at, 'the registry must be an http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid(label, at, 'the registry must be an http(s) URL')
  if (url.username !== '' || url.password !== '') throw invalid(label, at, 'the registry URL carries no credentials')
  if (url.search !== '' || url.hash !== '' || (value as string).includes('#') || (value as string).includes('?')) {
    throw invalid(label, at, 'the registry URL has no query or fragment')
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}

/** npm dist-tags: tag name → a listed version. */
function distTags(value: unknown, label: string, at: string, versions: ReadonlyMap<string, unknown>): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw invalid(label, at, 'must be an object')
  const tags: Record<string, string> = {}
  for (const [tag, target] of Object.entries(value)) {
    if (typeof target !== 'string' || !versions.has(target)) throw invalid(label, `${at}.${tag}`, `${JSON.stringify(target)} is not a listed version`)
    tags[tag] = target
  }
  return tags
}

/** The highest release, or the highest prerelease when every version is one. */
function highestVersion(versions: readonly string[]): string {
  const releases = versions.filter(version => !(version.split('+', 1)[0] ?? '').includes('-'))
  const pool = releases.length > 0 ? releases : versions
  return pool.reduce((best, version) => (compareVersions(version, best) ?? 0) > 0 ? version : best)
}

function indexName(value: unknown, label: string, at: string, pattern: RegExp, kind: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw invalid(label, at, `${kind} names use ${kind === 'skill' ? 'kebab-case' : 'lowercase letters, digits, "-", and "_"'}`)
  }
  return value
}

/**
 * A `/`-separated path inside the source. `"."` is the source root; every
 * other path is relative, contains no `.`/`..`/`.git` segment, and cannot
 * escape the root when joined.
 */
export function relativePath(value: unknown, label = 'path', at = ''): string {
  if (typeof value !== 'string') throw invalid(label, at, 'a relative path is required')
  const path = value.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  if (path === '.' || path === '') {
    if (value.trim() === '.' || value.trim() === './') return '.'
    if (path === '') throw invalid(label, at, 'the path must be relative to the source root')
  }
  if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\0')) throw invalid(label, at, 'the path must be relative to the source root')
  for (const part of path.split('/')) {
    if (part === '' || part === '.' || part === '..' || part === '.git') throw invalid(label, at, `"${value}" is not a safe relative path`)
  }
  return path
}

function fileList(value: unknown, label: string, at: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw invalid(label, at, 'files must be a non-empty array of relative paths')
  const files = value.map((item, index) => {
    const file = relativePath(item, label, `${at}[${index}]`)
    if (file === '.') throw invalid(label, `${at}[${index}]`, 'files must name a file inside the entry path')
    return file
  })
  return [...new Set(files)]
}

function optionalTags(value: unknown, label: string, at: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid(label, at, 'tags must be an array of strings')
  const tags = value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') throw invalid(label, `${at}[${index}]`, 'a tag must be a non-empty string')
    return item.trim()
  })
  return [...new Set(tags)]
}

function optionalVersion(value: unknown, label: string, at: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  throw invalid(label, at, 'version must be a non-empty string or a number')
}

function optionalText(value: unknown, label: string, at: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw invalid(label, at, 'must be a non-empty string')
  return value
}

function list(value: unknown, label: string, at: string): readonly unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid(label, at, 'must be an array')
  return value
}

function record(value: unknown, label: string, at: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(label, at, 'must be an object')
  return value
}

function invalid(label: string, at: string, reason: string): Error {
  return new Error(`${label}${at === '' ? '' : `: ${at}`}: ${reason}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
