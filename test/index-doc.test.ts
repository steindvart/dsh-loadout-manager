import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIndexDocument, relativePath } from '../src/host/index-doc.ts'

const valid = JSON.stringify({
  format: 1,
  title: 'Team loadout',
  description: 'Skills and rules the team shares.',
  skills: [
    { name: 'tdd', description: 'Test first.', version: 1.2, tags: ['testing', 'testing'], path: 'skills/tdd' },
    { name: 'release', path: '.' },
    { name: 'remote', path: 'archives/remote.tar.gz', files: ['SKILL.md', 'docs/notes.md'] },
  ],
  rules: [
    { name: 'russian-docs', description: 'Russian prose.', version: '2.0.0', path: 'rules/russian-docs.md' },
    { name: 'commits', path: 'rules/commits.md' },
  ],
})

test('parses a complete index: defaults, numeric versions, tags deduplicated', () => {
  const document = parseIndexDocument(valid, 'loadout-index.json')
  assert.equal(document.title, 'Team loadout')
  assert.equal(document.description, 'Skills and rules the team shares.')
  assert.deepEqual(document.skills[0], {
    name: 'tdd', description: 'Test first.', version: '1.2', tags: ['testing'], path: 'skills/tdd', files: undefined,
  })
  assert.deepEqual(document.skills[1], {
    name: 'release', description: undefined, version: undefined, tags: [], path: '.', files: undefined,
  })
  assert.deepEqual(document.skills[2]?.files, ['SKILL.md', 'docs/notes.md'])
  assert.deepEqual(document.rules, [
    { name: 'russian-docs', description: 'Russian prose.', version: '2.0.0', tags: [], path: 'rules/russian-docs.md' },
    { name: 'commits', description: undefined, version: undefined, tags: [], path: 'rules/commits.md' },
  ])
})

test('an index with only a title is valid; missing sections read as empty', () => {
  assert.deepEqual(parseIndexDocument('{"title":"Empty"}', 'index.json'), { title: 'Empty', description: undefined, skills: [], rules: [] })
  assert.deepEqual(parseIndexDocument('{}', 'index.json'), { title: undefined, description: undefined, skills: [], rules: [] })
})

test('rejects a malformed document with the JSON path of the offending value', () => {
  const cases: Array<[string, RegExp]> = [
    ['not json', /index\.json is not valid JSON/],
    ['[]', /document must be a JSON object/],
    ['{"format":2}', /format: unsupported format 2/],
    ['{"skills":"x"}', /skills: must be an array/],
    ['{"skills":[{"path":"x"}]}', /skills\[0\]\.name/],
    ['{"skills":[{"name":"Bad_Name","path":"x"}]}', /kebab-case/],
    ['{"skills":[{"name":"ok","path":"../x"}]}', /not a safe relative path/],
    ['{"skills":[{"name":"ok","path":"/etc"}]}', /relative to the source root/],
    ['{"skills":[{"name":"ok","path":"x/.git/y"}]}', /not a safe relative path/],
    ['{"skills":[{"name":"ok","path":"x","files":[]}]}', /files must be a non-empty array/],
    ['{"skills":[{"name":"ok","path":"x"},{"name":"ok","path":"y"}]}', /duplicate skill "ok"/],
    ['{"rules":[{"name":"ok","path":"x.txt"}]}', /must name a \.md file/],
    ['{"rules":[{"name":"Bad Name","path":"x.md"}]}', /rules\[0\]\.name/],
    ['{"title":""}', /title: must be a non-empty string/],
  ]
  for (const [text, pattern] of cases) assert.throws(() => parseIndexDocument(text, 'index.json'), pattern)
})

test('a relative path accepts "." as the source root and rejects escaping forms', () => {
  assert.equal(relativePath('.', 'p', 'x'), '.')
  assert.equal(relativePath('a\\b\\c', 'p', 'x'), 'a/b/c')
  assert.equal(relativePath('skills/tdd/', 'p', 'x'), 'skills/tdd')
  for (const bad of ['', '/a', 'a//b', 'a/./b', 'a/../b', './a', 'a\\..\\b', '.git/x', 'a\0b']) {
    assert.throws(() => relativePath(bad, 'p', 'x'), /p: x/, `rejects ${JSON.stringify(bad)}`)
  }
})
