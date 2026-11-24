/**
 * YAML frontmatter of skill and rule files. Supports the subset skill authors
 * use: `key: value` pairs with plain, quoted, and block scalars, and one
 * level of nested mapping (`metadata: { version: ... }` in the Agent Skills
 * format). Lists and deeper mappings are skipped (their key reads as `null`).
 */

export type FrontmatterScalar = string | boolean | number | null
export type FrontmatterMapping = Readonly<Record<string, FrontmatterScalar>>
export type FrontmatterValue = FrontmatterScalar | FrontmatterMapping

export interface Frontmatter {
  data: Record<string, FrontmatterValue>
  /** File text after the closing fence. */
  body: string
}

/**
 * @param raw - file text
 * @returns `undefined` when the file has no frontmatter fence.
 */
export function parseFrontmatter(raw: string): Frontmatter | undefined {
  const lines = raw.split('\n')
  if (stripCr(lines[0] ?? '') !== '---') return undefined
  const closing = lines.findIndex((line, index) => index > 0 && stripCr(line) === '---')
  if (closing < 0) return undefined
  return { data: parseMapping(lines.slice(1, closing).map(stripCr), 0), body: lines.slice(closing + 1).join('\n') }
}

/** `key: value` lines at column zero; indented and blank lines continue the previous key. */
function parseMapping(yaml: string[], depth: number): Record<string, FrontmatterValue> {
  const data: Record<string, FrontmatterValue> = {}
  let index = 0
  while (index < yaml.length) {
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(yaml[index] ?? '')
    index += 1
    if (!match?.[1]) continue
    const head = (match[2] ?? '').trim()
    const continuation: string[] = []
    for (let line = yaml[index]; line !== undefined && (line.trim() === '' || /^\s/.test(line)); line = yaml[index]) {
      continuation.push(line)
      index += 1
    }
    data[match[1]] = parseValue(head, continuation, depth)
  }
  return data
}

function parseValue(head: string, continuation: string[], depth: number): FrontmatterValue {
  const block = /^([|>])([+-]?)\s*(?:#.*)?$/.exec(head)
  if (block) return parseBlockScalar(block[1] === '|' ? '|' : '>', block[2] ?? '', continuation)
  const nested = continuation.filter(line => line.trim() !== '')
  if (head === '' && nested.length > 0) {
    if (depth > 0 || nested[0]?.trim().startsWith('-')) return null
    const indent = Math.min(...nested.map(line => /^\s*/.exec(line)?.[0].length ?? 0))
    return parseMapping(continuation.map(line => line.slice(indent)), depth + 1) as FrontmatterMapping
  }
  const more = continuation.map(line => line.trim()).filter(Boolean)
  if (more.length > 0 && !head.startsWith('"') && !head.startsWith("'")) {
    return parseScalar([head, ...more].join(' '))
  }
  return parseScalar(head)
}

function parseBlockScalar(style: '|' | '>', chomp: string, lines: string[]): string {
  const indents = lines.filter(line => line.trim() !== '').map(line => /^\s*/.exec(line)?.[0].length ?? 0)
  const indent = indents.length === 0 ? 0 : Math.min(...indents)
  const content = lines.map(line => line.slice(indent))
  while (content.length > 0 && content.at(-1)?.trim() === '' && chomp !== '+') content.pop()
  let text = ''
  if (style === '|') {
    text = content.join('\n')
  } else {
    content.forEach((line, i) => {
      if (i === 0) text = line
      else if (line === '') text += '\n'
      else if (content[i - 1] === '' || /^\s/.test(line)) text += line
      else text += ` ${line}`
    })
  }
  return chomp === '-' ? text : `${text}\n`
}

function parseScalar(text: string): FrontmatterValue {
  const value = text.trim()
  if (value.startsWith('"')) return JSON.parse(value.slice(0, closingDoubleQuote(value) + 1)) as string
  if (value.startsWith("'")) {
    const end = closingSingleQuote(value)
    return value.slice(1, end).replaceAll("''", "'")
  }
  const plain = value.replace(/\s+#.*$/, '')
  if (plain === 'true') return true
  if (plain === 'false') return false
  if (plain === '' || plain === '~' || plain === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain)
  return plain
}

function closingDoubleQuote(value: string): number {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === '\\') index += 1
    else if (value[index] === '"') return index
  }
  return value.length - 1
}

function closingSingleQuote(value: string): number {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== "'") continue
    if (value[index + 1] === "'") index += 1
    else return index
  }
  return value.length
}

function stripCr(line: string): string {
  return line.replace(/\r$/, '')
}
