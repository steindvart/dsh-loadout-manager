import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter } from '../src/host/frontmatter.js'

test('reads plain name and description and returns the body after the closing fence', () => {
  const parsed = parseFrontmatter('---\nname: tdd\ndescription: Test-driven development.\n---\n# Body\n\ntext\n')
  assert.deepEqual(parsed, {
    data: { name: 'tdd', description: 'Test-driven development.' },
    body: '# Body\n\ntext\n',
  })
})

test('unquotes single- and double-quoted scalars and reads booleans', () => {
  const parsed = parseFrontmatter([
    '---',
    `name: "quoted: \\"x\\""`,
    `description: 'it''s fine # not a comment'`,
    'disable-model-invocation: true',
    'user-invocable: no',
    '---',
    '',
  ].join('\n'))
  assert.deepEqual(parsed.data, {
    name: 'quoted: "x"',
    description: "it's fine # not a comment",
    'disable-model-invocation': true,
    'user-invocable': 'no',
  })
})

test('strips a trailing comment from a plain scalar', () => {
  const parsed = parseFrontmatter('---\nname: tdd # the skill\n---\n')
  assert.equal(parsed.data.name, 'tdd')
})

test('reads folded and literal block scalars with chomping indicators', () => {
  const parsed = parseFrontmatter([
    '---',
    'description: >',
    '  Folded lines',
    '  join with spaces.',
    '',
    '  New paragraph.',
    'literal: |',
    '  line one',
    '    indented',
    'strip: >-',
    '  no newline',
    'keep: |+',
    '  kept',
    '',
    'name: after',
    '---',
    '',
  ].join('\n'))
  assert.deepEqual(parsed.data, {
    description: 'Folded lines join with spaces.\nNew paragraph.\n',
    literal: 'line one\n  indented\n',
    strip: 'no newline',
    keep: 'kept\n\n',
    name: 'after',
  })
})

test('joins a multi-line plain scalar with spaces', () => {
  const parsed = parseFrontmatter('---\ndescription: first line\n  continues here\nname: x\n---\n')
  assert.equal(parsed.data.description, 'first line continues here')
})

test('skips nested mappings and lists without leaking their keys', () => {
  const parsed = parseFrontmatter('---\nname: x\nmetadata:\n  version: 2\ntags:\n  - a\n  - b\ndescription: d\n---\n')
  assert.deepEqual(parsed.data, { name: 'x', metadata: null, tags: null, description: 'd' })
})

test('returns undefined without an opening or closing fence and handles CRLF', () => {
  assert.equal(parseFrontmatter('# Just markdown\n'), undefined)
  assert.equal(parseFrontmatter('---\nname: x\n'), undefined)
  assert.deepEqual(parseFrontmatter('---\r\nname: x\r\n---\r\nbody\r\n'), { data: { name: 'x' }, body: 'body\r\n' })
})
