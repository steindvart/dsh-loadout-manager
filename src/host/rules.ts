/**
 * Model-facing rule messages. Mirrors `dsh-agent-instructions`: one baseline
 * `<system-reminder>` with every enabled rule, then append-only change
 * messages. A snapshot `{ displayPath: digest }` records what the model has
 * seen, so state can be rebuilt from the session log. Rules dropped by the
 * byte budget are recorded as `omitted:<digest>` so they are not retried
 * until their content changes.
 */

import { createHash } from 'node:crypto'

const OPEN = '<system-reminder>'
const CLOSE = '</system-reminder>'
const INTRO = 'The following rules apply to your work. Treat them like workspace instructions: '
  + 'more specific rules take precedence over broader ones, and they do not override system, developer, '
  + 'or direct user instructions.'
const UPDATED = 'This rule changed after it was loaded. Use the following content instead of the previously loaded rule from this file.'
const REMOVED = 'The previously loaded rule from this file no longer applies.'
const OMITTED = 'omitted:'

/** A rule as the model sees it. */
export interface RuleText {
  displayPath: string
  body: string
}

/** `{ displayPath: digest }` of what the model has seen; `omitted:<digest>` marks a rule dropped by the budget. */
export type RuleSnapshot = Record<string, string>

export interface Rendered {
  /** `<system-reminder>` text, empty when there is nothing to say. */
  text: string
  snapshot: RuleSnapshot
}

interface Section {
  displayPath: string
  head: string
  body: string
  removal?: boolean
}

/** @param rules - enabled rules, broadest first */
export function renderBaseline(rules: readonly RuleText[], { maxBytes }: { maxBytes: number }): Rendered {
  if (rules.length === 0) return { text: '', snapshot: {} }
  const items = rules.map(rule => ({
    displayPath: rule.displayPath,
    head: `Rule from: ${rule.displayPath}`,
    body: rule.body,
  }))
  const { text, omitted } = fit(items, INTRO, maxBytes)
  const snapshot: RuleSnapshot = {}
  for (const rule of rules) snapshot[rule.displayPath] = (omitted.has(rule.displayPath) ? OMITTED : '') + ruleDigest(rule.body)
  return { text, snapshot }
}

/**
 * @param previous - snapshot the model has seen
 * @param rules - current enabled rules, broadest first
 * @returns empty text when nothing changed
 */
export function renderChanges(previous: RuleSnapshot, rules: readonly RuleText[], { maxBytes }: { maxBytes: number }): Rendered {
  const items: Section[] = []
  const snapshot: RuleSnapshot = {}
  for (const rule of rules) {
    const digest = ruleDigest(rule.body)
    const seen = previous[rule.displayPath]
    snapshot[rule.displayPath] = seen ?? digest
    if (seen === digest || seen === OMITTED + digest) continue
    snapshot[rule.displayPath] = digest
    const visible = seen !== undefined && !seen.startsWith(OMITTED)
    items.push(visible
      ? { displayPath: rule.displayPath, head: `Updated rule from: ${rule.displayPath}\n\n${UPDATED}`, body: rule.body }
      : { displayPath: rule.displayPath, head: `Additional rule from: ${rule.displayPath}`, body: rule.body })
  }
  const current = new Set(rules.map(rule => rule.displayPath))
  for (const [displayPath, seen] of Object.entries(previous)) {
    if (current.has(displayPath) || seen.startsWith(OMITTED)) continue
    items.push({ displayPath, head: `Rule removed: ${displayPath}`, body: REMOVED, removal: true })
  }
  if (items.length === 0) return { text: '', snapshot: previous }
  const { text, omitted } = fit(items, undefined, maxBytes)
  for (const item of items) {
    if (!omitted.has(item.displayPath)) continue
    if (item.removal) snapshot[item.displayPath] = previous[item.displayPath] ?? ''
    else snapshot[item.displayPath] = OMITTED + (snapshot[item.displayPath] ?? '')
  }
  return { text, snapshot }
}

/** Digest of a rule body as the model saw it. */
export function ruleDigest(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16)
}

/**
 * Fit sections into `maxBytes`: drop the broadest (earliest) first, then
 * truncate the last one. Returns the text and the omitted display paths.
 */
function fit(items: Section[], intro: string | undefined, maxBytes: number): { text: string, omitted: Set<string> } {
  const build = (included: Section[], omitted: Section[], truncated: { displayPath: string, full: string, body: string } | undefined): string => {
    const notes: string[] = []
    if (omitted.length > 0) notes.push(`omitted ${omitted.map(item => item.displayPath).join(', ')}`)
    if (truncated) notes.push(`truncated ${truncated.displayPath} from ${bytes(truncated.full)} to ${bytes(truncated.body)} bytes`)
    const marker = notes.length > 0 ? [`Rule budget ${maxBytes} bytes: ${notes.join('; ')}`] : []
    const introBlock = intro === undefined ? [] : [intro]
    return frame([...marker, ...introBlock, ...included.map(item => `${item.head}\n\n${item.body}`)])
  }
  for (let start = 0; start < items.length; start += 1) {
    const text = build(items.slice(start), items.slice(0, start), undefined)
    if (bytes(text) <= maxBytes) return { text, omitted: new Set(items.slice(0, start).map(item => item.displayPath)) }
  }
  const last = items.at(-1)
  if (last === undefined) return { text: '', omitted: new Set() }
  const omittedItems = items.slice(0, -1)
  const omitted = new Set(omittedItems.map(item => item.displayPath))
  let low = 0
  let high = bytes(last.body)
  let best: string | undefined
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const body = truncateUtf8(last.body, mid)
    const text = build([{ ...last, body }], omittedItems, { displayPath: last.displayPath, full: last.body, body })
    if (bytes(text) <= maxBytes) {
      best = text
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (best === undefined) {
    omitted.add(last.displayPath)
    return { text: '', omitted }
  }
  return { text: best, omitted }
}

function frame(blocks: string[]): string {
  return [OPEN, blocks.join('\n\n').replaceAll(CLOSE, '<\\/system-reminder>'), CLOSE].join('\n')
}

function bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

function truncateUtf8(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8')
  if (buffer.length <= maxBytes) return text
  let end = maxBytes
  while (end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1
  return buffer.subarray(0, end).toString('utf8')
}
