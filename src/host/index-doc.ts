/**
 * `loadout-index.json`: the catalog of skills and rules an index publishes.
 * The parser validates everything the installer will later act on – names,
 * relative paths, duplicates – so a malformed index is refused before any
 * file leaves its source.
 */

/** One skill an index offers: a directory (or archive, for HTTP sources) with `SKILL.md`. */
export interface IndexSkillEntry {
  name: string
  description: string | undefined
  version: string | undefined
  tags: string[]
  /** Path relative to the source root; `"."` is the root itself. */
  path: string
  /** HTTP sources only: files fetched under `path`; omitted means `SKILL.md` alone. */
  files: string[] | undefined
}

/** One rule an index offers: a single Markdown file. */
export interface IndexRuleEntry {
  name: string
  description: string | undefined
  version: string | undefined
  tags: string[]
  /** Path relative to the source root. */
  path: string
}

export interface IndexDocument {
  title: string | undefined
  description: string | undefined
  skills: IndexSkillEntry[]
  rules: IndexRuleEntry[]
}

export const INDEX_FILE = 'loadout-index.json'
export const INDEX_FORMAT = 1

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RULE_NAME = /^[a-z0-9][a-z0-9_-]*$/

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
  if (value.format !== undefined && value.format !== INDEX_FORMAT) {
    throw invalid(label, 'format', `unsupported format ${JSON.stringify(value.format)}; this version reads ${INDEX_FORMAT}`)
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
    const entry = parseSkill(raw, label, at)
    if (seen.has(`skill/${entry.name}`)) throw invalid(label, `${at}.name`, `duplicate skill "${entry.name}"`)
    seen.add(`skill/${entry.name}`)
    document.skills.push(entry)
  }
  for (const [index, raw] of list(value.rules, label, 'rules').entries()) {
    const at = `rules[${index}]`
    const entry = parseRule(raw, label, at)
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
  const path = value.trim().replaceAll('\\', '/')
  if (path === '.' || path === './') return '.'
  if (path === '' || path.startsWith('/') || path.includes('\0')) throw invalid(label, at, 'the path must be relative to the source root')
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
