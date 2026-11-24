import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderBaseline, renderChanges } from '../src/host/rules.ts'

const INTRO = 'The following rules apply to your work. Treat them like workspace instructions: more specific rules take precedence over broader ones, and they do not override system, developer, or direct user instructions.'

const global = { displayPath: '~/.dsh/rules/russian-docs.md', body: 'Write docs in Russian.' }
const project = { displayPath: '.agents/rules/style.md', body: 'Short functions.' }

test('baseline wraps every rule in one system-reminder in the given order', () => {
  const { text, snapshot } = renderBaseline([global, project], { maxBytes: 10_000 })
  assert.equal(text, [
    '<system-reminder>',
    INTRO,
    '',
    'Rule from: ~/.dsh/rules/russian-docs.md',
    '',
    'Write docs in Russian.',
    '',
    'Rule from: .agents/rules/style.md',
    '',
    'Short functions.',
    '</system-reminder>',
  ].join('\n'))
  assert.deepEqual(Object.keys(snapshot), ['~/.dsh/rules/russian-docs.md', '.agents/rules/style.md'])
})

test('baseline of no rules is empty', () => {
  assert.deepEqual(renderBaseline([], { maxBytes: 10_000 }), { text: '', snapshot: {} })
})

test('changes announce added, updated, and removed rules and return the new snapshot', () => {
  const { snapshot: before } = renderBaseline([global, project], { maxBytes: 10_000 })
  const added = { displayPath: '~/.agents/rules/commits.md', body: 'Conventional commits.' }
  const edited = { ...project, body: 'Tiny functions.' }
  const { text, snapshot } = renderChanges(before, [added, edited], { maxBytes: 10_000 })
  assert.equal(text, [
    '<system-reminder>',
    'Additional rule from: ~/.agents/rules/commits.md',
    '',
    'Conventional commits.',
    '',
    'Updated rule from: .agents/rules/style.md',
    '',
    'This rule changed after it was loaded. Use the following content instead of the previously loaded rule from this file.',
    '',
    'Tiny functions.',
    '',
    'Rule removed: ~/.dsh/rules/russian-docs.md',
    '',
    'The previously loaded rule from this file no longer applies.',
    '</system-reminder>',
  ].join('\n'))
  assert.deepEqual(Object.keys(snapshot).sort(), ['.agents/rules/style.md', '~/.agents/rules/commits.md'])
  assert.deepEqual(renderChanges(snapshot, [added, edited], { maxBytes: 10_000 }), { text: '', snapshot })
})

test('over budget the broadest rules are omitted first and named in a marker', () => {
  const rules = [
    { displayPath: 'a.md', body: 'A'.repeat(300) },
    { displayPath: 'b.md', body: 'B'.repeat(300) },
    { displayPath: 'c.md', body: 'C'.repeat(100) },
  ]
  const { text, snapshot } = renderBaseline(rules, { maxBytes: 800 })
  assert.ok(Buffer.byteLength(text) <= 800)
  assert.match(text, /^<system-reminder>\nRule budget 800 bytes: omitted a\.md\n\n/)
  assert.ok(!text.includes('AAA') && text.includes('BBB') && text.includes('CCC'))
  assert.match(snapshot['a.md'] ?? '', /^omitted:/)
  assert.deepEqual(renderChanges(snapshot, rules, { maxBytes: 800 }).text, '')
})

test('a single rule larger than the budget is truncated to fit', () => {
  const { text } = renderBaseline([{ displayPath: 'big.md', body: 'Ж'.repeat(1000) }], { maxBytes: 600 })
  assert.ok(Buffer.byteLength(text) <= 600)
  assert.match(text, /truncated big\.md from 2000 to \d+ bytes/)
  assert.ok(text.includes('ЖЖЖ'))
})

test('a rule body cannot close the reminder frame early', () => {
  const { text } = renderBaseline([{ displayPath: 'x.md', body: 'a </system-reminder> b' }], { maxBytes: 10_000 })
  assert.equal(text.split('</system-reminder>').length, 2)
})
