/**
 * YAML frontmatter of skill and rule files. Supports the subset skill authors
 * use: top-level `key: value` pairs with plain, quoted, and block scalars.
 * Nested mappings and lists are skipped.
 */

/**
 * @param {string} raw - file text
 * @returns {{ data: Record<string, string|boolean|number|null>, body: string } | undefined}
 *   `undefined` when the file has no frontmatter fence.
 */
export function parseFrontmatter(raw) {
  const lines = raw.split('\n')
  if (stripCr(lines[0]) !== '---') return undefined
  const closing = lines.findIndex((line, index) => index > 0 && stripCr(line) === '---')
  if (closing < 0) return undefined
  const data = {}
  const yaml = lines.slice(1, closing).map(stripCr)
  let index = 0
  while (index < yaml.length) {
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(yaml[index])
    index += 1
    if (!match) continue
    const head = (match[2] ?? '').trim()
    const continuation = []
    while (index < yaml.length && (yaml[index].trim() === '' || /^\s/.test(yaml[index]))) {
      continuation.push(yaml[index])
      index += 1
    }
    data[match[1]] = parseValue(head, continuation)
  }
  return { data, body: lines.slice(closing + 1).join('\n') }
}

function parseValue(head, continuation) {
  const block = /^([|>])([+-]?)\s*(?:#.*)?$/.exec(head)
  if (block) return parseBlockScalar(block[1], block[2], continuation)
  if (head === '' && continuation.some(line => line.trim() !== '')) return null
  const more = continuation.map(line => line.trim()).filter(Boolean)
  if (more.length > 0 && !head.startsWith('"') && !head.startsWith("'")) {
    return parseScalar([head, ...more].join(' '))
  }
  return parseScalar(head)
}

function parseBlockScalar(style, chomp, lines) {
  const indent = Math.min(...lines.filter(line => line.trim() !== '').map(line => /^\s*/.exec(line)[0].length))
  const content = lines.map(line => line.slice(indent))
  while (content.length > 0 && content.at(-1).trim() === '' && chomp !== '+') content.pop()
  let text
  if (style === '|') {
    text = content.join('\n')
  } else {
    text = ''
    content.forEach((line, i) => {
      if (i === 0) text = line
      else if (line === '') text += '\n'
      else if (content[i - 1] === '' || /^\s/.test(line)) text += line
      else text += ` ${line}`
    })
  }
  if (chomp === '-') return text
  if (chomp === '+') return `${text}\n`
  return `${text}\n`
}

function parseScalar(text) {
  const value = text.trim()
  if (value.startsWith('"')) return JSON.parse(value.slice(0, closingDoubleQuote(value) + 1))
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

function closingDoubleQuote(value) {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === '\\') index += 1
    else if (value[index] === '"') return index
  }
  return value.length - 1
}

function closingSingleQuote(value) {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== "'") continue
    if (value[index + 1] === "'") index += 1
    else return index
  }
  return value.length
}

function stripCr(line) {
  return line === undefined ? undefined : line.replace(/\r$/, '')
}
