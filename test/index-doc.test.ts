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
    ['{"format":3}', /format: unsupported format 3/],
    ['{"skills":"x"}', /skills: must be an array/],
    ['{"skills":[{"path":"x"}]}', /skills\[0\]\.name/],
    ['{"skills":[{"name":"Bad_Name","path":"x"}]}', /kebab-case/],
    ['{"skills":[{"name":"ok","path":"../x"}]}', /not a safe relative path/],
    ['{"skills":[{"name":"ok","path":"/etc"}]}', /relative to the source root/],
    ['{"skills":[{"name":"ok","path":"C:/skills"}]}', /relative to the source root/],
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

const REGISTRY = 'http://127.0.0.1:8081/repository/npm-group'
const npmVersion = (version: string, pkg = '@team-skills/tdd', registry = REGISTRY) => ({
  version, publishTimestamp: 1_790_000_000, source: { type: 'npm', package: pkg, registry },
})
const npmIndex = (skills: unknown[], rules: unknown[] = []) => JSON.stringify({ format: 2, title: 'Team', skills, rules })

test('format 2 pins the version dist-tags.latest names', () => {
  const document = parseIndexDocument(npmIndex([{
    name: 'tdd',
    description: 'Test first.',
    tags: ['testing'],
    repository: { url: 'https://git.example/team/loadout', directory: 'skills/tdd' },
    'dist-tags': { latest: '1.9.0', next: '2.0.0-rc.1' },
    versions: [npmVersion('2.0.0-rc.1'), npmVersion('1.10.0'), npmVersion('1.9.0')],
  }]), 'index.json')
  assert.deepEqual(document.skills, [{
    name: 'tdd',
    description: 'Test first.',
    version: '1.9.0',
    tags: ['testing'],
    path: '@team-skills/tdd@1.9.0',
    files: undefined,
    npm: { package: '@team-skills/tdd', version: '1.9.0', registry: `${REGISTRY}/` },
  }])
})

test('format 2 without latest pins the highest release, else the highest prerelease', () => {
  const pinned = (versions: string[]) => parseIndexDocument(npmIndex([{ name: 'tdd', versions: versions.map(v => npmVersion(v)) }]), 'i').skills[0]?.npm?.version
  assert.equal(pinned(['1.9.0', '1.10.0', '2.0.0-rc.1']), '1.10.0')
  assert.equal(pinned(['2.0.0-rc.1', '2.0.0-rc.10', '2.0.0-rc.2']), '2.0.0-rc.10')
})

test('format 2 rules pin a package the same way, and each version keeps its own source', () => {
  const document = parseIndexDocument(npmIndex([], [{
    name: 'be-brief',
    versions: [npmVersion('1.0.0', '@old/be-brief', 'https://old.example/npm/'), npmVersion('1.1.0', '@team-rules/be-brief')],
  }]), 'index.json')
  assert.deepEqual(document.rules[0], {
    name: 'be-brief',
    description: undefined,
    version: '1.1.0',
    tags: [],
    path: '@team-rules/be-brief@1.1.0',
    npm: { package: '@team-rules/be-brief', version: '1.1.0', registry: `${REGISTRY}/` },
  })
})

test('rejects a malformed format 2 entry with the JSON path of the offending value', () => {
  const skill = (entry: Record<string, unknown>) => npmIndex([{ name: 'tdd', versions: [npmVersion('1.0.0')], ...entry }])
  const cases: Array<[string, RegExp]> = [
    [skill({ versions: [] }), /skills\[0\]\.versions: must be a non-empty array/],
    [npmIndex([{ name: 'tdd', path: 'skills/tdd' }]), /skills\[0\]\.versions: must be a non-empty array/],
    [skill({ versions: [npmVersion('1.0')] }), /versions\[0\]\.version: .*exact SemVer/],
    [skill({ versions: [npmVersion('1.0.0'), npmVersion('1.0.0')] }), /versions\[1\]\.version: duplicate version "1\.0\.0"/],
    [skill({ versions: [{ ...npmVersion('1.0.0'), publishTimestamp: -1 }] }), /versions\[0\]\.publishTimestamp/],
    [skill({ versions: [{ ...npmVersion('1.0.0'), source: { type: 'git', url: 'https://x' } }] }), /versions\[0\]\.source\.type: unsupported source type "git"/],
    [skill({ versions: [npmVersion('1.0.0', 'Bad Name')] }), /versions\[0\]\.source\.package: .*npm package name/],
    [skill({ versions: [npmVersion('1.0.0', '@team/tdd', 'ftp://x/')] }), /versions\[0\]\.source\.registry: .*http\(s\) URL/],
    [skill({ versions: [npmVersion('1.0.0', '@team/tdd', 'https://u:p@x/')] }), /versions\[0\]\.source\.registry: .*credentials/],
    [skill({ versions: [npmVersion('1.0.0', '@team/tdd', 'https://x/npm?a=1')] }), /versions\[0\]\.source\.registry: .*query or fragment/],
    [skill({ 'dist-tags': { latest: '9.9.9' } }), /skills\[0\]\.dist-tags\.latest: "9\.9\.9" is not a listed version/],
    [skill({ 'dist-tags': [] }), /skills\[0\]\.dist-tags: must be an object/],
  ]
  for (const [text, pattern] of cases) assert.throws(() => parseIndexDocument(text, 'index.json'), pattern)
})
